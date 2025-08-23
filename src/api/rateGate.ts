const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (ms: number) => Math.round(ms * (0.5 + Math.random()));

const QUOTE_RPS = Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS ?? "3");
const OTHER_RPS = Number(import.meta.env.VITE_FINNHUB_OTHER_RPS ?? "0.33");

const quoteInterval = Math.max(1, Math.floor(1000 / Math.max(1e-6, QUOTE_RPS)));
const otherInterval = Math.max(1, Math.floor(1000 / Math.max(1e-6, OTHER_RPS)));

let nextQuoteAt = 0;
let nextOtherAt = 0;

const inflight = new Map<string, Promise<Response>>();

async function waitTurn(isQuote: boolean) {
  const now = Date.now();
  const nextAt = isQuote ? nextQuoteAt : nextOtherAt;
  const wait = Math.max(0, nextAt - now);
  if (wait) await sleep(wait);
  const newNext = Date.now() + (isQuote ? quoteInterval : otherInterval);
  if (isQuote) nextQuoteAt = newNext;
  else nextOtherAt = newNext;
}

export async function gateFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = `${init?.method ?? "GET"} ${url}`;
  if (inflight.has(key)) return inflight.get(key)!.then((r) => r.clone());

  const isQuote = url.includes("/quote");

  const run = (async () => {
    await waitTurn(isQuote);
    const res = await fetch(url, init);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
      const wait = retryAfter > 0 ? retryAfter * 1000 : jitter(2000);
      await sleep(wait);
      return gateFetch(url, init);
    }
    return res;
  })().finally(() => inflight.delete(key));

  inflight.set(key, run);
  return run.then((r) => r.clone());
}

export async function gateFetchJson<T>(url: string, strict = true): Promise<T | null> {
  const res = await gateFetch(url);
  if (!res.ok) {
    if (strict) throw new Error(`${res.status} ${res.statusText}`);
    return null;
  }
  return (await res.json()) as T;
}
