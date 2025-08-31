// /api/fh/quotes-batch.ts
export const runtime = "nodejs";

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number; t?: number };

const CACHE = new Map<
  string,
  { quote: Quote | null; ts: number }
>();
let GLOBAL_BACKOFF_UNTIL = 0;

const FRESH_MS = 15_000;        // считаем данные свежими 15с
const PER_REQ_GAP_MS = 250;     // пауза между запросами
const GLOBAL_BACKOFF_MS = 30_000; // если словили 429 — «отдыхаем» 30с

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbolsParam = (q.get("symbols") || "").trim();
    if (!symbolsParam) {
      res.statusCode = 400;
      return res.end('{"error":"symbols required"}');
    }
    const rawSymbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const symbols = Array.from(new Set(rawSymbols)).slice(0, 24); // страховка

    // если под глобальным бэкоффом — отдадим кэш/пустые
    const now = Date.now();
    const underBackoff = now < GLOBAL_BACKOFF_UNTIL;

    const out: Array<{ symbol: string; quote: Quote | null; cached?: boolean }> = [];

    // что свежо — берём из кэша
    const toFetch: string[] = [];
    for (const sym of symbols) {
      const hit = CACHE.get(sym);
      if (!underBackoff && hit && now - hit.ts <= FRESH_MS) {
        out.push({ symbol: sym, quote: hit.quote, cached: true });
      } else {
        toFetch.push(sym);
      }
    }

    // последовательные запросы к Finnhub (бережно)
    if (!underBackoff && toFetch.length) {
      const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN;
      if (!token) {
        res.statusCode = 500;
        return res.end('{"error":"FINNHUB token not set"}');
      }

      for (let i = 0; i < toFetch.length; i++) {
        const sym = toFetch[i];
        try {
          const ctrl = new AbortController();
          const upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`;
          const r = await fetch(upstream, {
            cache: "no-store",
            signal: ctrl.signal,
            headers: { "user-agent": "undervalued-stocks/1.0" },
          });
          if (r.status === 429) {
            GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS;
            // добьём ответ тем, что есть в кэше, остальным — null
            break;
          }
          const data = (await r.json()) as Quote;
          const item = { symbol: sym, quote: data, cached: false };
          CACHE.set(sym, { quote: data, ts: Date.now() });
          out.push(item);
        } catch {
          out.push({ symbol: sym, quote: null });
        }
        if (i < toFetch.length - 1) {
          await sleep(PER_REQ_GAP_MS);
        }
      }
    }

    // тем, кого не закрыли ни фетчем, ни кэшем — ставим null/кэш
    for (const sym of symbols) {
      if (!out.find((x) => x.symbol === sym)) {
        const hit = CACHE.get(sym);
        out.push({ symbol: sym, quote: hit?.quote ?? null, cached: !!hit });
      }
    }

    // кэш на CDN (очень короткий), чтобы погасить всплески
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    if (underBackoff) res.setHeader("Retry-After", Math.ceil((GLOBAL_BACKOFF_UNTIL - Date.now()) / 1000));

    res.statusCode = 200;
    res.end(JSON.stringify({ items: out, serverTs: Date.now(), backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}

