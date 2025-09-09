// /api/fmp/rating.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      res.statusCode = 400;
      return res.end('{"error":"symbol required"}');
    }

    const apikey = process.env.FMP_API_KEY;
    if (!apikey) {
      res.statusCode = 500;
      return res.end('{"error":"FMP_API_KEY not set"}');
    }

    // stable route вместо legacy /api/v3/rating
    const upstream = `https://financialmodelingprep.com/stable/ratings-snapshot?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apikey}&ts=${Date.now()}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    const r = await fetch(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    }).catch((e) => {
      throw new Error(`Upstream fetch failed: ${String(e?.message || e)}`);
    });
    clearTimeout(t);

    const text = await r.text();

    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    // no-store на всех уровнях
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    try {
      const json = JSON.parse(text);
      json.serverTs = Date.now();
      return res.end(JSON.stringify(json));
    } catch {
      return res.end(text);
    }
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
