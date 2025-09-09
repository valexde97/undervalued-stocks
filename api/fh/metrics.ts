// /api/fh/metrics.ts
// Finnhub fundamentals (metric=all). Pass-through всей "metric" + serverTs.

export const runtime = "nodejs";

type Json = Record<string, any>;

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();

    if (!symbol) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"symbol required"}');
    }

    const token = process.env.VITE_FINNHUB_TOKEN || process.env.FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"FINNHUB token not set"}');
    }

    const upstream = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(
      symbol
    )}&metric=all&token=${token}&ts=${Date.now()}`;

    // короткий таймаут и no-store
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);

    const r = await fetch(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    }).catch((e) => {
      throw new Error(`Upstream fetch failed: ${String((e as any)?.message || e)}`);
    });
    clearTimeout(t);

    const text = await r.text();

    // Анти-кеш заголовки на все уровни
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    // Pass-through, но добавляем serverTs и symbol
    try {
      const json: Json = JSON.parse(text);
      const out = {
        symbol,
        serverTs: Date.now(),
        metric: json?.metric ?? {},
        // при желании можно посмотреть json.metricType / json.series
        metricType: json?.metricType ?? null,
      };
      return res.end(JSON.stringify(out));
    } catch {
      return res.end(text);
    }
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
