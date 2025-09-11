import { RawNewsItem } from "../types";

// Пример RSS: https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US
export async function fetchYahooRss(symbol: string, limit = 30): Promise<RawNewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  try {
    const r = await fetch(url, { headers: { "user-agent": "undervalued-stocks/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();

    // Очень простой парсер RSS
    const items: RawNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(xml)) && items.length < limit) {
      const block = m[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                     block.match(/<title>(.*?)<\/title>/)?.[1] || "").trim();
      const link = (block.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
      const pub = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "").trim();

      if (!title || !link) continue;
      const iso = pub ? new Date(pub).toISOString() : new Date().toISOString();
      items.push({
        id: `${iso}::${link}`,
        title,
        url: link,
        source: "Yahoo",
        publishedAt: iso,
        summary: null,
      });
    }
    return items;
  } catch {
    return [];
  }
}
