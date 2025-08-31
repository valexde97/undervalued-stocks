// src/pages/api/finviz.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchFinvizSet, PAGE_SIZE } from "../../server/finviz/fetch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const page = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
    const fOverride = typeof req.query.f === "string" ? req.query.f : undefined;
    const minStr = typeof req.query.min === "string" ? req.query.min : undefined;
    const minDesired = Math.max(1, parseInt(minStr || String(PAGE_SIZE), 10) || PAGE_SIZE);

    const { items, debug, hasMore } = await fetchFinvizSet({ page, fOverride, minDesired });

    res.setHeader("X-Finviz-PageSize", String(PAGE_SIZE));
    res.setHeader("X-Finviz-HasMore", hasMore ? "1" : "0");
    res.setHeader("X-Finviz-Debug", debug.map((d) => `${d.stage}:${d.count}`).join(","));
    // кэш на CDN/верчеле (можно ослабить/усилить)
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");

    res.status(200).json({
      page,
      pageSize: PAGE_SIZE,
      count: items.length,
      items,
      stages: debug,
    });
  } catch (e: any) {
    res.status(500).json({ page: 0, count: 0, items: [], error: String(e?.message || e) });
  }
}
