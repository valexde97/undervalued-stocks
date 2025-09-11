import type { VercelRequest, VercelResponse } from "@vercel/node";
import finvizHandler from "../server/handlers/finviz";
import { aggregateNews } from "../server/news/aggregate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const feature = String((req.query as any)?.feature || "").toLowerCase();
    if (feature === "news") {
      const symbol = String((req.query as any)?.symbol || "").toUpperCase().trim();
      if (!symbol) {
        res.status(400).json({ error: "symbol is required" });
        return;
      }
      const lookbackDays = Math.max(1, Math.min(60, Number((req.query as any)?.lookbackDays ?? 14) | 0));
      const limit = Math.max(1, Math.min(100, Number((req.query as any)?.limit ?? 20) | 0));

      const result = await aggregateNews({ symbol, lookbackDays, limit });
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      res.status(200).json(result);
      return;
    }

    // старый путь
    return finvizHandler(req as any, res as any);
  } catch (err: any) {
    console.error("api/finviz error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
