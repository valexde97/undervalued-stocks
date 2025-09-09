export const runtime = "nodejs";

type Quote = {
  c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number;
  serverTs?: number;
};

type CacheEntry<T> = { exp: number; data: T; };
const MEM_TTL_MS_DEFAULT = 15_000; // 15s
const MEM_CAP = 256;
const mem = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

function getMem<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { mem.delete(key); return null; }
  return e.data as T;
}
function putMem<T>(key: string, data: T, ttlMs: number) {
  if (mem.size >= MEM_CAP) {
    const firstKey = mem.keys().next().value;
    if (firstKey) mem.delete(firstKey);
  }
  mem.set(key, { exp: Date.now() + ttlMs, data });
}

async function fetchWithRetries(url: string, init?: RequestInit, tries = 5): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        lastErr = new Error(`${r.status} ${r.statusText}`);
      } else if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}`);
      } else {
        return r;
      }
    } catch (e: any) {
      lastErr = e;
    }
    const base = 250 * Math.pow(2, i);
    const jitter = Math.floor(Math.random() * 200);
    await new Promise(r => setTimeout(r, base + jitter));
  }
  throw lastErr || new Error("Upstream failed");
}

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

    // Кэш поведение
    const ttlParam = Math.max(0, Math.min(300, parseInt(String(q.get("ttl") ?? ""), 10) || MEM_TTL_MS_DEFAULT / 1000));
    const ttlMs = ttlParam * 1000;
    const nocache = q.get("nocache") === "1";

    const key = `fh:${symbol.toUpperCase()}`;
    if (!nocache) {
      const cached = getMem<Quote>(key);
      if (cached) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", `s-maxage=${Math.floor(ttlMs/1000)}, stale-while-revalidate=${Math.floor(ttlMs/1000)*3}`);
        res.setHeader("Vercel-CDN-Cache-Control", `s-maxage=${Math.floor(ttlMs/1000)}, stale-while-revalidate=${Math.floor(ttlMs/1000)*3}`);
        res.setHeader("X-Cache", "HIT");
        return res.end(JSON.stringify(cached));
      }
    }

    const upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);

    const p = inflight.get(key) ?? fetchWithRetries(upstream, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "undervalued-stocks/1.0" },
    });
    inflight.set(key, p);

    const r = await p.finally(() => inflight.delete(key));
    clearTimeout(t);

    const json = await r.json().catch(async () => {
      const txt = await r.text().catch(() => "");
      return { raw: txt };
    });

    const out: Quote = { ...(json || {}), serverTs: Date.now() };

    if (!nocache && ttlMs > 0) putMem(key, out, ttlMs);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", `s-maxage=${Math.floor(ttlMs/1000)}, stale-while-revalidate=${Math.floor(ttlMs/1000)*3}`);
    res.setHeader("Vercel-CDN-Cache-Control", `s-maxage=${Math.floor(ttlMs/1000)}, stale-while-revalidate=${Math.floor(ttlMs/1000)*3}`);
    res.setHeader("X-Cache", "MISS");
    return res.end(JSON.stringify(out));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
