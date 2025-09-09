// /api/av/overview.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "symbol required" }));
    }

    const key = process.env.ALPHAVANTAGE_KEY || process.env.VITE_ALPHA_VANTAGE_KEY;
    if (!key) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "ALPHAVANTAGE_KEY not set" }));
    }

    const upstream = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    }).catch((e) => {
      throw new Error(`Upstream fetch failed: ${String(e?.message || e)}`);
    });
    clearTimeout(t);

    const text = await r.text();

    if ((r.headers.get("content-type") || "").includes("text/html") || text.trim().startsWith("<")) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        symbol,
        error: "Alpha Vantage returned HTML (likely route mismatch or block)",
        hint: "Check function=OVERVIEW, apikey, and rate limits.",
      }));
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ symbol, error: "Invalid JSON from Alpha Vantage" }));
    }

    if (json?.Note || json?.Information) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.end(JSON.stringify({
        symbol,
        error: "Rate limited by Alpha Vantage",
        note: json.Note || json.Information,
      }));
    }
    if (json?.["Error Message"]) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ symbol, error: json["Error Message"] }));
    }

    // ✅ Return exactly what the frontend expects
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=86400");
    return res.end(JSON.stringify({
      serverTs: Date.now(),
      overview: json,   // <-- frontend reads av.Description from this object
    }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
