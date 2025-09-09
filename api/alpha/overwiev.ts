// /api/alpha/overview.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();
    if (!symbol) { res.statusCode = 400; return res.end('{"error":"symbol required"}'); }

    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key) { res.statusCode = 500; return res.end('{"error":"ALPHAVANTAGE_API_KEY not set"}'); }

    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key}&ts=${Date.now()}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { "user-agent": "undervalued-stocks/1.0" }});
    clearTimeout(t);

    const json = await r.json();
    // If quota exceeded or invalid key, AV returns an object with "Note" or "Information"
    if (json?.Note || json?.Information) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ symbol, serverTs: Date.now(), overview: null, error: json.Note || json.Information }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.end(JSON.stringify({ symbol, serverTs: Date.now(), overview: json || null }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
