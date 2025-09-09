// src/utils/http.ts
export async function fetchJSON<T>(
  url: string,
  opts?: { noStore?: boolean; timeoutMs?: number }
): Promise<T> {
  // Мягкие ретраи только на 429/5xx и сетевые ошибки.
  // Сигнатуру не меняю, чтобы не трогать вызовы.
  const maxRetries = 3;

  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
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

      // Явная обработка 429
      if (r.status === 429) {
        // Если это последняя попытка — бросаем ту же ошибку, что и раньше
        if (attempt === maxRetries) {
          const err: any = new Error("429 Too Many Requests");
          err.status = 429;
          throw err;
        }
        // Иначе — подождём и попробуем ещё раз
        await sleep(retryDelayMs(attempt, r.headers.get("Retry-After")));
        continue;
      }

      // Прочие ошибки HTTP
      if (!r.ok) {
        let detail = "";
        try {
          const ct = r.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const body = await r.json();
            detail =
              (body as any)?.error ||
              (body as any)?.message ||
              JSON.stringify(body);
          } else {
            detail = await r.text();
          }
        } catch {
          /* ignore */
        }

        // На 5xx — ретраим (кроме последней попытки)
        if (r.status >= 500 && r.status <= 599 && attempt < maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }

        const e: any = new Error(
          `${r.status} ${r.statusText}${detail ? ` — ${detail}` : ""}`
        );
        e.status = r.status;
        e.detail = detail;
        throw e;
      }

      // Успешный ответ: считаем, что это JSON (как и раньше)
      try {
        const data = (await r.json()) as T;
        return data;
      } catch (parseErr) {
        // Если сервер вернул пусто или не-JSON — сформируем понятную ошибку
        const e: any = new Error(
          `Failed to parse JSON response from ${url}: ${String(
            (parseErr as any)?.message || parseErr
          )}`
        );
        e.cause = parseErr;
        throw e;
      }
    } catch (err: any) {
      lastErr = err;

      // Аборт/таймаут и сетевые ошибки — тоже попробуем ретраить
      const isAbort = err?.name === "AbortError";
      const isNetworkLike =
        isAbort ||
        /network/i.test(String(err?.message)) ||
        /fetch failed/i.test(String(err?.message)) ||
        /TypeError: Failed to fetch/i.test(String(err?.message));

      if (attempt < maxRetries && isNetworkLike) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      // Если ретраев больше нет — падаем
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Теоретически сюда не дойдём, но на всякий случай:
  throw lastErr || new Error("fetchJSON: unknown error");
}

/** Ждём указанное количество миллисекунд */
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Экспоненциальный бэк-офф + джиттер; уважаем Retry-After, если есть */
function retryDelayMs(attempt: number, retryAfterHeader?: string | null) {
  // Retry-After может быть числом (секунды) или датой
  const ra = parseRetryAfter(retryAfterHeader);
  if (ra > 0) return ra;

  const base = 300 * Math.pow(2, attempt); // 300, 600, 1200, 2400...
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function parseRetryAfter(h?: string | null): number {
  if (!h) return 0;
  const s = h.trim();
  // Число секунд
  if (/^\d+$/.test(s)) {
    const seconds = parseInt(s, 10);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }
  // Дата
  const d = Date.parse(s);
  if (!Number.isNaN(d)) {
    const delta = d - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}
