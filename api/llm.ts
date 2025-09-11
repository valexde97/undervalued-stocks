import type { VercelRequest, VercelResponse } from "@vercel/node";
import commentary from "../server/handlers/llm/commentary";
import diag from "../server/handlers/llm/_diag";

const MAP: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any> | any> = {
  "commentary": commentary as any,
  "diag": diag as any,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = String((req.query as any).op || (req.query as any).mode || "commentary").trim();
  const fn = MAP[op];
  if (!fn) {
    res.status(400).json({ ok: false, error: "Unknown op, use one of: " + Object.keys(MAP).join(", ") });
    return;
  }
  return fn(req, res);
}
