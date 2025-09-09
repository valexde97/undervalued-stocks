// /api/fh/snapshot-batch.ts
export const runtime = "nodejs";

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number; dp?: number; d?: number; t?: number };
type Profile = {
  name?: string;
  exchange?: string;
  country?: string;
  currency?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number; // Finnhub profile2: МИЛЛИОНЫ USD
  logo?: string;
};

type SnapItem = {
  ticker: string;
  // lite-профиль
  name?: string | null;
  industry?: string | null;
  country?: string | null;
  marketCapM?: number | null; // всегда МЛН USD
  logo?: string | null;
  // котировка
  price?: number | null;
  changePct?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
};

const QUOTE_CACHE = new Map<string, { q: Quote | null; ts: number }>();
const PROF_CACHE  = new Map<string, { p: Profile | null; ts: number }>();
let GLOBAL_BACKOFF_UNTIL = 0;

const Q_FRESH_MS = 15_000;
const P_FRESH_MS = 600_000;
const GLOBAL_BACKOFF_MS = 30_000;

const MAX_INPUT = 200;
const CONCURRENCY = 5;
const GAP_MS = 150;
const TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function capMFromProfile2(v?: number | null) {
  // Finnhub profile2.marketCapitalization уже в МЛН USD
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

async function fetchJSON<T>(url: string, noStore = true): Promise<T | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      cache: noStore ? "no-store" : "default",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    });
    if (r.status === 429) { GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS; return null; }
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}
async function getQuote(sym: string, token: string): Promise<Quote | null> {
  const now = Date.now();
  const hit = QUOTE_CACHE.get(sym);
  if (hit && (now - hit.ts) <= Q_FRESH_MS && hit.q) return hit.q;

  const tryFetch = async (): Promise<Quote | null> => {
    const data = await fetchJSON<Quote>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`);
    const q = (typeof data?.c === "number" && data.c > 0) ? data : null;
    return q;
  };

  let q = await tryFetch();
  if (!q && Date.now() >= GLOBAL_BACKOFF_UNTIL) {
    // маленький ретрай
    await sleep(120);
    q = await tryFetch();
  }

  // кэшируем ТОЛЬКО валидные данные
  if (q) QUOTE_CACHE.set(sym, { q, ts: Date.now() });
  return q;
}

async function getProfile(sym: string, token: string): Promise<Profile | null> {
  const now = Date.now();
  const hit = PROF_CACHE.get(sym);
  if (hit && (now - hit.ts) <= P_FRESH_MS && hit.p) return hit.p;

  const tryFetch = async (): Promise<Profile | null> => {
    const data = await fetchJSON<Profile>(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`);
    return data ?? null;
  };

  let p = await tryFetch();
  if (!p && Date.now() >= GLOBAL_BACKOFF_UNTIL) {
    await sleep(120);
    p = await tryFetch();
  }

  if (p) PROF_CACHE.set(sym, { p, ts: Date.now() });
  return p;
}


export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    let symbols = String(q.get("symbols") || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    symbols = Array.from(new Set(symbols)).slice(0, MAX_INPUT);

    if (!symbols.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"symbols required"}');
    }

    const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"FINNHUB token not set"}');
    }

    const now = Date.now();
    const underBackoff = now < GLOBAL_BACKOFF_UNTIL;

    const items: SnapItem[] = new Array(symbols.length).fill(null).map((_, i) => ({ ticker: symbols[i] }));

    let idx = 0, hit429 = false;
    const worker = async () => {
      while (idx < symbols.length && !hit429) {
        const my = idx++;
        const sym = symbols[my];

        const [p, q] = underBackoff
          ? [PROF_CACHE.get(sym)?.p ?? null, QUOTE_CACHE.get(sym)?.q ?? null]
          : await Promise.all([getProfile(sym, token), getQuote(sym, token)]);

        if (!underBackoff && (Date.now() < GLOBAL_BACKOFF_UNTIL)) { hit429 = true; break; }

        const marketCapM = capMFromProfile2(p?.marketCapitalization ?? null);
        const prev = (typeof q?.pc === "number" && q.pc > 0) ? q.pc : null;
        const price = (typeof q?.c === "number" && q.c > 0) ? q.c : null;
        const dp = (q?.dp != null && Number.isFinite(q.dp))
          ? q.dp
          : (price != null && prev != null && prev !== 0)
            ? ((price - prev) / prev) * 100
            : null;

        items[my] = {
          ticker: sym,
          name: p?.name?.trim() || null,
          industry: p?.finnhubIndustry ?? null,
          country: p?.country ?? null,
          marketCapM,
          logo: (p as any)?.logo ?? null,
          price,
          changePct: dp,
          open: q?.o ?? null,
          high: q?.h ?? null,
          low: q?.l ?? null,
          prevClose: prev,
        };

        if (idx < symbols.length) await sleep(GAP_MS);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()));

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    if (Date.now() < GLOBAL_BACKOFF_UNTIL) {
      res.setHeader("Retry-After", String(Math.ceil((GLOBAL_BACKOFF_UNTIL - Date.now()) / 1000)));
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ items, serverTs: Date.now(), backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
