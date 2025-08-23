const BASE = 'https://finnhub.io/api/v1';
const TOKEN = import.meta.env.VITE_FINNHUB_KEY as string;

const withToken = (path: string, params: Record<string, string | number>) =>
  `${BASE}${path}?${new URLSearchParams({ ...params, token: TOKEN }).toString()}`;

export type ApiQuote = { c: number; d?: number; dp?: number; pc?: number };
export type ApiProfile = {
  name?: string;
  ticker?: string;
  ipo?: string; 
  marketCapitalization?: number; 
  exchange?: string;            
};

export type ApiPriceTarget = {
  lastUpdated?: string;
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
};

export async function getQuote(symbol: string): Promise<ApiQuote> {
  const res = await fetch(withToken('/quote', { symbol }));
  if (!res.ok) throw new Error(`quote failed: ${symbol}`);
  return res.json();
}

export async function getProfile(symbol: string): Promise<ApiProfile> {
  const res = await fetch(withToken('/stock/profile2', { symbol }));
  if (!res.ok) throw new Error(`profile failed: ${symbol}`);
  return res.json();
}

export async function getPriceTarget(symbol: string): Promise<ApiPriceTarget> {
  const res = await fetch(withToken('/stock/price-target', { symbol }));
  if (!res.ok) throw new Error(`price-target failed: ${symbol}`);
  return res.json();
}
