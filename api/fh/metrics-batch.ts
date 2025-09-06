// /api/fh/metrics-batch.ts
export const runtime = "nodejs";

type Json = Record<string, any>;
type OutMetrics = { marketCap?: number | null; pe?: number | null; ps?: number | null; pb?: number | null };

const CACHE = new Map<string, { m: OutMetrics | null; ts: number }>();
let GLOBAL_BACKOFF_UNTIL = 0;

const MAX_INPUT = 200;
const FRESH_MS = 600_000;        // 10 мин кэш метрик
const PER_REQ_GAP_MS = 200;
const CONCURRENCY = 4;
const GLOBAL_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchMetrics(sym: string, token: string): Promise<OutMetrics | null> {
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${token}`;
  const r = await fetch(url, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
  if (r.status === 429) {
    GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS;
    return null;
  }
  if (!r.ok) return null;
  const data: Json = await r.json();
  const m: Json = data?.metric ?? {};

  // Finnhub иногда меняет ключи — берём с запасом
  const out: OutMetrics = {
    marketCap: typeof m.marketCapitalization === "number" ? m.marketCapitalization : null, // в млрд USD
    pe: m.peBasicExclExtraTTM ?? m.peExclExtraTTM ?? m.peTTM ?? null,
    ps: m.priceToSalesTTM ?? m.psTTM ?? null,
    pb: m.priceToBookMRQ ?? m.priceToBookAnnual ?? null,
  };
  return out;
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;

    let symbols: string[] = [];
    const symbolsParam = (q.get("symbols") || "").trim();
    if (symbolsParam) {
      symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (req.method === "POST") {
      try {
        const body = await new Promise<string>((resolve) => {
          let buf = ""; req.on("data", (c: Buffer) => (buf += c.toString("utf8"))); req.on("end", () => resolve(buf));
        });
        const parsed = JSON.parse(body || "{}");
        if (Array.isArray(parsed?.symbols)) symbols = parsed.symbols.map((s: any) => String(s)).filter(Boolean);
      } catch { /* noop */ }
    }
    symbols = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, MAX_INPUT);

    if (symbols.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "symbols required" }));
    }

    const token = process.env.VITE_FINNHUB_TOKEN || process.env.FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "FINNHUB token not set" }));
    }

    const now = Date.now();
    const underBackoff = now < GLOBAL_BACKOFF_UNTIL;

    const metrics: Record<string, OutMetrics | null> = {};
    const toFetch: string[] = [];

    for (const sym of symbols) {
      const hit = CACHE.get(sym);
      if (!underBackoff && hit && now - hit.ts <= FRESH_MS) {
        metrics[sym] = hit.m ?? null;
      } else {
        toFetch.push(sym);
      }
    }

    if (!underBackoff && toFetch.length) {
      let idx = 0;
      let hit429 = false;

      const worker = async () => {
        while (idx < toFetch.length && !hit429) {
          const my = idx++;
          const sym = toFetch[my];
          const m = await fetchMetrics(sym, token);
          if (m === null && Date.now() < GLOBAL_BACKOFF_UNTIL) {
            hit429 = true; break;
          }
          metrics[sym] = m ?? null;
          CACHE.set(sym, { m: m ?? null, ts: Date.now() });
          if (idx < toFetch.length) await sleep(PER_REQ_GAP_MS);
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () => worker()));
    }

    // добиваем пропуски кэшем/нуллами
    for (const sym of symbols) {
      if (!(sym in metrics)) {
        const hit = CACHE.get(sym);
        metrics[sym] = hit?.m ?? null;
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    if (underBackoff) {
      res.setHeader("Retry-After", Math.ceil((GLOBAL_BACKOFF_UNTIL - Date.now()) / 1000));
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ metrics, serverTs: Date.now(), backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
