// /api/fh/profile2.ts
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

    const upstream = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}&ts=${Date.now()}`;

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
    let json: any;
    try { json = JSON.parse(text); } catch { json = { error: "bad json", raw: text }; }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    // унифицируем форму ответа
    res.end(JSON.stringify({ symbol, serverTs: Date.now(), profile: json || null }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
