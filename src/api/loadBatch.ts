export type FinvizItem = any;


export async function loadFinviz(
page: number,
opts?: { min?: number; f?: string }
): Promise<{ items: FinvizItem[]; meta: { hasMore: boolean; pageSize: number; debug: string } }>
{
const params = new URLSearchParams();
params.set("page", String(page));
if (opts?.min != null) params.set("min", String(opts.min));
if (opts?.f) params.set("f", opts.f);


const res = await fetch(`/api/finviz?${params.toString()}`, {
headers: { Accept: "application/json" },
});
if (!res.ok) throw new Error(`Finviz fetch failed: ${res.status}`);


const json = await res.json();
const hasMore = (res.headers.get("X-Finviz-HasMore") || "0") === "1";
const pageSize = Number(res.headers.get("X-Finviz-PageSize") || 20);
const debug = res.headers.get("X-Finviz-Debug") || "";


return { items: json.items ?? [], meta: { hasMore, pageSize, debug } };
}

