// src/api/loadBatch.ts
export type FinvizItem = any;

// модульная «память» выбранного effectiveF
let gEffectiveF: string | undefined;

export function resetFinvizEffectiveFilter() {
  gEffectiveF = undefined;
}

type Meta = { hasMore: boolean; pageSize: number; debug: string; f?: string };

function parseMetaFromHeaders(h: Record<string, string | undefined>): Meta {
  const hasMore = (h["X-Finviz-HasMore"] || h["x-finviz-hasmore"] || "0") === "1";
  const pageSize = Number(h["X-Finviz-PageSize"] || h["x-finviz-pagesize"] || 20);
  const debug = (h["X-Finviz-Debug"] || h["x-finviz-debug"] || "") as string;
  const eff = (h["X-Finviz-EffectiveF"] || h["x-finviz-effectivef"]) as string | undefined;
  if (eff) gEffectiveF = eff;
  return { hasMore, pageSize, debug, f: gEffectiveF };
}

/**
 * Сначала пробуем через /api/olts (одна инвокация),
 * если olts отсутствует/404/ошибка — откатываемся на прямой /api/finviz (как было раньше).
 */
export async function loadFinviz(
  page: number,
  opts?: { min?: number; f?: string }
): Promise<{ items: FinvizItem[]; meta: Meta }> {
  const params: Record<string, any> = { page };
  const f = opts?.f ?? gEffectiveF;
  if (f) params.f = f;
  if (opts?.min != null) params.min = opts.min;

  // ---------- ПРЯМАЯ ПОПЫТКА ЧЕРЕЗ OLTS ----------
  try {
    const res = await fetch("/api/olts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        concurrency: 4,
        tasks: { finviz: { op: "finviz.default", params } },
      }),
    });

    // если olts есть, но ошибка статуса
    if (!res.ok) throw new Error(`olts status ${res.status}`);

    const json = await res.json();
    const task = json?.results?.finviz;
    if (!task?.ok) {
      const status = task?.status ?? "n/a";
      const err = task?.error || "finviz task failed";
      throw new Error(`olts task err: ${status} ${err}`);
    }

    // заголовки с метаданными от прокинутого finviz
    const headers = (task.headers || {}) as Record<string, string | undefined>;
    const meta = parseMetaFromHeaders(headers);
    const items = Array.isArray(task.data?.items) ? task.data.items : [];

    return { items, meta };
  } catch (_e) {
    // Падать не даём — идём в прямой маршрут, чтобы UI жил.
  }

  // ---------- FALLBACK: ПРЯМОЙ /api/finviz (как раньше) ----------
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
  const res = await fetch(`/api/finviz?${sp.toString()}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Finviz fetch failed: ${res.status}`);

  // подхватываем выбранный сервером effectiveF после первой страницы
  const headersLower: Record<string, string | undefined> = {};
  res.headers.forEach((val, key) => { headersLower[key.toLowerCase()] = val; });
  const meta = parseMetaFromHeaders({
    "X-Finviz-HasMore": headersLower["x-finviz-hasmore"],
    "X-Finviz-PageSize": headersLower["x-finviz-pagesize"],
    "X-Finviz-Debug": headersLower["x-finviz-debug"],
    "X-Finviz-EffectiveF": headersLower["x-finviz-effectivef"],
  });

  const json = await res.json();
  const items = json.items ?? [];
  return { items, meta };
}
