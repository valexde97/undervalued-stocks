// /api/fh/metrics-batch.ts
export const runtime = "nodejs";

type Json = Record<string, any>;
type OutMetrics = {
  // ВСЕГДА в МИЛЛИОНАХ USD
  marketCapM?: number | null;
  // мультипликаторы
  pe?: number | null;
  ps?: number | null;
  pb?: number | null;
  // базовый профиль
  name?: string | null;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
};

const CACHE = new Map<string, { m: OutMetrics | null; ts: number }>();
let GLOBAL_BACKOFF_UNTIL = 0;

const MAX_INPUT = 200;
const FRESH_MS = 600_000;       // 10 мин кэш метрик
const PER_REQ_GAP_MS = 200;     // пауза между символами в воркере
const CONCURRENCY = 4;          // 4-6 было в ТЗ — ставлю 4 как безопасно
const GLOBAL_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeCapToMillions(v?: number | null): number | null {
  // На практике finnhub profile2.marketCapitalization чаще в миллиардах,
  // но иногда уже в миллионах. Приводим к МИЛЛИОНАМ надежно.
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  let m = v * 1000; // предполагаем, что пришло в млрд -> млн
  // если «раздулось» сверх разумного, понижаем масштаб
  while (m > 5_000_000) m = m / 1000; // 5 трлн. — безопасный верхний порог
  return m;
}

async function fetchProfile(sym: string, token: string): Promise<Partial<OutMetrics> | null> {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
  const r = await fetch(url, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
  if (r.status === 429) {
    GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS;
    return null;
  }
  if (!r.ok) return null;

  const p: Json = await r.json();
  const out: Partial<OutMetrics> = {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : null,
    exchange: p.exchange ?? null,
    country: p.country ?? null,
    currency: p.currency ?? null,
    marketCapM: normalizeCapToMillions(
      typeof p.marketCapitalization === "number" ? p.marketCapitalization : null
    ),
  };
  return out;
}

async function fetchRatios(sym: string, token: string): Promise<Partial<OutMetrics> | null> {
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${token}`;
  const r = await fetch(url, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
  if (r.status === 429) {
    GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS;
    return null;
  }
  if (!r.ok) return null;

  const data: Json = await r.json();
  const m: Json = data?.metric ?? {};
  const out: Partial<OutMetrics> = {
    pe: m.peBasicExclExtraTTM ?? m.peExclExtraTTM ?? m.peTTM ?? null,
    ps: m.priceToSalesTTM ?? m.psTTM ?? null,
    pb: m.priceToBookMRQ ?? m.priceToBookAnnual ?? null,
  };
  return out;
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;

    // GET ?symbols=AAA,BBB или POST { symbols: [] }
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

    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
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

          // сначала профиль (name + cap), затем мультипликаторы
          const prof = await fetchProfile(sym, token);
          if (prof === null && Date.now() < GLOBAL_BACKOFF_UNTIL) { hit429 = true; break; }

          const ratios = await fetchRatios(sym, token);
          if (ratios === null && Date.now() < GLOBAL_BACKOFF_UNTIL) { hit429 = true; break; }

          const merged: OutMetrics = { ...(prof ?? {}), ...(ratios ?? {}) };

          metrics[sym] = Object.keys(merged).length ? merged : null;
          CACHE.set(sym, { m: metrics[sym], ts: Date.now() });

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
    if (now < GLOBAL_BACKOFF_UNTIL) {
      res.setHeader("Retry-After", Math.ceil((GLOBAL_BACKOFF_UNTIL - now) / 1000));
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ metrics, serverTs: Date.now(), backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
