// utils/http.ts
export async function fetchJSON<T>(url: string, opts?: { noStore?: boolean; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 10000);
  try {
    const r = await fetch(url, {
      cache: opts?.noStore ? "no-store" : "default",
      signal: ctrl.signal,
      headers: {
        "x-client": "undervalued-stocks",
        ...(opts?.noStore ? { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache", Expires: "0" } : {}),
      },
    });

    if (r.status === 429) {
      const err: any = new Error("429 Too Many Requests");
      err.status = 429;
      throw err;
    }

    if (!r.ok) {
      let detail = "";
      try {
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await r.json();
          detail = body?.error || body?.message || JSON.stringify(body);
        } else {
          detail = await r.text();
        }
      } catch { /* empty */ }
      const e: any = new Error(`${r.status} ${r.statusText}${detail ? ` — ${detail}` : ""}`);
      e.status = r.status;
      e.detail = detail;
      throw e;
    }

    // нормальный JSON
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
