export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const category = (q.get("category") || "general").trim();
    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
    if (!token) { res.statusCode = 500; return res.end('{"error":"FINNHUB token not set"}'); }

    const r = await fetch(`https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${token}`);
    const body = await r.text();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = r.status;
    res.end(body);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
