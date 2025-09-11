import type { VercelRequest, VercelResponse } from "@vercel/node";
import env from "../server/handlers/debug/env";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return env(req as any, res as any);
}
