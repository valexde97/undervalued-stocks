// /api/fh/quote.ts
export const runtime = "nodejs";

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim();
    if (!symbol) {
      res.statusCode = 400;
      return res.end('{"error":"symbol required"}');
    }

    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      return res.end('{"error":"FINNHUB token not set"}');
    }

    const upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      symbol
    )}&token=${token}&ts=${Date.now()}`; // анти-кеш на апстриме

    // короткие таймауты, no-store
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);

    const r = await fetch(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    }).catch((e) => {
      throw new Error(`Upstream fetch failed: ${String(e?.message || e)}`);
    });
    clearTimeout(t);

    const text = await r.text();

    // Проброс статуса и анти-кеш заголовков на все уровни
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    // Добавим serverTs, чтобы на клиенте легко детектить свежесть
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
