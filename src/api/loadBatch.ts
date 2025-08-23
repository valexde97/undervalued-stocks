import { withTokenBase } from "./utilToken";
import { gateFetchJson } from "./rateGate";
import type { Stock } from "../types/stock";

type QuoteResp = { c?: number };
type MetricResp = {
  metric?: {
    peBasicExclExtraTTM?: number | null;
    pbAnnual?: number | null;
    psTTM?: number | null;
    currentRatioAnnual?: number | null;
    debtToEquityAnnual?: number | null;
    grossMarginTTM?: number | null;
    netProfitMarginTTM?: number | null;
  };
};
type ProfileResp = { marketCapitalization?: number; name?: string; ipo?: string };

// кэши

const quoteCache = new Map<string, { t: number; price: number }>(); // 30с
const metricCache = new Map<string, {
  t: number;
  m: NonNullable<MetricResp["metric"]>;
  mc: number | null; // <— обязательно null
}>();
 // 24ч

// быстрые котировки
export async function refetchQuotes(
  tickers: string[],
  opts?: { firstN?: number; ttlMs?: number }
): Promise<Array<{ ticker: string; price: number }>> {
  const firstN = opts?.firstN ?? tickers.length;
  const ttlMs = opts?.ttlMs ?? 30_000;
  const now = Date.now();

  const work = tickers.slice(0, firstN);

  const tasks = work.map(async (symbol) => {
    const cached = quoteCache.get(symbol);
    if (cached && now - cached.t < ttlMs) {
      return { ticker: symbol, price: cached.price };
    }
    const url = withTokenBase("/quote", { symbol });
    const j = await gateFetchJson<QuoteResp>(url, false);
    const price = j?.c ?? 0;
    quoteCache.set(symbol, { t: Date.now(), price });
    return { ticker: symbol, price };
  });

  return Promise.all(tasks);
}

// медленные метрики/профиль
export async function enrichBatch(
  tickers: string[],
  opts?: { firstN?: number }
): Promise<Array<Partial<Stock> & { ticker: string }>> {
  const firstN = opts?.firstN ?? tickers.length;
  const now = Date.now();
  const work = tickers.slice(0, firstN);

  const results: Array<Partial<Stock> & { ticker: string }> = [];
  for (const symbol of work) {
    const cached = metricCache.get(symbol);
    if (cached && now - cached.t < 24 * 3600_000) {
      const m = cached.m;
      results.push({
        ticker: symbol,
        pe: m.peBasicExclExtraTTM ?? null,
        pb: m.pbAnnual ?? null,
        ps: m.psTTM ?? null,
        currentRatio: m.currentRatioAnnual ?? null,
        debtToEquity: m.debtToEquityAnnual ?? null,
        grossMargin: m.grossMarginTTM ?? null,
        netMargin: m.netProfitMarginTTM ?? null,
        marketCap: cached.mc ?? null,
      });
      continue;
    }

    const metricUrl = withTokenBase("/stock/metric", { symbol, metric: "all" });
    const profileUrl = withTokenBase("/stock/profile2", { symbol });

    const [mr, pr] = await Promise.all([
      gateFetchJson<MetricResp>(metricUrl, false),
      gateFetchJson<ProfileResp>(profileUrl, false),
    ]);

    const m = mr?.metric ?? {};
  const mcVal = pr?.marketCapitalization ?? null;
metricCache.set(symbol, { t: Date.now(), m, mc: mcVal });

    results.push({
      ticker: symbol,
      pe: m.peBasicExclExtraTTM ?? null,
      pb: m.pbAnnual ?? null,
      ps: m.psTTM ?? null,
      currentRatio: m.currentRatioAnnual ?? null,
      debtToEquity: m.debtToEquityAnnual ?? null,
      grossMargin: m.grossMarginTTM ?? null,
      netMargin: m.netProfitMarginTTM ?? null,
      marketCap: mcVal,
    });
  }

  return results;
}

export function computeScore(s: Partial<Stock> & { price?: number | null }) {
  const price = s.price ?? 0;
  const pe = s.pe ?? null;
  const ps = s.ps ?? null;
  const currentRatio = s.currentRatio ?? null;
  const debtToEquity = s.debtToEquity ?? null;
  const grossMargin = s.grossMargin ?? null;
  const netMargin = s.netMargin ?? null;

  let valuePts = 0;
  if (pe != null && pe > 0 && pe <= 15) valuePts++;
  if (ps != null && ps > 0 && ps <= 1) valuePts++;

  let healthPts = 0;
  if (currentRatio != null && currentRatio >= 1) healthPts++;
  if (debtToEquity != null && debtToEquity < 2) healthPts++;
  if (grossMargin != null && grossMargin > 0) healthPts++;
  if (netMargin != null && netMargin > 0) healthPts++;

  const valueScore = valuePts / 2;
  const healthScore = healthPts / 4;
  const cheapBonus = price > 0 ? Math.max(0, (20 - price) / 20) * 0.1 : 0;

  return Math.min(1, 0.6 * valueScore + 0.4 * healthScore + cheapBonus);
}

// минимальные карточки для первой N-ки
export async function loadBatchFast(
  tickers: string[],
  opts?: { quotesFirstN?: number }
): Promise<Stock[]> {
  const firstN = opts?.quotesFirstN ?? 20;
  const quotes = await refetchQuotes(tickers, { firstN });

  const qmap = new Map<string, number>();
  quotes.forEach((q) => qmap.set(q.ticker, q.price));

  return tickers.slice(0, firstN).map<Stock>((t) => ({
    ticker: t,
    name: t,
    category: "mid",
    price: qmap.get(t) ?? 0,
    pe: null,
    pb: null,
    ps: null,
    currentRatio: null,
    debtToEquity: null,
    grossMargin: null,
    netMargin: null,
    marketCap: null,
    potentialScore: null,
    reasons: [],
  }));
}
