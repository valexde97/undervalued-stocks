/* eslint-disable @typescript-eslint/no-misused-promises */
// vite.config.ts


import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as cheerio from "cheerio";

// минимальные типы, чтобы не тянуть @types/node
type Req = { url?: string | null };
type Res = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: any): void;
};
type Next = () => void;

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Valuation (P/E, P/S, Sector, Industry, Market Cap)
const VIEW_VALUATION = "121";
// Overview (есть Company)
const VIEW_OVERVIEW = "111";

// общий билдер
function buildUrl(page: number, f?: string, v?: string) {
  const view = v ?? VIEW_VALUATION;
  const filters =
    f ?? "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
  const start = 1 + page * 20; // r=1,21,41...
  return `${BASE}?v=${view}&f=${encodeURIComponent(filters)}&r=${start}`;
}

function parseTable(html: string) {
  const $ = cheerio.load(html);

  // ищем первую «табличную» с заголовками
  let table = $("table.table-light").first();
  if (table.length === 0) {
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
    const text = $(th).text().trim().toLowerCase();
    headerIdx[text] = i;
  });

  // индексы по известным названиям колонок
  const idxTicker =
    Object.entries(headerIdx).find(([k]) => k.includes("ticker"))?.[1] ?? 1;
  const idxCompany = Object.entries(headerIdx).find(([k]) => k.includes("company"))?.[1];
  const idxPE =
    Object.entries(headerIdx).find(([k]) => k === "p/e" || k.includes("p/e"))?.[1];
  const idxPS =
    Object.entries(headerIdx).find(([k]) => k === "p/s" || k.includes("p/s"))?.[1];
  const idxMktCap =
    Object.entries(headerIdx).find(([k]) => k.includes("market cap"))?.[1];
  const idxSector =
    Object.entries(headerIdx).find(([k]) => k.includes("sector"))?.[1];
  const idxIndustry =
    Object.entries(headerIdx).find(([k]) => k.includes("industry"))?.[1];

  // строки
  const rows = table.find("tbody tr").length
    ? table.find("tbody tr")
    : table.find("tr").slice(1);

  type Row = {
    ticker: string;
    company?: string | null;
    marketCapText?: string | null;
    peSnapshot?: number | null;
    psSnapshot?: number | null;
    sector?: string | null;
    industry?: string | null;
  };

  const out: Row[] = [];

  rows.each((_, tr) => {
    const tds = $(tr).find("td");
    if (!tds || tds.length < 2) return;

    const ticker = $(tds.eq(idxTicker)).text().trim();
    if (!/^[-A-Z.]+$/.test(ticker)) return;

    const company =
      idxCompany != null ? $(tds.eq(idxCompany)).text().trim() || null : null;

    const peTxt = idxPE != null ? $(tds.eq(idxPE)).text().trim() : "";
    const psTxt = idxPS != null ? $(tds.eq(idxPS)).text().trim() : "";
    const mktTxt =
      idxMktCap != null ? $(tds.eq(idxMktCap)).text().trim() || null : null;

    const sector =
      idxSector != null ? $(tds.eq(idxSector)).text().trim() || null : null;
    const industry =
      idxIndustry != null ? $(tds.eq(idxIndustry)).text().trim() || null : null;

    const pe = Number(peTxt.replace(/,/g, ""));
    const ps = Number(psTxt.replace(/,/g, ""));

    out.push({
      ticker,
      company,
      marketCapText: mktTxt,
      peSnapshot: Number.isFinite(pe) ? pe : null,
      psSnapshot: Number.isFinite(ps) ? ps : null,
      sector,
      industry,
    });
  });

  return out;
}

function finvizDevProxy(): Plugin {
  return {
    name: "finviz-dev-proxy",
    configureServer(server) {
      server.middlewares.use((req: Req, res: Res, next: Next) => {
        const path = req.url || "";
        if (
          !path.startsWith("/api/finviz") &&
          !path.startsWith("/undervalued-stocks/api/finviz")
        )
          return next();

        (async () => {
          try {
            const u = new URL(path, "http://localhost");
            const page = Math.max(
              0,
              parseInt(u.searchParams.get("page") ?? "0", 10) || 0
            );
            const f = u.searchParams.get("f") ?? undefined;

            // тянем две страницы: valuation (для метрик/sector/industry/marketCap) и overview (для имени)
            const [htmlVal, htmlOv] = await Promise.all([
              fetch(buildUrl(page, f, VIEW_VALUATION), {
                headers: {
                  "User-Agent": UA,
                  "Accept-Language": "en-US,en;q=0.9",
                  Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  Referer: `${BASE}?v=${VIEW_VALUATION}`,
                },
              }).then((r) => r.text()),
              fetch(buildUrl(page, f, VIEW_OVERVIEW), {
                headers: {
                  "User-Agent": UA,
                  "Accept-Language": "en-US,en;q=0.9",
                  Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  Referer: `${BASE}?v=${VIEW_OVERVIEW}`,
                },
              }).then((r) => r.text()),
            ]);

            const rowsVal = parseTable(htmlVal);
            const rowsOv = parseTable(htmlOv);

            // индекс для Company из overview
            const nameByTicker = new Map<string, string>();
            rowsOv.forEach((r) => {
              if (r.ticker && r.company) nameByTicker.set(r.ticker, r.company);
            });

            const items = rowsVal.map((r) => ({
              ticker: r.ticker,
              company: nameByTicker.get(r.ticker) ?? null,
              marketCapText: r.marketCapText ?? null,
              peSnapshot: r.peSnapshot ?? null,
              psSnapshot: r.psSnapshot ?? null,
              sector: r.sector ?? null,
              industry: r.industry ?? null,
            }));

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ page, count: items.length, items }));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: String(e?.message || e) }));
          }
        })();
      });
    },
  };
}

export default defineConfig({
  base: "/", // на Vercel всегда корень
  plugins: [
    react(),
    finvizDevProxy(),   // ← ДОБАВИТЬ ЭТО
  ],
});
