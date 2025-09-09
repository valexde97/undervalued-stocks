// /api/[...all].ts
export const runtime = "nodejs";

import * as cheerio from "cheerio";
import { llmCommentary } from "./_handlers/llmCommentary";

/* ------------------------- utils ------------------------- */
function sendJSON(res: any, code: number, obj: any) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
function allowCORS(req: any, res: any) {
  const method = req.method || "GET";
  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.statusCode = 204;
    res.end();
    return true;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  return false;
}

/* ---------------- in-memory cache & retries --------------- */
type CacheEntry<T> = { exp: number; data: T };
const MEM_CAP = 256;
const mem = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

function getMem<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { mem.delete(key); return null; }
  return e.data as T;
}
function putMem<T>(key: string, data: T, ttlMs: number) {
  if (ttlMs <= 0) return;
  if (mem.size >= MEM_CAP) {
    const firstKey = mem.keys().next().value;
    if (firstKey) mem.delete(firstKey);
  }
  mem.set(key, { exp: Date.now() + ttlMs, data });
}
async function fetchTextWithRetries(url: string, init?: RequestInit, tries = 4): Promise<string> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        lastErr = new Error(`${r.status} ${r.statusText}`);
      } else if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}`);
      } else {
        return await r.text();
      }
    } catch (e: any) {
      lastErr = e;
    }
    const backoff = 300 * Math.pow(2, i) + Math.floor(Math.random() * 250);
    await new Promise(r => setTimeout(r, backoff));
  }
  throw lastErr || new Error("Upstream failed");
}

/* ----------------------- FINVIZ --------------------------- */
const PAGE_SIZE = 20;
const FINVIZ_BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const FINVIZ_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finviz.com/screener.ashx",
};

const TICKER_OK = /^[A-Z][A-Z0-9.-]{0,10}$/;
const DEFAULT_F = "sh_price_u20,fa_pe_u15,fa_ps_u1";

function normalizeFilters(raw: string) {
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const exchCount = parts.filter(p => p.startsWith("exch_")).length;
  const cleaned = exchCount > 1 ? parts.filter(p => !p.startsWith("exch_")) : parts;
  return cleaned.filter(p => p !== "exch_all").join(",");
}
function buildFinvizUrl(page: number, f?: string, order?: string) {
  const view = "111";
  const filters = normalizeFilters(f ?? DEFAULT_F);
  const start = 1 + page * PAGE_SIZE;
  const o = order || "pe";
  const ft = "2";
  return `${FINVIZ_BASE}?v=${encodeURIComponent(view)}&f=${encodeURIComponent(filters)}&ft=${ft}&o=${encodeURIComponent(o)}&r=${start}`;
}
function buildTopGainersUrl(start = 1) {
  return `${FINVIZ_BASE}?v=111&s=ta_topgainers&o=-change&r=${start}`;
}
function sanitizeCompany(s?: string | null) {
  if (!s) return null;
  const t = s.trim();
  if (!t || t === "-" || /^filters:/i.test(t) || /\bexport\b/i.test(t)) return null;
  return t;
}
function parseTotalText(txt: string): number | null {
  const m1 = txt.match(/Total:\s*([\d,]+)/i);
  if (m1?.[1]) return parseInt(m1[1].replace(/,/g, ""), 10);
  const m2 = txt.match(/#\s*\d+\s*\/\s*([\д,]+)\s*Total/i);
  if (m2?.[1]) return parseInt(m2[1].replace(/,/g, ""), 10);
  return null;
}
function pickScreenerTable($: cheerio.CheerioAPI) {
  type BestTable = { $t: cheerio.Cheerio<any>; rows: number };
  let best: BestTable | null = null;
  $("table").each((_i, el) => {
    const $t = $(el);
    const $rows = ($t.find("tbody tr").length ? $t.find("tbody tr") : $t.find("tr").slice(1))
      .filter((_, tr) => $(tr).find('a[href*="quote.ashx?t="]').length > 0);
    const cnt = $rows.length;
    if (!best || cnt > best.rows) best = { $t, rows: cnt };
  });
  return best ? best.$t : null;
}
function parseTickersAndNames(html: string) {
  const $ = cheerio.load(html);
  const $table = pickScreenerTable($);
  if (!$table) return { items: [] as Array<{ ticker: string; company: string | null }>, total: parseTotalText($.text()) };

  const $rows = ($table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr").slice(1))
    .filter((_, tr) => $(tr).find('a[href*="quote.ashx?t="]').length > 0);

  const out: Array<{ ticker: string; company: string | null }> = [];
  const seen = new Set<string>();

  $rows.each((_r, tr) => {
    const $tr = $(tr);
    const $tds = $tr.find("td");
    if (!$tds.length) return;

    let linkIdx = -1;
    $tds.each((i, td) => {
      if ($(td).find('a[href*="quote.ashx?t="]').length > 0) linkIdx = i;
    });
    if (linkIdx < 0) return;

    const $link = $($tds.get(linkIdx)).find('a[href*="quote.ashx?t="]').first();
    let ticker: string | null = null;
    const href = $link.attr("href") || "";
    try {
      const u = new URL(href, "https://finviz.com/");
      ticker = (u.searchParams.get("t") || "").toUpperCase().trim();
    } catch {}
    if (!ticker) ticker = ($link.text() || "").toUpperCase().trim();
    if (!ticker || !TICKER_OK.test(ticker)) return;
    if (seen.has(ticker)) return;

    let company: string | null = null;
    if (linkIdx + 1 < $tds.length) company = sanitizeCompany($($tds.get(linkIdx + 1)).text());

    out.push({ ticker, company });
    seen.add(ticker);
  });

  return { items: out.slice(0, PAGE_SIZE), total: parseTotalText($.text()) };
}
type Gainer = {
  ticker: string; company: string | null; sector: string | null; industry: string | null;
  price: number | null; changePct: number | null; marketCapText: string | null; pe: number | null;
};
function parseNumberSafe(s?: string | null): number | null {
  if (!s) return null;
  const t = s.replace(/[,%]/g, "").trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function parseOverviewTopGainers(html: string): Gainer[] {
  const $ = cheerio.load(html);
  const $table = pickScreenerTable($);
  if (!$table) return [];

  const $headRow = $table.find("thead tr").first().length
    ? $table.find("thead tr").first()
    : $table.find("tr").first();

  const headers = $headRow.find("th,td").toArray().map(th => $(th).text().trim().toLowerCase());

  function idxOf(...names: string[]) {
    for (const n of names) {
      const i = headers.findIndex(h => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  }

  const idxTicker = idxOf("ticker");
  const idxCompany = idxOf("company");
  const idxSector = idxOf("sector");
  const idxIndustry = idxOf("industry");
  const idxMarketCap = idxOf("market cap", "market capitalization");
  const idxPE = idxOf("p/e", "pe");
  const idxPrice = idxOf("price");
  const idxChange = idxOf("change");

  const $rows = ($table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr").slice(1))
    .filter((_, tr) => $(tr).find('a[href*="quote.ashx?t="]').length > 0);

  const out: Gainer[] = [];

  $rows.each((_i, tr) => {
    const $tds = $(tr).find("td");
    if (!$tds.length) return;

    let ticker = "";
    if (idxTicker >= 0) {
      const $a = $($tds.get(idxTicker)).find('a[href*="quote.ashx?t="]').first();
      ticker = ($a.text() || "").toUpperCase().trim();
    } else {
      const $a = $(tr).find('a[href*="quote.ashx?t="]').first();
      ticker = ($a.text() || "").toUpperCase().trim();
    }
    if (!ticker || !TICKER_OK.test(ticker)) return;

    const textAt = (idx: number) => (idx >= 0 && idx < $tds.length ? ($($tds.get(idx)).text() || "").trim() : "");

    const company = sanitizeCompany(textAt(idxCompany));
    const sector = sanitizeCompany(textAt(idxSector));
    const industry = sanitizeCompany(textAt(idxIndustry));
    const marketCapText = sanitizeCompany(textAt(idxMarketCap)) ?? null;

    const price = parseNumberSafe(textAt(idxPrice));
    const chTxt = textAt(idxChange);
    const changePct = parseNumberSafe(chTxt);
    const pe = parseNumberSafe(textAt(idxPE));

    out.push({ ticker, company: company ?? null, sector: sector ?? null, industry: industry ?? null, price, changePct, marketCapText, pe });
  });

  return out;
}

async function handleFinviz(req: any, res: any, url: URL) {
  const mode = String(url.searchParams.get("mode") || "").toLowerCase();

  if (mode === "topgainers") {
    const limit = Math.max(1, Math.min(10, parseInt(String(url.searchParams.get("limit") ?? "3"), 10) || 3));
    const key = `tg:1`;
    const ttlMs = 60_000; // 60s

    let html = getMem<string>(key);
    if (!html) {
      const p = inflight.get(key) ?? fetchTextWithRetries(buildTopGainersUrl(1), { headers: FINVIZ_HEADERS });
      inflight.set(key, p);
      html = await p.finally(() => inflight.delete(key));
      putMem(key, html, ttlMs);
      res.setHeader("X-Cache", "MISS");
    } else {
      res.setHeader("X-Cache", "HIT");
    }

    const items = parseOverviewTopGainers(html).slice(0, limit);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ mode: "topgainers", limit, count: items.length, items });
  }

  const page = Math.max(0, parseInt(String(url.searchParams.get("page") ?? "0"), 10) || 0);
  const rawF = url.searchParams.get("f") ?? undefined;
  const order = url.searchParams.get("o") ?? "pe";

  const fUsed = normalizeFilters(rawF ?? DEFAULT_F);
  const apiUrl = buildFinvizUrl(page, fUsed, order);
  const key = `list:${page}:${fUsed}:${order}`;
  const ttlMs = 600_000; // 10m

  let html = getMem<string>(key);
  if (!html) {
    const p = inflight.get(key) ?? fetchTextWithRetries(apiUrl, { headers: FINVIZ_HEADERS });
    inflight.set(key, p);
    html = await p.finally(() => inflight.delete(key));
    putMem(key, html, ttlMs);
    res.setHeader("X-Cache", "MISS");
  } else {
    res.setHeader("X-Cache", "HIT");
  }

  const { items, total } = parseTickersAndNames(html);

  let hasMore = items.length === PAGE_SIZE;
  if (!hasMore) {
    if (typeof total === "number") hasMore = (page + 1) * PAGE_SIZE < total;
    else hasMore = items.length > 0;
  }

  res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
  res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
  res.setHeader("X-Finviz-EffectiveF", fUsed);
  if (typeof total === "number") res.setHeader("X-Finviz-Total", String(total));
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
  res.setHeader("Content-Type", "application/json");

  return res.status(200).json({ page, pageSize: PAGE_SIZE, count: items.length, total: typeof total === "number" ? total : undefined, items });
}

/* ------------------------ FINNHUB ------------------------- */
type Quote = { c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number; serverTs?: number };
function parseRetryAfterMs(h?: string | null) {
  if (!h) return 0;
  const s = h.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
  const d = Date.parse(s);
  return Number.isNaN(d) ? 0 : Math.max(0, d - Date.now());
}

async function handleFhQuote(req: any, res: any, url: URL) {
  const symbol = (url.searchParams.get("symbol") || "").trim();
  if (!symbol) return sendJSON(res, 400, { error: "symbol required" });

  const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
  if (!token) return sendJSON(res, 500, { error: "FINNHUB token not set" });

  const ttlParamSec = Math.max(0, Math.min(300, parseInt(String(url.searchParams.get("ttl") ?? ""), 10) || 15));
  const nocache = url.searchParams.get("nocache") === "1";
  const key = `fh:${symbol.toUpperCase()}`;

  if (!nocache) {
    const cached = getMem<Quote>(key);
    if (cached) {
      res.setHeader("Cache-Control", `s-maxage=${ttlParamSec}, stale-while-revalidate=${ttlParamSec * 3}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).end(JSON.stringify(cached));
    }
  }

  const upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  let lastErr: any;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(upstream, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        lastErr = new Error(`${r.status} ${r.statusText}`);
        const ra = parseRetryAfterMs(r.headers.get("Retry-After"));
        const back = (250 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
        await new Promise(res => setTimeout(res, Math.max(ra, back)));
        continue;
      }
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return sendJSON(res, r.status, { error: `${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}` });
      }
      const json = (await r.json()) as Quote;
      const out: Quote = { ...(json || {}), serverTs: Date.now() };

      if (!nocache && ttlParamSec > 0) putMem(key, out, ttlParamSec * 1000);

      res.setHeader("Cache-Control", `s-maxage=${ttlParamSec}, stale-while-revalidate=${ttlParamSec * 3}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "MISS");
      return res.status(200).end(JSON.stringify(out));
    } catch (e: any) {
      lastErr = e;
      const back = (250 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
      await new Promise(res => setTimeout(res, back));
    }
  }
  return sendJSON(res, 500, { error: String(lastErr?.message || lastErr || "Upstream failed") });
}

/* ------------------------- main --------------------------- */
export default async function handler(req: any, res: any) {
  try {
    if (allowCORS(req, res)) return;

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
    const method = req.method || "GET";

    // --- LLM commentary (requires ./_handlers/llmCommentary) ---
    if (method === "POST" && (path === "llm/commentary" || path === "llm/commentary/")) {
      return llmCommentary(req, res);
    }

    // --- Finviz ---
    if (method === "GET" && (path === "finviz" || path === "finviz/")) {
      return handleFinviz(req, res, url);
    }

    // --- Finnhub quote ---
    if (method === "GET" && (path === "fh/quote" || path === "fh/quote/")) {
      return handleFhQuote(req, res, url);
    }

    // --- Diagnostics ---
    if (method === "GET" && path === "debug/env") {
      const yes = (v: any) => Boolean(v);
      return sendJSON(res, 200, {
        ok: true,
        OPENAI_API_KEY: yes(process.env.OPENAI_API_KEY),
        OPENAI_MODEL: process.env.OPENAI_MODEL || null,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || null,
        FINNHUB_TOKEN: yes(process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN),
        node: process.version,
        path,
        method
      });
    }
    if (method === "GET" && path === "_whoami") {
      return sendJSON(res, 200, { ok: true, path, method, note: "catch-all alive" });
    }

    return sendJSON(res, 404, { error: "Not Found", path, method });
  } catch (e: any) {
    return sendJSON(res, 500, { error: String(e?.message || e) });
  }
}
