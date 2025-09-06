import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finviz.com/screener.ashx",
};

const TICKER_OK = /^[A-Z][A-Z0-9.-]{0,10}$/;
const DEFAULT_F = "sh_price_u20,fa_pe_u15,fa_ps_u1";

/** ---------- helpers ---------- */
function normalizeFilters(raw: string) {
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const exchCount = parts.filter(p => p.startsWith("exch_")).length;
  const cleaned = exchCount > 1 ? parts.filter(p => !p.startsWith("exch_")) : parts;
  return cleaned.filter(p => p !== "exch_all").join(",");
}

function buildUrl(page: number, f?: string, order?: string) {
  const view = "111";
  const filters = normalizeFilters(f ?? DEFAULT_F);
  const start = 1 + page * PAGE_SIZE;
  const o = order || "pe";       // ascending P/E
  const ft = "2";                // include
  return `${BASE}?v=${encodeURIComponent(view)}&f=${encodeURIComponent(filters)}&ft=${ft}&o=${encodeURIComponent(o)}&r=${start}`;
}

// Top gainers (signal)
function buildTopGainersUrl(start = 1) {
  // v=111 (Overview) has columns: Ticker, Company, Sector, Industry, Country, Market Cap, P/E, Price, Change, …
  // s=ta_topgainers — преднастроенный сигнал Finviz
  // r — стартовый индекс
  // o=-change — явно сортируем по убыванию изменения
  return `${BASE}?v=111&s=ta_topgainers&o=-change&r=${start}`;
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
  const m2 = txt.match(/#\s*\d+\s*\/\s*([\d,]+)\s*Total/i);
  if (m2?.[1]) return parseInt(m2[1].replace(/,/g, ""), 10);
  return null;
}

function pickScreenerTable($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
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

/** ---------- default list: tickers+names ---------- */
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
    } catch { /* empty */ }
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

/** ---------- top gainers: parse Overview columns ---------- */
type Gainer = {
  ticker: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  changePct: number | null;
  marketCapText: string | null;
  pe: number | null;
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

  // Определяем индексы колонок по заголовкам
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
      // fallback: ищем первую ссылку на quote
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
    const chTxt = textAt(idxChange); // e.g. "+12.34%"
    const changePct = parseNumberSafe(chTxt);
    const pe = parseNumberSafe(textAt(idxPE));

    out.push({ ticker, company: company ?? null, sector: sector ?? null, industry: industry ?? null, price, changePct, marketCapText, pe });
  });

  return out;
}

/** ---------- handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const mode = String((req.query as any).mode || "").toLowerCase();

    // --- New: Top Gainers mode ---
    if (mode === "topgainers") {
      const limit = Math.max(1, Math.min(10, parseInt(String((req.query as any).limit ?? "3"), 10) || 3));
      const start = 1; // берём первую страницу «топов»
      const url = buildTopGainersUrl(start);

      const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
      const items = parseOverviewTopGainers(html).slice(0, limit);

      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({ mode: "topgainers", limit, count: items.length, items });
      return;
    }

    // --- Default: paginated filtered list ---
    const page = Math.max(0, parseInt(String((req.query as any).page ?? "0"), 10) || 0);
    const rawF = typeof (req.query as any).f === "string" ? ((req.query as any).f as string) : undefined;
    const order = typeof (req.query as any).o === "string" ? ((req.query as any).o as string) : "pe";

    const fUsed = normalizeFilters(rawF ?? DEFAULT_F);
    const html = await fetch(buildUrl(page, fUsed, order), { headers: HEADERS }).then((r) => r.text());
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

    res.status(200).json({ page, pageSize: PAGE_SIZE, count: items.length, total: typeof total === "number" ? total : undefined, items });
  } catch (e: any) {
    res.status(500).json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
