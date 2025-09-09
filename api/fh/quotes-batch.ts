// /api/fh/quotes-batch.ts
export const runtime = "nodejs";

type Quote = {
  c?: number; o?: number; h?: number; l?: number; pc?: number; dp?: number; d?: number; t?: number
};
type SearchHit = { symbol: string; description?: string; type?: string };

// ---- Caches & rate limiting ----
const CACHE = new Map<string, { quote: Quote | null; ts: number }>(); // price cache by ORIGINAL symbol
const RESOLVE_CACHE = new Map<string, string>();                    
let GLOBAL_BACKOFF_UNTIL = 0;

const FRESH_MS = 15_000;
const PER_REQ_GAP_MS = 150;
const GLOBAL_BACKOFF_MS = 30_000;

const MAX_INPUT = 200;
const CONCURRENCY = 5;
const TIMEOUT_MS = 12_000;

// ---- Utils ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const canon = (s: string) => s.replace(/[\s\-_.]/g, "").toUpperCase();

async function fetchQuote(sym: string, token: string): Promise<Quote | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`;
    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { "user-agent": "undervalued-stocks/1.0" } });
    if (r.status === 429) { GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS; return null; }
    if (!r.ok) return null;
    const data = (await r.json()) as Quote;
    if (typeof data?.c !== "number" || !Number.isFinite(data.c) || data.c <= 0) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

async function searchBestSymbol(raw: string, token: string, companyName?: string | null): Promise<string | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(raw)}&token=${token}`;
    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { "user-agent": "undervalued-stocks/1.0" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { count?: number; result?: SearchHit[] };
    const arr = data?.result ?? [];
    if (!arr.length) return null;

    const rawC = canon(raw);
    let best: SearchHit | null = arr.find(it => canon(it.symbol) === rawC) ?? null;

    const preferTypes = new Set(["Common Stock", "Preferred Stock", "Common Stock ADR"]);
    const ranked = arr
      .map(it => {
        const scoreSymbol = canon(it.symbol) === rawC ? 3 : 0;
        const scoreType = preferTypes.has((it.type || "").trim()) ? 2 : 0;
        const scoreName = companyName && it.description
          ? (it.description.toLowerCase().includes(companyName.toLowerCase().slice(0, 12)) ? 1 : 0)
          : 0;
        return { it, score: scoreSymbol + scoreType + scoreName };
      })
      .sort((a, b) => b.score - a.score);

    if (!best && ranked[0] && ranked[0].score > 0) best = ranked[0].it;
    return best?.symbol || null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

// простые варианты до search() — МАССИВ вместо генератора (чтобы не требовался downlevelIteration)
function generateSymbolVariants(sym: string): string[] {
  const out = [sym];
  if (sym.includes("-")) out.push(sym.replace(/-/g, "."));
  if (sym.includes(".")) out.push(sym.replace(/\./g, "-"));
  if (/[ _]/.test(sym)) out.push(sym.replace(/[ _]/g, ""));
  return Array.from(new Set(out));
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;

    // symbols из GET или POST
    let symbols: string[] = [];
    const symbolsParam = (q.get("symbols") || "").trim();
    if (symbolsParam) {
      symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean);
    } else if (req.method === "POST") {
      try {
        const body = await new Promise<string>((resolve) => {
          let buf = "";
          req.on("data", (c: Buffer) => (buf += c.toString("utf8")));
          req.on("end", () => resolve(buf));
        });
        const parsed = JSON.parse(body || "{}");
        if (Array.isArray(parsed?.symbols)) {
          symbols = parsed.symbols.map((s: any) => String(s)).filter(Boolean);
        }
      } catch { /* empty */ }
    }
    symbols = Array.from(new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))).slice(0, MAX_INPUT);

    if (!symbols.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "symbols required" }));
    }

    const now = Date.now();
    const underBackoff = now < GLOBAL_BACKOFF_UNTIL;

    const quotes: Record<string, Quote | null> = {};
    const servedFromCache = new Set<string>();
    const toFetch: string[] = [];

    // из кэша то, что свежее; остальное — в очередь
    for (const sym of symbols) {
      const hit = CACHE.get(sym);
      if (!underBackoff && hit && now - hit.ts <= FRESH_MS) {
        quotes[sym] = hit.quote ?? null;
        servedFromCache.add(sym);
      } else {
        toFetch.push(sym);
      }
    }

    // Прямая попытка
    if (!underBackoff && toFetch.length) {
      const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
      if (!token) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "FINNHUB token not set" }));
      }

      let idx = 0;
      let hit429 = false;

      const worker = async () => {
        while (idx < toFetch.length && !hit429) {
          const my = idx++;
          const sym = toFetch[my];

          let data: Quote | null = null;
          for (const candidate of generateSymbolVariants(sym)) {
            data = await fetchQuote(candidate, token);
            if (data === null && Date.now() < GLOBAL_BACKOFF_UNTIL) { hit429 = true; break; }
            if (data) break;
          }
          if (hit429) break;

          quotes[sym] = data ?? null;
          CACHE.set(sym, { quote: data ?? null, ts: Date.now() });

          if (idx < toFetch.length) await sleep(PER_REQ_GAP_MS);
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () => worker()));
    }

    const unresolved = !underBackoff ? symbols.filter(s => quotes[s] == null) : [];

    if (!underBackoff && unresolved.length) {
      const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN!;
      let i2 = 0;
      let hit429b = false;

      const worker2 = async () => {
        while (i2 < unresolved.length && !hit429b) {
          const sym = unresolved[i2++];

          let resolved = RESOLVE_CACHE.get(sym) || null;
          if (!resolved) {
            resolved = await searchBestSymbol(sym, token);
            if (resolved) RESOLVE_CACHE.set(sym, resolved);
          }

          if (resolved && resolved !== sym) {
            const q2 = await fetchQuote(resolved, token);
            if (q2 === null && Date.now() < GLOBAL_BACKOFF_UNTIL) { hit429b = true; break; }
            if (q2) {
              quotes[sym] = q2;
              CACHE.set(sym, { quote: q2, ts: Date.now() });
            }
          }

          if (i2 < unresolved.length) await sleep(PER_REQ_GAP_MS);
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unresolved.length) }, () => worker2()));
    }

    // заполнение пропусков
    for (const sym of symbols) {
      if (!(sym in quotes)) {
        const hit = CACHE.get(sym);
        if (hit) { quotes[sym] = hit.quote ?? null; servedFromCache.add(sym); }
        else quotes[sym] = null;
      }
    }

    // ---- Headers & response ----
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    if (now < GLOBAL_BACKOFF_UNTIL) res.setHeader("Retry-After", Math.ceil((GLOBAL_BACKOFF_UNTIL - now) / 1000));

    // BACK-COMPAT: помимо quotes отдадим ещё items[]
    const items = symbols.map((symbol) => ({
      symbol,
      quote: quotes[symbol] ?? null,
      cached: servedFromCache.has(symbol),
    }));

    res.statusCode = 200;
    res.end(JSON.stringify({
      quotes,
      items,
      resolved: Object.fromEntries(Array.from(RESOLVE_CACHE.entries()).filter(([k]) => symbols.includes(k))),
      serverTs: Date.now(),
      backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined
    }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
