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

function buildUrl(page: number, f?: string, v?: string) {
  const view = v ?? "121"; // 121: Valuation, 111: Overview
  const filters =
    f ??
    "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
  const start = 1 + page * PAGE_SIZE; // 1,21,41,...
  return `${BASE}?v=${encodeURIComponent(view)}&f=${encodeURIComponent(
    filters
  )}&r=${start}`;
}

function parseTotal($: cheerio.CheerioAPI): number | null {
  const t = $.text();
  const m1 = t.match(/Total:\s*([\d,]+)/i);
  if (m1?.[1]) return parseInt(m1[1].replace(/,/g, ""), 10);
  const m2 = t.match(/#\s*\d+\s*\/\s*([\d,]+)\s*Total/i); // формат "#1 / 179 Total"
  if (m2?.[1]) return parseInt(m2[1].replace(/,/g, ""), 10);
  return null;
}

function parseTable(html: string) {
  const $ = cheerio.load(html);

  let table = $("table.table-light").first();
  if (!table.length) {
    table = $("table")
      .filter((_, el) =>
        $(el)
          .find("thead th")
          .toArray()
          .some((th) => $(th).text().trim().toLowerCase().includes("ticker"))
      )
      .first();
  }

  const headerIdx: Record<string, number> = {};
  table.find("thead tr th").each((i, th) => {
    headerIdx[$(th).text().trim().toLowerCase()] = i;
  });
  const idx = (name: string, fb?: number) =>
    Object.entries(headerIdx).find(([k]) => k.includes(name))?.[1] ?? fb;

  const idxTicker = idx("ticker", 1);
  const idxCompany = idx("company");
  const idxPE = idx("p/e");
  const idxPS = idx("p/s");
  const idxPB = idx("p/b");
  const idxMktCap = idx("market cap");
  const idxSector = idx("sector");
  const idxIndustry = idx("industry");
  const idxCountry = idx("country");
  const idxPrice = idx("price");
  const idxChange = idx("change");

  const rows = table.find("tbody tr").length
    ? table.find("tbody tr")
    : table.find("tr").slice(1);

  const items = rows
    .toArray()
    .map((tr) => {
      const $tr = $(tr);
      const tds = $tr.find("td");
      const ticker = tds.eq(idxTicker ?? 1).text().trim();
      if (!ticker || !/^[A-Z0-9.-]+$/.test(ticker)) return null;

      const text = (i?: number) =>
        i == null ? null : (tds.eq(i).text().trim() || null);
      const num = (i?: number) => {
        const s = text(i);
        if (!s) return null;
        const n = Number(s.replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
      };
      const pct = (i?: number) => {
        const s = text(i);
        if (!s) return null;
        const n = Number(s.replace(/[,%\s]/g, ""));
        return Number.isFinite(n) ? n : null;
      };

      return {
        ticker,
        company: text(idxCompany),
        sector: text(idxSector),
        industry: text(idxIndustry),
        country: text(idxCountry),
        marketCapText: text(idxMktCap),
        peSnapshot: num(idxPE),
        psSnapshot: num(idxPS),
        pbSnapshot: num(idxPB),
        price: num(idxPrice),
        changePct: pct(idxChange),
      };
    })
    .filter(Boolean) as any[];

  const total = parseTotal($);
  return { items, total };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const page = Math.max(
      0,
      parseInt(String((req.query as any).page ?? "0"), 10) || 0
    );
    const fOverride =
      typeof (req.query as any).f === "string"
        ? ((req.query as any).f as string)
        : undefined;

    // Грузим valuation + overview (для имени компании)
    const [htmlVal, htmlOv] = await Promise.all([
      fetch(buildUrl(page, fOverride, "121"), { headers: HEADERS }).then((r) =>
        r.text()
      ),
      fetch(buildUrl(page, fOverride, "111"), { headers: HEADERS }).then((r) =>
        r.text()
      ),
    ]);

    const { items: valItems, total: totalVal } = parseTable(htmlVal);
    const { items: ovItems, total: totalOv } = parseTable(htmlOv);

    const nameByTicker = new Map<string, string>();
    ovItems.forEach((r: any) => {
      if (r.ticker && r.company) nameByTicker.set(r.ticker, r.company);
    });

    const items = valItems.map((r: any) => ({
      ...r,
      company: nameByTicker.get(r.ticker) ?? r.company ?? null,
    }));

    const total = totalVal ?? totalOv ?? items.length;
    const startIndex = 1 + page * PAGE_SIZE;
    const hasMore = startIndex - 1 + items.length < total;

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
    res.setHeader("X-Finviz-Total", String(total));
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");

    res.status(200).json({
      page,
      pageSize: PAGE_SIZE,
      count: items.length,
      total,
      items,
    });
  } catch (e: any) {
    res
      .status(500)
      .json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
