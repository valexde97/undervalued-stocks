import type { VercelRequest, VercelResponse } from "@vercel/node";
import companyFacts from "../server/handlers/sec/company-facts";
const MAP: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any> | any> = {
  "company-facts": companyFacts as any,
};
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = String((req.query as any).op || (req.query as any).mode || "company-facts").trim();
  const fn = MAP[op];
  if (!fn) {
    res.status(400).json({ ok: false, error: "Unknown op, use one of: " + Object.keys(MAP).join(", ") });
    return;
  }
  return fn(req, res);
}
