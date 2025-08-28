// /api/finviz.ts  ← твой существующий путь (как раньше)
export const runtime = "nodejs";
import { fetchFinvizSet, PAGE_SIZE } from "../src/server/finviz/fetch"; // проверь относительный путь!

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, "http://localhost");
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const fOverride = url.searchParams.get("f") || undefined;
    const minStr = url.searchParams.get("min") || undefined;
    const minDesired = Math.max(1, parseInt(minStr || String(PAGE_SIZE), 10) || PAGE_SIZE);

    const { items, debug } = await fetchFinvizSet({ page, fOverride, minDesired });

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", String(items.length === PAGE_SIZE ? 1 : 0));
    res.setHeader("X-Finviz-Debug", debug.map(d => `${d.stage}:${d.count}`).join(","));
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({
      page,
      pageSize: PAGE_SIZE,
      count: items.length,
      items,
      stages: debug,
    }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ page: 0, count: 0, items: [], error: String(e?.message || e) }));
  }
}
