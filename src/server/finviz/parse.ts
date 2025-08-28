// src/server/finviz/parse.ts
import * as cheerio from "cheerio";

const TICKER_OK = /^[A-Z][A-Z0-9.\-]*$/;

function toNum(s?: string | null): number | null {
  if (!s) return null;
  const x = s.replace(/[,%$]/g, "").replace(/,/g, "").trim();
  if (!x || x === "-" || x === "—") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickMainTable($: cheerio.CheerioAPI) {
  const metas = $("table")
    .toArray()
    .map((el) => {
      const $t = $(el);
      const headers = $t
        .find("thead th, thead td, tr:first-child th, tr:first-child td")
        .toArray()
        .map((th) => $(th).text().trim().toLowerCase());
      const hasTickerHeader = headers.some((h) => h.includes("ticker"));
      const quoteLinks = $t.find('a[href*="quote.ashx?t="],a[href*="quote.ashx?"]').length;
      const bodyRows = $t.find("tbody tr").length || $t.find("tr").length;
      const isLikelyData = hasTickerHeader && quoteLinks >= 10;
      return { $t, quoteLinks, bodyRows, isLikelyData };
    });

  const picked =
    metas
      .filter((m) => m.isLikelyData)
      .sort((a, b) => b.quoteLinks - a.quoteLinks || (b.bodyRows || 0) - (a.bodyRows || 0))[0] ?? null;

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

function parsePickedTable($: cheerio.CheerioAPI, table: cheerio.Cheerio) {
  const headers = table
    .find("thead th, thead td, tr:first-child th, tr:first-child td")
    .toArray()
    .map((th) => $(th).text().trim().toLowerCase());

  const idx = indexHeaders(headers);
  const bodyRows = table.find("tbody tr");
  const rows = bodyRows.length ? bodyRows : table.find("tr").slice(1);

  const out: any[] = [];

  rows.each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (!tds.length) return;

    // Тикер только из ссылки quote.ashx?t=...
    let ticker = "";
    $tr.find('a[href*="quote.ashx?t="],a[href*="quote.ashx?"]').each((__i, a) => {
      const href = String($(a).attr("href") || "");
      const upper = href.toUpperCase();
      const m = upper.match(/[?&]T=([A-Z0-9.\-]+)\b/);
      if (m && TICKER_OK.test(m[1])) {
        ticker = m[1];
        return false; // break
      }
      return undefined;
    });
    if (!ticker) return;

    const get = (i?: number) => (i != null && i >= 0 ? $(tds.eq(i)).text().trim() : "");

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

  // Мерж по тикеру (если было несколько строк)
  const map = new Map<string, any>();
  for (const r of out) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  return Array.from(map.values());
}

export function parseTable(html: string) {
  const $ = cheerio.load(html);
  const { picked } = pickMainTable($);
  if (!picked) return [] as any[];
  return parsePickedTable($, picked.$t);
}
