// /api/fh/marketStatus.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"FINNHUB token not set"}');
    }
    const url = `https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${token}&_=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    const body = await r.text();
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.end(body);
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
