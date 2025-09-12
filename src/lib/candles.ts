// src/lib/candles.ts
import { fetchJSON } from "../utils/http";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number | null; provider: string };
export type ConsensusPt = { t: number; c: number };

export type CandlesResponse = {
  symbol: string;
  resolution: "D" | "W" | "M";
  from: number;
  to: number;
  items: Candle[];
  consensus?: ConsensusPt[];
  stats?: { daysA?: number; daysB?: number; overlap?: number };
  meta?: { fromISO: string; toISO: string; adjusted: boolean };
};

export async function getCandles(params: {
  symbol: string;
  fromISO?: string;
  toISO?: string;
  res?: "D" | "W" | "M";
  adjusted?: boolean;
  provider?: "both" | "finnhub" | "alphavantage";
}): Promise<CandlesResponse> {
  const q = new URLSearchParams();
  q.set("symbol", params.symbol.toUpperCase());
  if (params.fromISO) q.set("from", params.fromISO);
  if (params.toISO) q.set("to", params.toISO);
  if (params.res) q.set("res", params.res);
  if (params.adjusted === false) q.set("adjusted", "false");
  if (params.provider) q.set("provider", params.provider);

  return fetchJSON<CandlesResponse>(`/api/candles?${q.toString()}`, { noStore: true, timeoutMs: 25000 });
}

export function extentY(items: Candle[], useHL = true) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    const lo = useHL ? it.l : it.c;
    const hi = useHL ? it.h : it.c;
    if (lo < minY) minY = lo;
    if (hi > maxY) maxY = hi;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minY: 0, maxY: 1 };
  }
  if (minY === maxY) {
    const pad = minY === 0 ? 1 : Math.abs(minY) * 0.05;
    return { minY: minY - pad, maxY: maxY + pad };
  }
  // небольшие поля
  const pad = (maxY - minY) * 0.05;
  return { minY: minY - pad, maxY: maxY + pad };
}
