// src/server/finviz/parse.ts
import * as cheerio from "cheerio";

const TICKER_OK = /^[A-Z][A-Z0-9.-]*$/;

function toNum(s?: string | null): number | null {
  if (!s) return null;
  const x = String(s).replace(/[,%$]/g, "").replace(/,/g, "").trim();
  if (!x || x === "-" || x === "—" || x.toLowerCase() === "n/a") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickMainTable($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  const $t = $("table.table-light").first();
  if ($t.length) return $t as cheerio.Cheerio<any>;

  const candidates = $("table")
    .toArray()
    .map((el) => {
      const $el = $(el) as cheerio.Cheerio<any>;
      const theadText = $el.find("thead").text().toLowerCase();
      const hasTicker = /ticker/.test(theadText) || $el.find('a[href*="quote.ashx"]').length > 0;
      const rows = $el.find("tbody tr").length || $el.find("tr").length - 1;
      return { $el, score: (hasTicker ? 10 : 0) + rows };
    })
    .sort((a, b) => b.score - a.score);

  return candidates.length ? candidates[0].$el : null;
}

function indexHeaders(headers: string[]) {
  const find = (...needles: string[]) => {
    const n = needles.map((s) => s.toLowerCase());
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (n.some((x) => h.includes(x))) return i;
    }
    return -1;
  };

  return {
    idxTicker: find("ticker", "symbol"),
    idxCompany: find("company", "name"),
    idxSector: find("sector"),
    idxIndustry: find("industry"),
    idxCountry: find("country"),
    idxMktCap: find("market cap"),
    idxPE: find("p/e"),
    idxPS: find("p/s"),
    idxPB: find("p/b"),
    idxPrice: find("price"),
    idxChange: find("change", "change %"),
    idxVolume: find("volume"),
  };
}

function parsePickedTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>) {
  const headers = table.find("thead tr th").map((_, th) => normalizeHeader($(th).text())).get();
  const idx = indexHeaders(headers);

  const bodyRows = table.find("tbody tr");
  const rows = bodyRows.length ? bodyRows : table.find("tr").slice(1);

  const out: any[] = [];

  rows.each((_, tr) => {
    const $tr = $(tr as any);
    const tds = $tr.find("td");
    if (!tds.length) return;

    // предпочитаем тикер из ссылки quote.ashx
    let ticker = "";
    const link = $tr.find('a[href*="quote.ashx"]').first();
    if (link.length) ticker = (link.text() || "").trim();

    if (!TICKER_OK.test(ticker) && idx.idxTicker >= 0 && idx.idxTicker < tds.length) {
      ticker = $(tds[idx.idxTicker]).text().trim();
    }
    if (!TICKER_OK.test(ticker)) return;

    const get = (i?: number) => (i != null && i >= 0 && i < tds.length ? $(tds[i]).text().trim() : "");

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

    const chgNum = toNum(get(idx.idxChange)); // снимаем знак %/символы
    if (chgNum != null) obj.changePct = chgNum;

    const vol = get(idx.idxVolume);
    if (vol) obj.volumeText = vol;

    out.push(obj);
  });

  // merge по тикеру
  const map = new Map<string, any>();
  for (const r of out) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  return Array.from(map.values());
}

export function parseTable(html: string) {
  const $ = cheerio.load(html);
  const $table = pickMainTable($);
  if (!$table || !$table.length) return [] as any[];
  return parsePickedTable($, $table);
}
