// /api/_handlers/llmCommentary.ts

type Body = {
  symbol: string;
  priceNow: number;
  category: "small" | "mid" | "large" | null;
  metric: Record<string, any>;
  valuation: {
    blended: { low: number | null; base: number | null; high: number | null } | null;
    compositeAverage: number | null;
    altCalcs: Array<{ label: string; low: number | null; base: number | null; high: number | null }>;
    warnings: string[];
  };
};

// -------- in-memory infra (между инвокациями на тёплом инстансе) --------
declare global {
  // eslint-disable-next-line no-var
  var __openaiModelCache: { id: string; ts: number } | undefined;
  // eslint-disable-next-line no-var
  var __llm_cache: Map<string, { val: string; exp: number }> | undefined;
  // eslint-disable-next-line no-var
  var __llm_inflight: Map<string, Promise<string>> | undefined;
  // eslint-disable-next-line no-var
  var __rate_ip: Map<string, { tokens: number; ts: number }> | undefined;
  // eslint-disable-next-line no-var
  var __rate_sym: Map<string, { tokens: number; ts: number }> | undefined;
}

const CACHE_TTL_MS_MODEL = 6 * 60 * 60 * 1000; // 6h
const LLM_TTL_MS = (Number(process.env.LLM_TTL_S || 6 * 60 * 60) || 21600) * 1000; // default 6h
const RATE_PER_MIN_IP = Number(process.env.LLM_RPM_IP || 8);
const RATE_PER_MIN_SYMBOL = Number(process.env.LLM_RPM_SYMBOL || 3);

function now() { return Date.now(); }

function getMaps() {
  if (!globalThis.__llm_cache) globalThis.__llm_cache = new Map();
  if (!globalThis.__llm_inflight) globalThis.__llm_inflight = new Map();
  if (!globalThis.__rate_ip) globalThis.__rate_ip = new Map();
  if (!globalThis.__rate_sym) globalThis.__rate_sym = new Map();
  return {
    cache: globalThis.__llm_cache!,
    inflight: globalThis.__llm_inflight!,
    rateIp: globalThis.__rate_ip!,
    rateSym: globalThis.__rate_sym!,
  };
}

function tokenBucketAllow(map: Map<string, { tokens: number; ts: number }>, key: string, ratePerMin: number): boolean {
  const CAP = Math.max(ratePerMin, 1);
  const t = now();
  const item = map.get(key) || { tokens: CAP, ts: t };
  const refill = (ratePerMin / 60000) * (t - item.ts);
  item.tokens = Math.min(CAP, item.tokens + refill);
  item.ts = t;
  if (item.tokens >= 1) {
    item.tokens -= 1;
    map.set(key, item);
    return true;
  }
  map.set(key, item);
  return false;
}

function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// -------------------- helpers --------------------
function pickBestModel(list: Array<{ id: string; created?: number }>): string | null {
  const bad = ["realtime", "whisper", "tts", "audio", "embedding"];
  const ok = list
    .filter(m => m.id?.startsWith("gpt-") && !bad.some(b => m.id.includes(b)))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return ok[0]?.id ?? null;
}

async function resolveModel(key: string): Promise<string> {
  const envModel =
    process.env.OPENAI_MODEL ||
    process.env.VITE_OPENAI_MODEL ||
    process.env.NEXT_PUBLIC_OPENAI_MODEL ||
    "";
  if (envModel.trim()) return envModel.trim();

  if (globalThis.__openaiModelCache && now() - globalThis.__openaiModelCache.ts < CACHE_TTL_MS_MODEL) {
    return globalThis.__openaiModelCache.id;
  }

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/v1/models?limit=200`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const id = j?.data ? pickBestModel(j.data) : null;
      if (id) {
        globalThis.__openaiModelCache = { id, ts: now() };
        return id;
      }
    }
  } catch { /* ignore */ }

  return "gpt-4o-mini";
}

async function readBody(req: any): Promise<any> {
  try {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  } catch { /* noop */ }

  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      if (!req.on) return resolve();
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve());
      req.on("error", (e: any) => reject(e));
    });
    if (chunks.length) {
      const text = Buffer.concat(chunks).toString("utf8");
      return text ? JSON.parse(text) : {};
    }
  } catch { /* noop */ }

  return {};
}

async function getOpenAIClient(key: string) {
  const mod: any = await import("openai"); // динамический импорт под "type": "commonjs"
  const OpenAI = mod.default ?? mod;
  const baseURL = process.env.OPENAI_BASE_URL ? `${process.env.OPENAI_BASE_URL.replace(/\/+$/, "")}/v1` : undefined;
  return new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
}

function fallbackCommentary(b: Body): string {
  const M = b.metric || {};
  const W = b.valuation?.warnings || [];
  const bullets: string[] = [];

  const pe = Number((M as any).pe ?? (M as any).peTTM ?? (M as any).peInclExtraTTM ?? (M as any).peExclExtraTTM ?? NaN);
  const ps = Number((M as any).ps ?? (M as any).psTTM ?? NaN);
  const pb = Number((M as any).pb ?? (M as any).ptbvQuarterly ?? (M as any).ptbvAnnual ?? NaN);
  const pfcf = Number((M as any).pfcf ?? (M as any).pfcfShareTTM ?? (M as any).pfcfShareAnnual ?? NaN);

  const cheap: string[] = [];
  if (!isNaN(pe) && pe > 0 && pe < 15) cheap.push(`P/E ${pe.toFixed(1)} < 15`);
  if (!isNaN(ps) && ps > 0 && ps < 1) cheap.push(`P/S ${ps.toFixed(2)} < 1`);
  if (!isNaN(pb) && pb > 0 && pb < 1.5) cheap.push(`P/B ${pb.toFixed(2)} < 1.5`);
  if (!isNaN(pfcf) && pfcf > 0 && pfcf < 15) cheap.push(`P/FCF ${pfcf.toFixed(1)} < 15`);
  if (cheap.length) bullets.push(`Valuation looks inexpensive: ${cheap.join(", ")}.`);

  const red: string[] = [];
  if (Number((M as any).netMargin ?? NaN) < 0) red.push("negative net margin");
  if (Number((M as any).roe ?? NaN) < 5) red.push("low ROE");
  if (Number((M as any).revGyoy ?? NaN) < 0) red.push("negative revenue growth");
  if (Number((M as any).debtToEquity ?? NaN) > 1.5) red.push("high D/E");
  if (Number((M as any).currentRatio ?? NaN) < 1) red.push("weak liquidity");
  if (red.length) bullets.push(`Red flags: ${red.join(", ")}.`);

  if (b.valuation?.blended) {
    const { low, base, high } = b.valuation.blended;
    const parts = [
      low != null ? `Low ≈ ${low}` : null,
      base != null ? `Base ≈ ${base}` : null,
      high != null ? `High ≈ ${high}` : null,
    ].filter(Boolean);
    if (parts.length) bullets.push(`Fair-value blended: ${parts.join(" | ")}.`);
  }

  const comps = b.valuation?.altCalcs?.filter(a => a.base != null) ?? [];
  if (comps.length >= 2) bullets.push(`Disagreement across calculators suggests sensitivity to multiples mix (PS vs PB vs P/FCF).`);

  if (W.length) bullets.push(`Warnings: ${W.join("; ")}.`);

  bullets.push(`Action: add to watchlist; size small until profitability/quality improve.`);
  bullets.push(`What to monitor next: margins trend, leverage, dilution, YoY revenue growth.`);

  return "• " + bullets.join("\n• ");
}

// -------------------- основной обработчик --------------------
export async function llmCommentary(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"Method Not Allowed"}');
    }

    const key = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_1 || "";
    if (!key) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "OPENAI_API_KEY not set",
        hint: "Set OPENAI_API_KEY in .env.local (dev) и в Vercel → Environment Variables; перезапусти dev/сделай redeploy.",
      }));
    }

    const body: Body = await readBody(req);

    // ---- rate-limit + cache + дедупликация ----
    const { cache, rateIp, rateSym } = getMaps();
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || "unknown";
    const sym = body?.symbol || "unknown";

    if (!tokenBucketAllow(rateIp, ip, RATE_PER_MIN_IP)) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Too Many Requests (per IP)" }));
    }
    if (!tokenBucketAllow(rateSym, sym, RATE_PER_MIN_SYMBOL)) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Too Many Requests (per symbol)" }));
    }

    const compactInput = JSON.stringify({
      s: sym,
      p: body.priceNow,
      c: body.category,
      m: body.metric,
      v: body.valuation,
    });
    const cacheKey = `LLM:${sym}:${hashString(compactInput)}`;

    const cached = cache.get(cacheKey);
    if (cached && cached.exp > now()) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-LLM-Mode", "cache");
      return res.end(JSON.stringify({ commentary: cached.val, modelUsed: "cache" }));
    }

    // Собираем prompt
    const prompt = `
You are an equity analyst. Given current price, compact financial metrics and several fair value calculators,
write a concise commentary (6–10 bullet points) that:
- highlights signals that support undervaluation or overvaluation,
- calls out red flags (profitability, dilution, leverage, quality),
- explains why calculators differ (PS vs PB vs PE/PFCF),
- states a prudent action framework (watchlist, avoid, sizing, need more data),
- ends with "What to monitor next".
No fluff, no disclaimers.

INPUT JSON:
${JSON.stringify(body, null, 2)}
`;

    async function runLLM(): Promise<{ text: string; mode: string }> {
      const model = await resolveModel(key);
      const client = await getOpenAIClient(key);

      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: "You are a seasoned buy-side equity analyst." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 600,
        });
        const text = completion.choices?.[0]?.message?.content ?? "";
        return { text, mode: "openai" };
      } catch (e: any) {
        const msg = String(e?.message || e);
        const status = Number(e?.status) || 0;

        // quota → сразу фоллбек, НО 200
        if (status === 429 && /quota/i.test(msg)) {
          return { text: fallbackCommentary(body), mode: "fallback-quota" };
        }

        // rate-limit → короткий retry; если не вышло — фоллбек
        if (status === 429) {
          await new Promise(r => setTimeout(r, 400 + Math.floor(Math.random() * 300)));
          try {
            const completion2 = await client.chat.completions.create({
              model,
              messages: [
                { role: "system", content: "You are a seasoned buy-side equity analyst." },
                { role: "user", content: prompt },
              ],
              temperature: 0.3,
              max_tokens: 600,
            });
            const text2 = completion2.choices?.[0]?.message?.content ?? "";
            return { text: text2, mode: "openai-retry" };
          } catch {
            return { text: fallbackCommentary(body), mode: "fallback-rate" };
          }
        }

        // любые другие ошибки → фоллбек
        return { text: fallbackCommentary(body), mode: "fallback-error" };
      }
    }

    // Дедупликация "в полёте"
    const { inflight } = getMaps();
    let p = inflight.get(cacheKey);
    if (!p) {
      p = (async () => (await runLLM()).text)();
      inflight.set(cacheKey, p);
    }
    const text = await p.finally(() => inflight.delete(cacheKey));

    if (text) {
      getMaps().cache.set(cacheKey, { val: text, exp: now() + LLM_TTL_MS });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Cache", cached ? "HIT" : "MISS");
    // mode уже учли внутри runLLM; простое определение:
    res.setHeader("X-LLM-Mode", cached ? "cache" : "openai-or-fallback");
    return res.end(JSON.stringify({ commentary: text || fallbackCommentary(body), modelUsed: cached ? "cache" : "openai-or-fallback" }));
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: e?.message || "Internal Server Error",
      hint:
        status === 401 ? "Invalid/missing key или нет доступа к модели."
        : status === 429 ? "Rate limit / quota. Включите billing или снизьте частоту."
        : undefined,
    }));
  }
}
