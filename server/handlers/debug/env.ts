// /api/debug/env.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  const yes = (v: any) => Boolean(v);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    ok: true,
    OPENAI_API_KEY: yes(process.env.OPENAI_API_KEY),   // ← ДОЛЖНО быть true
    OPENAI_MODEL: process.env.OPENAI_MODEL || null,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || null,
    node: process.version
  }));
}
