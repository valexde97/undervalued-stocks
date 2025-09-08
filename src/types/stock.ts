// src/types/stock.ts
export type MarketCapBand = "small" | "mid" | "large";

export type Stock = {
  ticker: string;
  name: string;

  // Категория рассчитывается по marketCap (в МИЛЛИОНАХ USD) — может быть неизвестна до снапшота
  category: MarketCapBand | null;

  // Snapshot (цена/динамика)
  price: number | null;
  changePct?: number | null;

  // Базовые метрики (детали; на карточке не обязательны)
  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;

  // Всегда в МИЛЛИОНАХ USD
  marketCap?: number | null;     // numeric, млн USD
  marketCapText?: string | null; // запасной текст (если нужен)

  sector?: string | null;
  industry?: string | null;
  country?: string | null;

  beta?: number | null;
  dividendYield?: number | null; // %

  // Снимки Finviz (если используете)
  peSnapshot?: number | null;
  psSnapshot?: number | null;
  pbSnapshot?: number | null;

  // Детали
  listedAt?: Date;

  potentialScore?: number | null;
  reasons?: string[];
};
