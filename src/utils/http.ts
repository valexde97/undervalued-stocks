export async function fetchJSON<T>(url: string, opts?: { noStore?: boolean; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 10000);
  try {
    // URL не трогаем: cache-bust добавляем на вызывающей стороне при необходимости.
    const r = await fetch(url, {
      cache: opts?.noStore ? "no-store" : "default",
      signal: ctrl.signal,
      headers: {
        "x-client": "undervalued-stocks",
        ...(opts?.noStore
          ? {
              "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
              Pragma: "no-cache",
              Expires: "0",
            }
          : {}),
      },
    });

    if (r.status === 429) {
      const err: any = new Error("429 Too Many Requests");
      err.status = 429;
      throw err;
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
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
