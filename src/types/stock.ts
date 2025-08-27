// src/types/stock.ts
export type MarketCapBand = "small" | "mid" | "large";

export type Stock = {
  ticker: string;
  name: string;
  category: MarketCapBand;

  // Snapshot from Finviz (for instant card render)
  price: number | null;
  changePct?: number | null;

  // Basic fundamentals (can be Finnhub later)
  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;

  marketCap?: number | null;     // numeric in millions (client computed)
  marketCapText?: string | null; // raw Finviz text ("12.3B", "340M")
  sector?: string | null;
  industry?: string | null;
  country?: string | null;

  beta?: number | null;
  dividendYield?: number | null; // %

  // Snapshots taken directly from Finviz
  peSnapshot?: number | null;
  psSnapshot?: number | null;
  pbSnapshot?: number | null;

  // Optional details (Finnhub)
  listedAt?: Date;

  potentialScore?: number | null;
  reasons?: string[];
};
