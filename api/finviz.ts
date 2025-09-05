// /api/finviz.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const BASE = "https://finviz.com/screener.ashx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finviz.com/screener.ashx",
};

const DEFAULT_F = "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";

function buildUrl(page: number, f?: string) {
  const view = "111"; // Overview
  const filters = f ?? DEFAULT_F;
  const start = 1 + page * PAGE_SIZE; // 1,21,41,...
  return `${BASE}?v=${encodeURIComponent(view)}&f=${encodeURIComponent(filters)}&r=${start}`;
}

const TICKER_OK = /^[A-Z][A-Z0-9.-]{0,10}$/;
const stopWords = new Set([
  "order by","valuation","financial","ownership","performance","technical","overview","export",
  "any","ascdesc","signal","index","dividend yield","average volume","target price","ipo date",
]);

const looksLikeNoise = (s?: string | null) => {
  if (!s) return false;
  const x = s.trim().toLowerCase();
  if (!x) return false;
  for (const w of stopWords) if (x.includes(w)) return true;
  return false;
};

function parseTickerFromHref(href?: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, "https://finviz.com/");
    const t = (u.searchParams.get("t") || "").toUpperCase().trim();
    return TICKER_OK.test(t) ? t : null;
  } catch { /* noop */ }
  const m = href.match(/[?&]t=([A-Z0-9.-]{1,10})/i);
  const t = m?.[1]?.toUpperCase() ?? null;
  return t && TICKER_OK.test(t) ? t : null;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickMainTable($: cheerio.CheerioAPI) {
  const $t = $("table.table-light").first();
  if ($t.length) return $t;
  const candidates = $("table").toArray().map((el) => {
    const $el = $(el);
    const hasQuote = $el.find('a[href*="quote.ashx"]').length > 0;
    const rows = $el.find("tbody tr").length || Math.max(0, $el.find("tr").length - 1);
    return { $el, score: (hasQuote ? 10 : 0) + rows };
  }).sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].$el : null;
}

function indexHeaders(headers: string[]) {
  const find = (...needles: string[]) => {
    const n = needles.map((s) => s.toLowerCase());
    for (let i = 0; i < headers.length; i++) if (n.some((x) => headers[i].includes(x))) return i;
    return -1;
  };
  return {
    idxTicker: find("ticker","symbol"),
    idxCompany: find("company","name"),
    idxSector: find("sector"),
    idxIndustry: find("industry"),
    idxCountry: find("country"),
  };
}

function parseTickers(html: string) {
  const $ = cheerio.load(html);
  const $table = pickMainTable($);
  if (!$table || !$table.length) return { items: [] as any[], total: null as number | null };

  const headers = $table.find("thead tr th").map((_, th) => normalizeHeader($(th).text())).get();
  const idx = indexHeaders(headers);
  const $rows = $table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr").slice(1);

  const items: Array<{ ticker: string; company?: string | null; sector?: string | null; industry?: string | null; country?: string | null }> = [];

  $rows.each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (!tds.length) return;

    // 1) Нормальный путь — по ссылке
    const a = $tr.find('a[href*="quote.ashx"]').first();
    let ticker = parseTickerFromHref(a.attr("href"));

    // 2) Fallback — по тексту в колонке Ticker, если ссылка не нашлась
    if (!ticker && idx.idxTicker >= 0 && idx.idxTicker < tds.length) {
      const raw = $(tds[idx.idxTicker]).text().trim().toUpperCase();
      if (TICKER_OK.test(raw)) ticker = raw;
    }
    if (!ticker) return;

    const get = (i?: number) => i != null && i >= 0 && i < tds.length ? $(tds[i]).text().trim() : "";

    const company = (idx.idxCompany >= 0 ? get(idx.idxCompany) : "") || null;
    const sector  = (idx.idxSector  >= 0 ? get(idx.idxSector)  : "") || null;
    const industry= (idx.idxIndustry>= 0 ? get(idx.idxIndustry): "") || null;
    const country = (idx.idxCountry >= 0 ? get(idx.idxCountry) : "") || null;

    // фильтр от мусора из панели (слова вроде "Valuation", "Order by", "Any ...")
    if (looksLikeNoise(company) || looksLikeNoise(sector) || looksLikeNoise(industry) || looksLikeNoise(country)) {
      return;
    }

    items.push({ ticker, company, sector, industry, country });
  });

  const text = $.text();
  const m1 = text.match(/Total:\s*([\d,]+)/i);
  const total = m1?.[1] ? parseInt(m1[1].replace(/,/g, ""), 10) : null;

  return { items, total };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const page = Math.max(0, parseInt(String((req.query as any).page ?? "0"), 10) || 0);
    const fOverride = typeof (req.query as any).f === "string" ? ((req.query as any).f as string) : undefined;
    const fUsed = fOverride ?? DEFAULT_F;

    const html = await fetch(buildUrl(page, fUsed), { headers: HEADERS }).then((r) => r.text());
    const { items, total } = parseTickers(html);

    const startIndex = 1 + page * PAGE_SIZE;
    const hasMore = total ? startIndex - 1 + items.length < total : items.length === PAGE_SIZE;

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
    res.setHeader("X-Finviz-EffectiveF", fUsed);
    if (total != null) res.setHeader("X-Finviz-Total", String(total));
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");

    res.status(200).json({ page, pageSize: PAGE_SIZE, count: items.length, total: total ?? undefined, items });
  } catch (e: any) {
    res.status(500).json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
