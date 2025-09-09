export type MarketCapBand = "small" | "mid" | "large";

/**
 * category теперь может быть null до прихода снапшота.
 * marketCap — всегда в МИЛЛИОНАХ USD (client computed).
 */
export type Stock = {
  ticker: string;
  name: string;
  category: MarketCapBand | null;

  // Snapshot for card
  price: number | null;
  changePct?: number | null;

  // (детальные метрики держим вне карточки; оставлены для совместимости)
  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;

  marketCap?: number | null;     // numeric in millions (client computed)
  marketCapText?: string | null; // raw text from Finviz if есть
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
