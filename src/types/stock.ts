export type MarketCapBand = "small" | "mid" | "large";

export type Stock = {
  ticker: string;
  name: string;
  category: MarketCapBand;
  price: number | null;

  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;
  marketCap?: number | null;

  /** ДОБАВЛЕНО: “как на Finviz” */
  marketCapText?: string | null;
  sector?: string | null;
  industry?: string | null;

  potentialScore?: number | null;
  reasons?: string[];

  peSnapshot?: number | null;
  psSnapshot?: number | null;

  listedAt?: Date;
};
