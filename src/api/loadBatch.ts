// src/api/loadBatch.ts
export async function loadFinviz(page: number): Promise<{ items: any[] }> {
  const res = await fetch(`/api/finviz?page=${page}`);
  if (!res.ok) throw new Error(`Finviz fetch failed: ${res.status}`);
  const json = await res.json();
  return { items: json.items ?? [] };
}
