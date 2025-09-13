import { createAction } from "@reduxjs/toolkit";
import type { Stock } from "../../types/stock";

/* =========================
   Types для snapshot API
========================= */
export type SnapshotItem = {
  ticker: string;
  name?: string | null;
  industry?: string | null;
  country?: string | null;
  marketCapM?: number | null;
  logo?: string | null;

  price?: number | null;
  changePct?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
};
export type SnapshotResponse = { items: SnapshotItem[]; serverTs?: number; backoffUntil?: number };

/* =========================
   Action creators
========================= */
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

export const seedDetails = createAction<{ ticker: string; price: number | null; category: Stock["category"] | null }>(
  "stocks/seedDetails"
);

/* =========================
   Утилиты / нормализация
========================= */
export function capMillions(v?: number | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(v, 5_000_000);
}

export function prettyCategoryByCap(capM?: number | null): Stock["category"] | undefined {
  if (typeof capM !== "number") return undefined;
  if (capM >= 10_000) return "large";
  if (capM >= 2_000) return "mid";
  return "small";
}

function saneText(v?: string | null, ticker?: string | null) {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-" || t === "—") return null;
  if (ticker && t.toUpperCase() === ticker.toUpperCase()) return null;
  if (/^[0-9]+$/.test(t)) return null;
  return t;
}

function looksLikeNoise(s?: string | null) {
  const x = (s || "").trim().toLowerCase();
  if (!x) return false;
  return [
    "export","overview","valuation","financial","ownership","performance","technical",
    "order by","any","index","signal","dividend yield","average volume","target price","ipo date","filters:",
  ].some((w) => x.includes(w));
}

function cleanField(v?: string | null, ticker?: string | null) {
  if (looksLikeNoise(v)) return null;
  return saneText(v, ticker);
}

export function mapFinvizItemsToStocks(rows: any[]): Stock[] {
  const out: Stock[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row?.ticker) continue;
    if (seen.has(row.ticker)) continue;

    const ticker: string = row.ticker;
    const name = cleanField(row.company, ticker) ?? ticker;

    out.push({
      ticker,
      name,
      category: "small", // обновится после гидрации
      price: null,
      changePct: null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: null,
      marketCapText: null,

      sector: null,
      industry: null,
      country: null,

      beta: null,
      dividendYield: null,

      peSnapshot: null,
      psSnapshot: null,
      pbSnapshot: null,

      listedAt: undefined,
      potentialScore: null,
      reasons: [],
    });

    seen.add(ticker);
  }
  return out;
}
