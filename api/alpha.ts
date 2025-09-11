import type { VercelRequest, VercelResponse } from "@vercel/node";
import alphaOverview from "../server/handlers/alpha/overwiev";
import avOverview from "../server/handlers/av/overview";

const MAP: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any> | any> = {
  "alpha-overview": alphaOverview as any,
  "av-overview": avOverview as any,
  "overview": avOverview as any, // default to av version
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = String((req.query as any).op || (req.query as any).mode || "overview").trim();
  const fn = MAP[op];
  if (!fn) {
    res.status(400).json({ ok: false, error: "Unknown op, use one of: " + Object.keys(MAP).join(", ") });
    return;
  }
  return fn(req, res);
}
