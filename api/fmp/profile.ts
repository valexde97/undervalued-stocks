// /api/fmp/profile.ts
// Берём бесплатный профиль компании у FMP и проксируем без CORS/ключа на клиенте.
// FMP docs: GET https://financialmodelingprep.com/api/v3/profile/{SYMBOL}?apikey=KEY

export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"symbol required"}');
    }

    const key = process.env.FMP_API_KEY || process.env.VITE_FMP_API_KEY;
    if (!key) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"FMP_API_KEY not set"}');
    }

    const upstream = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(key)}&ts=${Date.now()}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    const r = await fetch(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    }).catch((e) => {
      throw new Error(`Upstream fetch failed: ${String((e as any)?.message || e)}`);
    });
    clearTimeout(t);

    const text = await r.text();

    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    // жёсткий анти-кеш
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    try {
      const arr = JSON.parse(text);
      const first = Array.isArray(arr) ? arr[0] : arr;
      return res.end(JSON.stringify({ symbol, serverTs: Date.now(), profile: first || null }));
    } catch {
      return res.end(text);
    }
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
