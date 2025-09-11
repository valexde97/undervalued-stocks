import { RawNewsItem } from "../types";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

export async function fetchFmpNews(symbol: string, limit: number): Promise<RawNewsItem[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  const url = `${FMP_BASE}/stock_news?tickers=${encodeURIComponent(symbol)}&limit=${Math.min(100, Math.max(1, limit))}&apikey=${encodeURIComponent(key)}`;

  const r = await fetch(url, { headers: { "user-agent": "undervalued-stocks/1.0" } });
  if (!r.ok) return [];
  const data = await r.json().catch(() => []) as any[];

  return (data || [])
    .filter(x => x?.title && x?.url && x?.publishedDate)
    .map(x => {
      const iso = new Date(String(x.publishedDate)).toISOString();
      const id = x.id ? String(x.id) : `${iso}::${x.url}`;
      return {
        id,
        title: String(x.title),
        url: String(x.url),
        source: "FMP",
        publishedAt: iso,
        summary: x.text ? String(x.text) : null,
      } as RawNewsItem;
    });
}

