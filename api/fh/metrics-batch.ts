// /api/fh/metrics-batch.ts
export const runtime = "nodejs";

type Metrics = {
  marketCap?: number | null;
  pe?: number | null;
  ps?: number | null;
  pb?: number | null;
};

type FinnhubMetric = Record<string, any>;

const CACHE = new Map<string, { m: Metrics; ts: number }>();
const FRESH_MS = 60 * 60 * 1000; // 1h в памяти
const CONCURRENCY = 3;
const GAP_MS = 150;
const TIMEOUT_MS = 15000;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchMetrics(sym: string, token: string): Promise<Metrics> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${token}`;
    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { "user-agent": "undervalued-stocks/1.0" } });
    if (!r.ok) return {};
    const json = (await r.json()) as { metric?: FinnhubMetric };
    const m = json?.metric || {};

    const pe = m.peBasicExclExtraTTM ?? m.peTTM ?? m.peAnnual ?? null;
    const ps = m.psTTM ?? m.priceToSalesTTM ?? null;
    const pb = m.pbMRQ ?? m.priceToBookMRQ ?? null;
    const marketCap = m.marketCapitalization ?? null;

    return { marketCap, pe, ps, pb };
  } catch { return {}; }
  finally { clearTimeout(to); }
}

export default async function handler(req: any, res: any) {
  try {
    // GET ?symbols=AAA,BBB   или POST { symbols: [] }
    const q = new URL(req.url, "http://localhost").searchParams;
    let symbols: string[] = [];
    const p = (q.get("symbols") || "").trim();
    if (p) symbols = p.split(",").map(s => s.trim()).filter(Boolean);
    else if (req.method === "POST") {
      try {
        let buf = ""; for await (const c of req) buf += c.toString("utf8");
        const json = JSON.parse(buf || "{}");
        if (Array.isArray(json?.symbols)) symbols = json.symbols.map((s: any) => String(s)).filter(Boolean);
      } catch {/* noop */}
    }
    symbols = Array.from(new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))).slice(0, 200);
    if (!symbols.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "symbols required" }));
    }

    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "FINNHUB token not set" }));
    }

    const now = Date.now();
    const metrics: Record<string, Metrics> = {};
    const toFetch: string[] = [];

    for (const s of symbols) {
      const hit = CACHE.get(s);
      if (hit && now - hit.ts <= FRESH_MS) metrics[s] = hit.m;
      else toFetch.push(s);
    }

    let idx = 0;
    const worker = async () => {
      while (idx < toFetch.length) {
        const i = idx++; const sym = toFetch[i];
        const m = await fetchMetrics(sym, token);
        metrics[sym] = m;
        CACHE.set(sym, { m, ts: Date.now() });
        if (idx < toFetch.length) await sleep(GAP_MS);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () => worker()));

    res.setHeader("Content-Type", "application/json");
    // CDN кэш на 15 минут, SWR 1 час
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.statusCode = 200;
    res.end(JSON.stringify({ metrics, serverTs: Date.now() }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
