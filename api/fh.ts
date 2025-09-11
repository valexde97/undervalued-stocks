import type { VercelRequest, VercelResponse } from "@vercel/node";
import quotesBatch from "../server/handlers/fh/quotes-batch";
import quote from "../server/handlers/fh/quote";
import metrics from "../server/handlers/fh/metrics";
import metricsBatch from "../server/handlers/fh/metrics-batch";
import profile2 from "../server/handlers/fh/profile2";
import news from "../server/handlers/fh/news";
import marketStatus from "../server/handlers/fh/marketStatus";
import snapshotBatch from "../server/handlers/fh/snapshot-batch";

const MAP: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any> | any> = {
  "quotes-batch": quotesBatch as any,
  "quote": quote as any,
  "metrics": metrics as any,
  "metrics-batch": metricsBatch as any,
  "profile2": profile2 as any,
  "news": news as any,
  "marketStatus": marketStatus as any,
  "snapshot-batch": snapshotBatch as any,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = String((req.query as any).op || (req.query as any).mode || "").trim() || "quote";
  const fn = MAP[op];
  if (!fn) {
    res.status(400).json({ ok: false, error: "Unknown op, use one of: " + Object.keys(MAP).join(", ") });
    return;
  }
  return fn(req, res);
}
