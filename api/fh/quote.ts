// api/fh/quote.ts
export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim();
    if (!symbol) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "symbol required" }));
    }

    const token = process.env.VITE_FINNHUB_TOKEN || process.env.FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "FINNHUB token not set" }));
    }

    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
    );
    const body = await r.text();
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    res.end(body);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
