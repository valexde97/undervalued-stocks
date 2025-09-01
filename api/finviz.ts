// /api/finviz.ts  (корень проекта, для Vercel serverless + vercel dev)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchFinvizSet, PAGE_SIZE } from "../src/server/finviz/fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const page = Math.max(0, parseInt(String((req.query as any).page ?? "0"), 10) || 0);
    const fOverride = typeof (req.query as any).f === "string" ? (req.query as any).f : undefined;
    const minStr = typeof (req.query as any).min === "string" ? (req.query as any).min : undefined;
    const minDesired = Math.max(1, parseInt(minStr || String(PAGE_SIZE), 10) || PAGE_SIZE);

    const { items, debug, hasMore, effectiveF } = await fetchFinvizSet({
      page,
      fOverride,
      minDesired,
    });

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
    res.setHeader("X-Finviz-Debug", debug.map((d) => `${d.stage}:${d.count}`).join(","));
    if (effectiveF) res.setHeader("X-Finviz-EffectiveF", effectiveF);
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");

    res.status(200).json({
      page,
      pageSize: PAGE_SIZE,
      count: items.length,
      items,
      stages: debug,
      effectiveF, // на всякий, дублирую и в body
    });
  } catch (e: any) {
    res.status(500).json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
