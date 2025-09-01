// src/api/loadBatch.ts
export type FinvizItem = any;

// модульная «память» выбранного effectiveF
let gEffectiveF: string | undefined;

export function resetFinvizEffectiveFilter() {
  gEffectiveF = undefined;
}

export async function loadFinviz(
  page: number,
  opts?: { min?: number; f?: string }
): Promise<{ items: FinvizItem[]; meta: { hasMore: boolean; pageSize: number; debug: string; f?: string } }> {
  const params = new URLSearchParams();
  params.set("page", String(page));

  const f = opts?.f ?? gEffectiveF;
  if (f) params.set("f", f);
  if (opts?.min != null) params.set("min", String(opts.min));

  const res = await fetch(`/api/finviz?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Finviz fetch failed: ${res.status}`);

  // подхватываем выбранный сервером effectiveF после первой страницы
  const eff = res.headers.get("X-Finviz-EffectiveF") || undefined;
  if (eff) gEffectiveF = eff;

  const json = await res.json();
  const hasMore = (res.headers.get("X-Finviz-HasMore") || "0") === "1";
  const pageSize = Number(res.headers.get("X-Finviz-PageSize") || 20);
  const debug = res.headers.get("X-Finviz-Debug") || "";

  return { items: json.items ?? [], meta: { hasMore, pageSize, debug, f: gEffectiveF } };
}
