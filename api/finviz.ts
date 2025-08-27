// /api/finviz.ts
export const runtime = "nodejs";
import * as cheerio from "cheerio";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// ft=2 — плоская таблица на 20 строк
function buildUrl(page: number, f: string, v: "121" | "111") {
  const start = 1 + page * 20; // 1,21,41...
  return `${BASE}?v=${v}&f=${encodeURIComponent(f)}&r=${start}&ft=2`;
}

function toNum(s?: string | null): number | null {
  if (!s) return null;
  const x = s.replace(/[,%$]/g, "").replace(/,/g, "").trim();
  if (!x || x === "-" || x === "—") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const TICKER_OK = /^[A-Z][A-Z0-9.\-]*$/;

function pickMainTable($: any) {
  const metas = $("table")
    .toArray()
    .map((el: any) => {
      const $t = $(el);
      const headers = $t
        .find("thead th, thead td, tr:first-child th, tr:first-child td")
        .toArray()
        .map((th: any) => $(th).text().trim().toLowerCase());
      const hasTickerHeader = headers.some((h: string) => h.includes("ticker"));
      const quoteLinks = $t.find('a[href*="quote.ashx?t="],a[href*="quote.ashx?"]').length;
      const bodyRows = $t.find("tbody tr").length || $t.find("tr").length;
      const isLikelyData = hasTickerHeader && quoteLinks >= 10;
      return { $t, quoteLinks, bodyRows, isLikelyData };
    });

  const picked =
    metas
      .filter((m) => m.isLikelyData)
      .sort(
        (a, b) =>
          b.quoteLinks - a.quoteLinks ||
          (b.bodyRows || 0) - (a.bodyRows || 0)
      )[0] ?? null;

  return { picked };
}

function indexHeaders(headers: string[]) {
  const find = (needle: string, alt?: string[]) => {
    const ndl = needle.toLowerCase();
    const idx1 = headers.findIndex((h) => h.includes(ndl));
    if (idx1 >= 0) return idx1;
    if (alt?.length) {
      for (const a of alt) {
        const i = headers.findIndex((h) => h.includes(a.toLowerCase()));
        if (i >= 0) return i;
      }
    }
    return -1;
  };
  return {
    idxTicker: find("ticker"),
    idxCompany: find("company"),
    idxSector: find("sector"),
    idxIndustry: find("industry"),
    idxCountry: find("country"),
    idxMktCap: find("market cap"),
    idxPE: find("p/e"),
    idxPS: find("p/s"),
    idxPB: find("p/b"),
    idxPrice: find("price"),
    idxChange: find("change"),
    idxVolume: find("volume"),
  };
}

function parsePickedTable($: any, table: any) {
  const headers = table
    .find("thead th, thead td, tr:first-child th, tr:first-child td")
    .toArray()
    .map((th: any) => $(th).text().trim().toLowerCase());

  const idx = indexHeaders(headers);
  const bodyRows = table.find("tbody tr");
  const rows = bodyRows.length ? bodyRows : table.find("tr").slice(1);

  const out: any[] = [];

  rows.each((_: any, tr: any) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (!tds.length) return;

    // Принимаем тикер ТОЛЬКО из ссылки quote.ashx?t=...
    let ticker = "";
    $tr.find('a[href*="quote.ashx?t="],a[href*="quote.ashx?"]').each(
      (_i: any, a: any) => {
        const href = String($(a).attr("href") || "");
        const upper = href.toUpperCase();
        const m = upper.match(/[?&]T=([A-Z0-9.\-]+)\b/);
        if (m && TICKER_OK.test(m[1])) {
          ticker = m[1];
          return false; // break
        }
        return undefined;
      }
    );
    if (!ticker) return;

    const get = (i?: number) =>
      i != null && i >= 0 ? $(tds.eq(i)).text().trim() : "";

    const obj: any = { ticker };

    const company = get(idx.idxCompany);
    if (company) obj.company = company;

    const sector = get(idx.idxSector);
    if (sector) obj.sector = sector;

    const industry = get(idx.idxIndustry);
    if (industry) obj.industry = industry;

    const country = get(idx.idxCountry);
    if (country) obj.country = country;

    const mkt = get(idx.idxMktCap);
    if (mkt) obj.marketCapText = mkt;

    const pe = toNum(get(idx.idxPE));
    if (pe != null) obj.peSnapshot = pe;

    const ps = toNum(get(idx.idxPS));
    if (ps != null) obj.psSnapshot = ps;

    const pb = toNum(get(idx.idxPB));
    if (pb != null) obj.pbSnapshot = pb;

    const price = toNum(get(idx.idxPrice));
    if (price != null) obj.price = price;

    const chg = toNum(get(idx.idxChange));
    if (chg != null) obj.changePct = chg;

    const vol = get(idx.idxVolume);
    if (vol) obj.volumeText = vol;

    out.push(obj);
  });

  const map = new Map<string, any>();
  for (const r of out) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  return Array.from(map.values());
}

function parseTable(html: string) {
  const $ = cheerio.load(html);
  const { picked } = pickMainTable($);
  if (!picked) return [] as any[];
  return parsePickedTable($, picked.$t);
}

// --- helpers -----------------------------------------------------

async function fetchView(f: string, page: number, view: "121" | "111") {
  const res = await fetch(buildUrl(page, f, view), {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finviz.com/screener.ashx",
    },
  });
  const html = await res.text();
  return parseTable(html);
}

async function fetchSet(f: string, page: number) {
  const [v121, v111] = await Promise.all([fetchView(f, page, "121"), fetchView(f, page, "111")]);
  const by = new Map<string, any>();
  for (const r of v121) by.set(r.ticker, { ...(by.get(r.ticker) || {}), ...r });
  for (const r of v111) by.set(r.ticker, { ...(by.get(r.ticker) || {}), ...r });
  return Array.from(by.values());
}

// Базовый набор фильтров и «ступени расслабления»
const FILTER_STAGES = [
  {
    name: "strict",
    f: "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex",
  },
  {
    name: "no_pe",
    f: "sh_price_u20,fa_ps_u1,exch_nasd,exch_nyse,exch_amex",
  },
  {
    name: "ps_u2",
    f: "sh_price_u20,fa_ps_u2,exch_nasd,exch_nyse,exch_amex",
  },
  {
    name: "price_only",
    f: "sh_price_u20,exch_nasd,exch_nyse,exch_amex",
  },
];

// ----------------------------------------------------------------

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, "http://localhost");
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const fOverride = url.searchParams.get("f") || undefined;
    const minStr = url.searchParams.get("min") || undefined;
    const minDesired = Math.max(1, parseInt(minStr || "20", 10) || 20);

    const stages = fOverride
      ? [{ name: "override", f: fOverride }]
      : FILTER_STAGES;

    const debug: Array<{ stage: string; count: number }> = [];
    const byTicker = new Map<string, any>();

    for (const st of stages) {
      const rows = await fetchSet(st.f, page);
      debug.push({ stage: st.name, count: rows.length });
      for (const r of rows) {
        const prev = byTicker.get(r.ticker) || {};
        byTicker.set(r.ticker, { ...r, __stage: prev.__stage ?? st.name });
      }
      if (byTicker.size >= minDesired) break;
    }

    const items = Array.from(byTicker.values());
    // Порядок: сначала строгие, потом расслабленные
    const stageRank = new Map(stages.map((s, i) => [s.name, i]));
    items.sort((a: any, b: any) => {
      const ra = stageRank.get(a.__stage) ?? 999;
      const rb = stageRank.get(b.__stage) ?? 999;
      if (ra !== rb) return ra - rb;
      return a.ticker.localeCompare(b.ticker);
    });

    // заголовки для дебага
    res.setHeader("X-Finviz-Debug", debug.map(d => `${d.stage}:${d.count}`).join(","));
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({
      page,
      count: items.length,
      items: items.map(({ __stage, ...x }: any) => x),
      stages: debug,
    }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ page: 0, count: 0, items: [], error: String(e?.message || e) }));
  }
}
