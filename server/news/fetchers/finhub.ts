import { RawNewsItem } from "../types";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

function yyyyMmDd(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
}

function pickFinnhubToken() {
  return (
    process.env.FINNHUB_TOKEN ||
    process.env.VITE_FINNHUB_KEY ||
    process.env.VITE_FINNHUB_TOKEN ||
    ""
  );
}

export async function fetchFinnhubNews(symbol: string, lookbackDays: number): Promise<RawNewsItem[]> {
  const token = pickFinnhubToken();
  if (!token) {
    console.warn("[news] Finnhub token not found (FINNHUB_TOKEN / VITE_FINNHUB_KEY / VITE_FINNHUB_TOKEN). Skipping.");
    return [];
  }

  const to = new Date();
  const from = new Date(Date.now() - lookbackDays * 86400000);

  const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${yyyyMmDd(from)}&to=${yyyyMmDd(to)}&token=${encodeURIComponent(token)}`;

  const r = await fetch(url, { headers: { "user-agent": "undervalued-stocks/1.0" } });
  if (!r.ok) {
    console.warn("[news] Finnhub fetch failed:", r.status, r.statusText);
    return [];
  }
  const data = await r.json().catch(() => []) as any[];

  return (data || [])
    .filter(x => x?.headline && x?.url && x?.datetime)
    .map(x => {
      const iso = new Date((x.datetime as number) * 1000).toISOString();
      const id = x.id ? String(x.id) : `${iso}::${x.url}`;
      return {
        id,
        title: String(x.headline),
        url: String(x.url),
        source: "Finnhub",
        publishedAt: iso,
        summary: x.summary ? String(x.summary) : null,
      } as RawNewsItem;
    });
}
