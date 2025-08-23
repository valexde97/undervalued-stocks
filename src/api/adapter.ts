import type { Stock, MarketCapBand } from "../types/stock";

export type ApiProfile = {
  marketCapitalization?: number; // в миллионах/миллиардах? (мы трактуем как миллионы/миллиарды — не критично для бэнда)
  name?: string;
  ipo?: string;
};

export type ApiQuote = { c?: number };

function capToBand(capBillion?: number): MarketCapBand {
  const cap = capBillion ?? 0;
  if (cap >= 10_000) return "large";
  if (cap >= 2_000) return "mid";
  return "small";
}

export function toStock(ticker: string, profile: ApiProfile, quote: ApiQuote): Stock {
  const band = capToBand(profile.marketCapitalization);
  const listedAt = profile.ipo ? new Date(profile.ipo) : new Date();
  return {
    ticker,
    name: profile.name ?? ticker,
    price: quote.c ?? 0,
    category: band,
    listedAt,
  };
}

export type FinvizItem = {
  ticker: string;
  company?: string | null;
  marketCapText?: string | null;
  peSnapshot?: number | null;
  psSnapshot?: number | null;
  sector?: string | null;
  industry?: string | null;
};
export type FinvizResponse = {
  page: number;
  count: number;
  items: FinvizItem[];
};

// сколько параллельных запросов котировок делать
const QUOTE_CONCURRENCY =
  Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS) || 3;

/** "49.06M" | "12.83B" -> млн. $ (49.06 | 12830) */
function capTextToMillions(txt?: string | null): number | undefined {
  if (!txt) return undefined;
  const m = String(txt).trim().replace(/[, ]/g, "").match(/^(\d+(?:\.\d+)?)([MBT])?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toUpperCase();
  if (u === "B") return n * 1000;   // млрд -> млн
  if (u === "T") return n * 1_000_000; // трлн -> млн (на всякий случай)
  return n; // M
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  return r.json() as Promise<T>;
}

/** Ограничение параллелизма */
async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = new Array(arr.length);
  let i = 0;
  const workers = Array(Math.min(limit, Math.max(1, arr.length)))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= arr.length) break;
        ret[idx] = await fn(arr[idx], idx);
      }
    });
  await Promise.all(workers);
  return ret;
}

/** 1) тянет страницу скринера с нашего /api/finviz */
export async function fetchFinvizPage(page = 0): Promise<FinvizResponse> {
  return fetchJSON<FinvizResponse>(`/api/finviz?page=${page}`);
}

/** 2) по тикеру берёт котировку с нашего /api/fh/quote */
export async function fetchQuote(symbol: string): Promise<ApiQuote> {
  return fetchJSON<ApiQuote>(`/api/fh/quote?symbol=${encodeURIComponent(symbol)}`);
}

/** 3) собирает массив Stock из ответа Finviz + котировок */
export async function assembleStocksFromFinviz(page = 0): Promise<Stock[]> {
  const finviz = await fetchFinvizPage(page);

  const stocks = await mapLimit(finviz.items, QUOTE_CONCURRENCY, async (row) => {
    const profile: ApiProfile = {
      name: row.company ?? undefined,
      marketCapitalization: capTextToMillions(row.marketCapText),
    };
    let quote: ApiQuote = {};
    try {
      quote = await fetchQuote(row.ticker);
    } catch {
      // тихо падаем — цена будет 0, категория по капе посчитается
    }
    return toStock(row.ticker, profile, quote);
  });

  return stocks;
}

/** 4) мини-панель индексов (SPY/QQQ/IWM) */
export async function fetchIndexStrip() {
  const syms = ["SPY", "QQQ", "IWM"];
  const out: Record<string, number | null> = {};
  await Promise.all(
    syms.map(async (s) => {
      try {
        const q = await fetchQuote(s);
        out[s] = q?.c ?? null;
      } catch {
        out[s] = null;
      }
    })
  );
  return out;
}

/** (опционально) новости — если сделаешь функцию /api/fh/news */
export async function fetchNews(category = "general") {
  try {
    return await fetchJSON<any[]>(`/api/fh/news?category=${encodeURIComponent(category)}`);
  } catch {
    return [];
  }
}

