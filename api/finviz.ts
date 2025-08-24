export const runtime = "nodejs";

import * as cheerio from "cheerio";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function buildUrl(page: number, f?: string, v?: string) {
  const view = v ?? "121"; // valuation
  const filters = f ?? "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
  const start = 1 + page * 20;
  return `${BASE}?v=${view}&f=${encodeURIComponent(filters)}&r=${start}`;
}

function parseTable(html: string) {
  const $ = cheerio.load(html);
  let table = $("table.table-light").first();
  if (table.length === 0) {
    table = $("table").filter((_, el) =>
      $(el).find("thead th").toArray().some(th =>
        $(th).text().trim().toLowerCase().includes("ticker")
      )
    ).first();
  }

  const headerIdx: Record<string, number> = {};
  table.find("thead tr th").each((i, th) => {
    headerIdx[$(th).text().trim().toLowerCase()] = i;
  });

  const idxTicker  = Object.entries(headerIdx).find(([k]) => k.includes("ticker"))?.[1] ?? 1;
  const idxCompany = Object.entries(headerIdx).find(([k]) => k.includes("company"))?.[1];
  const idxPE      = Object.entries(headerIdx).find(([k]) => k.includes("p/e"))?.[1];
  const idxPS      = Object.entries(headerIdx).find(([k]) => k.includes("p/s"))?.[1];
  const idxMktCap  = Object.entries(headerIdx).find(([k]) => k.includes("market cap"))?.[1];
  const idxSector  = Object.entries(headerIdx).find(([k]) => k.includes("sector"))?.[1];
  const idxIndustry= Object.entries(headerIdx).find(([k]) => k.includes("industry"))?.[1];

  const rows = table.find("tbody tr").length ? table.find("tbody tr") : table.find("tr").slice(1);

  return rows.toArray().map(tr => {
    const tds = $(tr).find("td");
    const ticker = $(tds.eq(idxTicker)).text().trim();
    if (!/^[-A-Z.]+$/.test(ticker)) return null;
    const company   = idxCompany != null ? $(tds.eq(idxCompany)).text().trim() || null : null;
    const peTxt     = idxPE != null ? $(tds.eq(idxPE)).text().trim() : "";
    const psTxt     = idxPS != null ? $(tds.eq(idxPS)).text().trim() : "";
    const mktTxt    = idxMktCap != null ? $(tds.eq(idxMktCap)).text().trim() || null : null;
    const sector    = idxSector != null ? $(tds.eq(idxSector)).text().trim() || null : null;
    const industry  = idxIndustry != null ? $(tds.eq(idxIndustry)).text().trim() || null : null;

    const pe = Number(peTxt.replace(/,/g, ""));
    const ps = Number(psTxt.replace(/,/g, ""));
    return {
      ticker,
      company,
      marketCapText: mktTxt,
      peSnapshot: Number.isFinite(pe) ? pe : null,
      psSnapshot: Number.isFinite(ps) ? ps : null,
      sector,
      industry,
    };
  }).filter(Boolean) as any[];
}

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, "http://localhost");
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const f    = url.searchParams.get("f") ?? undefined;

    // Берём две страницы: valuation (метрики) и overview (название компании)
    const [htmlVal, htmlOv] = await Promise.all([
      fetch(buildUrl(page, f, "121"), {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      }).then(r => r.text()),
      fetch(buildUrl(page, f, "111"), {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      }).then(r => r.text()),
    ]);

    const rowsVal = parseTable(htmlVal);
    const rowsOv  = parseTable(htmlOv);
    const nameByTicker = new Map<string, string>();
    rowsOv.forEach(r => { if (r.ticker && r.company) nameByTicker.set(r.ticker, r.company); });

    const items = rowsVal.map(r => ({
      ...r,
      company: nameByTicker.get(r.ticker) ?? r.company ?? null,
    }));

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ page, count: items.length, items }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
