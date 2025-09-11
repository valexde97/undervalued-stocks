// /api/llm/_diag.ts
export const runtime = "nodejs";
export default async function handler(_req: any, res: any) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({
    has: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      VITE_OPENAI_API_KEY: !!process.env.VITE_OPENAI_API_KEY,
      NEXT_PUBLIC_OPENAI_API_KEY: !!process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    }
  }));
}
