// api/finviz.ts
import * as cheerio from "cheerio";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// v=121 — Valuation (P/E, P/S)
function buildUrl(page: number, f?: string, v?: string) {
  const view = v ?? "121";
  const filters = f ?? "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
  const start = 1 + page * 20; // r=1,21,41...
  return `${BASE}?v=${view}&f=${encodeURIComponent(filters)}&r=${start}`;
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
  const f = url.searchParams.get("f") ?? undefined;
  const v = url.searchParams.get("v") ?? undefined;

  const finvizUrl = buildUrl(page, f, v);
  const html = await fetch(finvizUrl, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://finviz.com/screener.ashx?v=121",
    },
  }).then(r => r.text());

  const $ = cheerio.load(html);

  let table = $("table.table-light").first();
  if (table.length === 0) {
    table = $('table').filter((_, el) => {
      const hasTicker = $(el).find("thead th").toArray()
        .some(th => $(th).text().trim().toLowerCase().includes("ticker"));
      return hasTicker;
    }).first();
  }

  const headerIdx: Record<string, number> = {};
  table.find("thead tr th").each((i, th) => {
    const text = $(th).text().trim().toLowerCase();
    headerIdx[text] = i;
  });

  const idxTicker  = Object.entries(headerIdx).find(([k]) => k.includes("ticker"))?.[1] ?? 1;
  const idxCompany = Object.entries(headerIdx).find(([k]) => k.includes("company"))?.[1] ?? 2;
  const idxPE      = Object.entries(headerIdx).find(([k]) => k === "p/e" || k.includes("p/e"))?.[1];
  const idxPS      = Object.entries(headerIdx).find(([k]) => k === "p/s" || k.includes("p/s"))?.[1];

  const rows = table.find("tbody tr").length ? table.find("tbody tr") : table.find("tr").slice(1);

  const items: Array<{
    ticker: string;
    company: string;
    marketCapText?: string | null;
    peSnapshot: number | null;
    psSnapshot: number | null;
    sector?: string | null;
    industry?: string | null;
  }> = [];

  rows.each((_, tr) => {
    const tds = $(tr).find("td");
    if (!tds || tds.length < 3) return;

    const ticker = $(tds.eq(idxTicker)).text().trim();
    if (!/^[-A-Z.]+$/.test(ticker)) return;

    const company = $(tds.eq(idxCompany)).text().trim();
    const peTxt = idxPE != null ? $(tds.eq(idxPE)).text().trim() : "";
    const psTxt = idxPS != null ? $(tds.eq(idxPS)).text().trim() : "";

    const pe = Number(peTxt.replace(/,/g, ""));
    const ps = Number(psTxt.replace(/,/g, ""));

    items.push({
      ticker,
      company,
      peSnapshot: Number.isFinite(pe) ? pe : null,
      psSnapshot: Number.isFinite(ps) ? ps : null,
    });
  });

  return new Response(JSON.stringify({ page, count: items.length, items }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=1800, stale-while-revalidate=86400" },
  });
}
