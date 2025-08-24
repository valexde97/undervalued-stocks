// src/utils/http.ts

export type FetchJsonOpts = RequestInit & {
  /** Добавить ?ts=... и принудительно cache: "no-store" */
  noStore?: boolean;
};

/** Безопасный JSON-fetch c типами и аккуратной ошибкой */
export async function fetchJSON<T>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  let finalUrl = url;

  if (opts.noStore) {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    u.searchParams.set("ts", String(Date.now())); // анти-кеш
    finalUrl = u.toString();
  }

  const r = await fetch(finalUrl, {
    ...opts,
    // если явно просим noStore — форсим cache: "no-store"
    cache: opts.noStore ? "no-store" : opts.cache,
  });

  if (!r.ok) {
    const body = await safeText(r);
    throw new Error(`${r.status} ${r.statusText} @ ${finalUrl} :: ${body || "no body"}`);
  }
  return r.json() as Promise<T>;
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ""; }
}

/** Ограничение параллелизма для запросов (DRY) */
export async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  if (arr.length === 0) return [];
  const out: R[] = new Array(arr.length);
  let i = 0;
  const workers = Array(Math.min(limit, Math.max(1, arr.length)))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= arr.length) break;
        out[idx] = await fn(arr[idx], idx);
      }
    });
  await Promise.all(workers);
  return out;
}

/** Небольшая пауза, если нужно выровнять RPS */
export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
