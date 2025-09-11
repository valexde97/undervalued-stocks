import { AggregateInput, AggregateOutput, ClassifiedItem, RawNewsItem } from "./types";
import { fetchFinnhubNews } from "./fetchers/finhub";
import { fetchFmpNews } from "./fetchers/fmp";
import { fetchYahooRss } from "./fetchers/yahoo";
import { classify } from "./classify";
import { buildInsightsHeuristic, buildInsightsLLM } from "./summarise";

function safeKey(url: string, title: string) {
  try {
    const u = new URL(url);
    return (title.trim().toLowerCase() + "|" + u.hostname + u.pathname).slice(0, 300);
  } catch {
    return title.trim().toLowerCase() + "|" + url.slice(0, 50);
  }
}

function dedupe(items: RawNewsItem[]): RawNewsItem[] {
  const seen = new Set<string>();
  const out: RawNewsItem[] = [];
  for (const it of items) {
    const key = safeKey(it.url, it.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export async function aggregateNews(input: AggregateInput): Promise<AggregateOutput> {
  const { symbol, lookbackDays, limit } = input;

  const [a, b, c] = await Promise.allSettled([
    fetchFinnhubNews(symbol, lookbackDays),
    fetchFmpNews(symbol, Math.min(100, Math.max(limit, 20))),
    fetchYahooRss(symbol, Math.min(60, Math.max(limit, 20))),
  ]);

  const finnhub = a.status === "fulfilled" ? a.value : [];
  const fmp     = b.status === "fulfilled" ? b.value : [];
  const yahoo   = c.status === "fulfilled" ? c.value : [];

  const raw = dedupe([...finnhub, ...fmp, ...yahoo]);

  // сортировка по дате (новые первыми)
  raw.sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));

  // классификация
  const classified: ClassifiedItem[] = classify(raw);

  // сортировка: свежесть → score
  classified.sort((x, y) => {
    const byDate = y.publishedAt.localeCompare(x.publishedAt);
    if (byDate !== 0) return byDate;
    return (y.score | 0) - (x.score | 0);
  });

  const items = classified.slice(0, limit);

  // инсайты
  const llm = await buildInsightsLLM(items);
  const insights = llm && llm.length ? llm : buildInsightsHeuristic(items);

  return {
    insights,
    items,
    meta: {
      symbol,
      lookbackDays,
      sources: [
        ...(finnhub.length ? ["Finnhub"] : []),
        ...(fmp.length ?     ["FMP"]     : []),
        ...(yahoo.length ?   ["Yahoo"]   : []),
      ],
      generatedAt: new Date().toISOString(),
      llm: llm ? "on" : "off",
    },
  };
}
