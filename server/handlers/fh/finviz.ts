// /api/finviz.ts
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

const DEFAULT_F = "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
const TICKER_OK = /^[A-Z][A-Z0-9.-]{0,10}$/;

function buildUrl(page: number, f?: string) {
  const view = "111"; // Overview
  const filters = f ?? DEFAULT_F;
  const start = 1 + page * PAGE_SIZE; // 1,21,41,...
  return `${BASE}?v=${encodeURIComponent(view)}&f=${encodeURIComponent(filters)}&r=${start}`;
}

function norm(txt: string) {
  return txt.replace(/\s+/g, " ").trim().toLowerCase();
}

function pickMainTable($: cheerio.CheerioAPI) {
  const tables = $("table").toArray();
  const scored = tables
    .map((el) => {
      const $el = $(el);
      const ths = $el.find("thead th").map((_, th) => norm($(th).text())).get();
      const hasTicker = ths.some((t) => t.includes("ticker"));
      const hasCompany = ths.some((t) => t.includes("company"));
      const hasQuoteLinks = $el.find('a[href*="quote.ashx"]').length > 0;
      const rows =
        $el.find("tbody tr").length || Math.max(0, $el.find("tr").length - 1);
      let score = 0;
      if (hasTicker) score += 20;
      if (hasCompany) score += 10;
      if (hasQuoteLinks) score += 10;
      score += Math.min(rows, 50);
      return { $el, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].$el : null;
}

function parseTotal($: cheerio.CheerioAPI): number | null {
  const txt = $.text();
  const m1 = txt.match(/Total:\s*([\d,]+)/i);
  if (m1?.[1]) return parseInt(m1[1].replace(/,/g, ""), 10);
  const m2 = txt.match(/#\s*\d+\s*\/\s*([\d,]+)\s*Total/i);
  if (m2?.[1]) return parseInt(m2[1].replace(/,/g, ""), 10);
  return null;
}

function sanitizeCompany(s?: string | null) {
  if (!s) return null;
  const t = s.trim();
  if (!t || t === "-" || /^filters:/i.test(t) || /\bexport\b/i.test(t)) return null;
  return t;
}

function parseTickersAndNames(html: string) {
  const $ = cheerio.load(html);
  const $table = pickMainTable($);
  if (!$table || !$table.length) return { items: [], total: parseTotal($) };

  const ths = $table.find("thead th").map((_, th) => norm($(th).text())).get();
  const idxCompany = ths.findIndex((t) => t.includes("company"));

  const $rows = ($table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr").slice(1))
    .filter((_, tr) => $(tr).find('a[href*="quote.ashx"]').length > 0);

  const out: Array<{ ticker: string; company: string | null }> = [];
  const seen = new Set<string>();

  $rows.each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    const link = $tr.find('a[href*="quote.ashx"]').first();
    if (!link.length) return;

    // TICKER
    let ticker: string | null = null;
    const href = link.attr("href") || "";
    try {
      const u = new URL(href, "https://finviz.com/");
      ticker = (u.searchParams.get("t") || "").toUpperCase().trim();
    } catch {
      // Ignore errors from invalid URLs
    }
    if (!ticker) ticker = (link.text() || "").toUpperCase().trim();
    if (!ticker || !TICKER_OK.test(ticker)) return;

    // COMPANY (thead-индекс или TD справа от тикера)
    let company: string | null = null;
    if (idxCompany >= 0 && idxCompany < tds.length) {
      company = sanitizeCompany($(tds[idxCompany]).text());
    } else {
      let linkIdx = -1;
      tds.each((i, td) => {
        if ($(td).find('a[href*="quote.ashx"]').length > 0) linkIdx = i;
      });
      if (linkIdx >= 0 && linkIdx + 1 < tds.length) {
        company = sanitizeCompany($(tds[linkIdx + 1]).text());
      }
    }

    if (!seen.has(ticker)) {
      out.push({ ticker, company });
      seen.add(ticker);
    }
  });

  return { items: out.slice(0, PAGE_SIZE), total: parseTotal($) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const page = Math.max(0, parseInt(String((req.query as any).page ?? "0"), 10) || 0);
    const fOverride = typeof (req.query as any).f === "string" ? ((req.query as any).f as string) : undefined;
    const fUsed = fOverride ?? DEFAULT_F;

    const html = await fetch(buildUrl(page, fUsed), { headers: HEADERS }).then((r) => r.text());
    const { items, total } = parseTickersAndNames(html);

    // hasMore:
    // - 20 строк → точно есть след. страница
    // - <20: если total есть — считаем точно; если нет — true пока не пустая страница
    let hasMore = items.length === PAGE_SIZE;
    if (!hasMore) {
      if (typeof total === "number") {
        hasMore = (page + 1) * PAGE_SIZE < total;
      } else {
        hasMore = items.length > 0;
      }
    }

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
    res.setHeader("X-Finviz-EffectiveF", fUsed);
    if (typeof total === "number") res.setHeader("X-Finviz-Total", String(total));
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
    res.setHeader("Content-Type", "application/json");

    res.status(200).json({
      page,
      pageSize: PAGE_SIZE,
      count: items.length,
      total: typeof total === "number" ? total : undefined,
      items,
    });
  } catch (e: any) {
    res.status(500).json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
