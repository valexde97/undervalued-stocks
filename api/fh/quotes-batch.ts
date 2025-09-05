// /api/fh/quotes-batch.ts
export const runtime = "nodejs";

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number; dp?: number; d?: number; t?: number };

const CACHE = new Map<string, { quote: Quote | null; ts: number }>();
let GLOBAL_BACKOFF_UNTIL = 0;

const FRESH_MS = 15_000;          // считаем данные свежими 15с
const PER_REQ_GAP_MS = 150;       // пауза в потоке одного воркера
const GLOBAL_BACKOFF_MS = 30_000; // при 429 — «отдыхаем» 30с

const MAX_INPUT = 200;            // до 200 тикеров за вызов
const CONCURRENCY = 5;            // одновременных воркеров
const TIMEOUT_MS = 12_000;        // таймаут одного upstream-запроса

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchQuote(sym: string, token: string): Promise<Quote | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`;
    const r = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    });
    if (r.status === 429) {
      GLOBAL_BACKOFF_UNTIL = Date.now() + GLOBAL_BACKOFF_MS;
      return null;
    }
    if (!r.ok) return null;
    const data = (await r.json()) as Quote;
    return data;
  } finally {
    clearTimeout(to);
  }
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;

    // Поддержка GET ?symbols=AAA,BBB и POST { symbols: [] }
    let symbols: string[] = [];
    const symbolsParam = (q.get("symbols") || "").trim();
    if (symbolsParam) {
      symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
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
      } catch { /* noop */ }
    }
    symbols = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, MAX_INPUT);

    if (symbols.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "symbols required" }));
    }

    const now = Date.now();
    const underBackoff = now < GLOBAL_BACKOFF_UNTIL;

    const quotes: Record<string, Quote | null> = {};
    const cachedSet = new Set<string>(); // пометим тех, кто из кэша

    // что свежо — берём из кэша
    const toFetch: string[] = [];
    for (const sym of symbols) {
      const hit = CACHE.get(sym);
      if (!underBackoff && hit && now - hit.ts <= FRESH_MS) {
        quotes[sym] = hit.quote ?? null;
        cachedSet.add(sym);
      } else {
        toFetch.push(sym);
      }
    }

    // Воркеры с фиксированной конкуррентностью
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
          const data = await fetchQuote(sym, token);
          if (data === null && Date.now() < GLOBAL_BACKOFF_UNTIL) {
            hit429 = true;
            break;
          }
          quotes[sym] = data ?? null;
          CACHE.set(sym, { quote: data ?? null, ts: Date.now() });
          if (idx < toFetch.length) await sleep(PER_REQ_GAP_MS);
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () => worker())
      );
    }

    // добиваем пропуски (если под бэкоффом — отдадим кэш/нуллы)
    for (const sym of symbols) {
      if (!(sym in quotes)) {
        const hit = CACHE.get(sym);
        quotes[sym] = hit?.quote ?? null;
        if (hit) cachedSet.add(sym);
      }
    }

    // Заголовки CDN + Retry-After при бэкоффе
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    if (underBackoff) {
      res.setHeader("Retry-After", Math.ceil((GLOBAL_BACKOFF_UNTIL - Date.now()) / 1000));
    }

    // items — для отладки (совместимость со старым клиентом)
    const items = Object.entries(quotes).map(([symbol, quote]) => ({
      symbol,
      quote,
      cached: cachedSet.has(symbol),
    }));

    res.statusCode = 200;
    res.end(JSON.stringify({
      quotes,   // <- читает фронт
      items,    // <- для дебага/совместимости
      serverTs: Date.now(),
      backoffUntil: GLOBAL_BACKOFF_UNTIL || undefined,
    }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
