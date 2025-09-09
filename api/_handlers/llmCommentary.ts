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

// -------- in-memory infra --------
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

const REASONING_EFFORT = (process.env.LLM_REASONING_EFFORT || "high") as "minimal"|"low"|"medium"|"high";
const VERBOSITY = (process.env.LLM_VERBOSITY || "medium") as "low"|"medium"|"high";
const ENABLE_WEB = (process.env.LLM_ENABLE_WEB || "0") === "1";
const WEB_DOMAINS = (process.env.LLM_WEB_DOMAINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const now = () => Date.now();

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
  if (item.tokens >= 1) { item.tokens -= 1; map.set(key, item); return true; }
  map.set(key, item); return false;
}
function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
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
      if (id) { globalThis.__openaiModelCache = { id, ts: now() }; return id; }
    }
  } catch { /* empty */ }
  return "gpt-4o-mini";
}
async function readBody(req: any): Promise<any> {
  try {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  } catch { /* empty */ }
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
  } catch { /* empty */ }
  return {};
}
async function getOpenAIClient(key: string) {
  const mod: any = await import("openai");
  const OpenAI = mod.default ?? mod;
  const baseURL = process.env.OPENAI_BASE_URL ? `${process.env.OPENAI_BASE_URL.replace(/\/+$/, "")}/v1` : undefined;
  return new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
}

// ---------- улучшенный офлайн-фоллбек: полноценный Markdown-отчёт ----------
function fmt(n: number | null | undefined, digits = 1) {
  return n == null || !isFinite(n as any) ? "n/a" : Number(n).toFixed(digits);
}
function pct(x: number | null | undefined, digits = 1) {
  return x == null || !isFinite(x as any) ? "n/a" : (x >= 0 ? "+" : "") + (x * 100).toFixed(digits) + "%";
}
function nnum(x: any): number | null {
  const v = Number(x); return isFinite(v) ? v : null;
}
function fallbackReport(b: Body): string {
  const M = b.metric || {};
  const W = b.valuation?.warnings || [];

  const pe   = nnum((M as any).pe ?? (M as any).peTTM ?? (M as any).peInclExtraTTM ?? (M as any).peExclExtraTTM);
  const ps   = nnum((M as any).ps ?? (M as any).psTTM);
  const pb   = nnum((M as any).pb ?? (M as any).ptbvQuarterly ?? (M as any).ptbvAnnual);
  const pfcf = nnum((M as any).pfcf ?? (M as any).pfcfShareTTM ?? (M as any).pfcfShareAnnual);
  const gm   = nnum((M as any).grossMargin);
  const nm   = nnum((M as any).netMargin ?? (M as any).netProfitMarginTTM);
  const roe  = nnum((M as any).roe ?? (M as any).roeTTM);
  const roic = nnum((M as any).roic ?? (M as any).roicTTM);
  const gr   = nnum((M as any).revGyoy ?? (M as any).revenueGrowthTTMYoy);
  const beta = nnum((M as any).beta);
  const de   = nnum((M as any).debtToEquity);
  const cr   = nnum((M as any).currentRatio);

  const cheapSignals: string[] = [];
  if (pe   != null && pe   > 0 && pe   < 15) cheapSignals.push(`P/E ${fmt(pe,1)} < 15`);
  if (pfcf != null && pfcf > 0 && pfcf < 15) cheapSignals.push(`P/FCF ${fmt(pfcf,1)} < 15`);
  if (ps   != null && ps   > 0 && ps   < 1)  cheapSignals.push(`P/S ${fmt(ps,2)} < 1`);
  if (pb   != null && pb   > 0 && pb   < 1.5)cheapSignals.push(`P/B ${fmt(pb,2)} < 1.5`);

  const redFlags: string[] = [];
  if (nm   != null && nm   < 0)   redFlags.push("negative net margin");
  if (roe  != null && roe  < 5)   redFlags.push("low ROE");
  if (roic != null && roic < 6)   redFlags.push("sub-par ROIC");
  if (gr   != null && gr   < 0)   redFlags.push("negative revenue growth");
  if (de   != null && de   > 1.5) redFlags.push("high D/E");
  if (cr   != null && cr   < 1)   redFlags.push("weak liquidity");

  const fv = b.valuation?.blended;
  const basePT = nnum(fv?.base ?? b.valuation?.compositeAverage);
  const lowPT  = nnum(fv?.low  ?? (basePT!=null ? basePT*0.7 : null));
  const highPT = nnum(fv?.high ?? (basePT!=null ? basePT*1.3 : null));

  const price = nnum(b.priceNow);
  const baseUpside = price!=null && basePT!=null ? (basePT - price) / price : null;
  const lowUpside  = price!=null && lowPT !=null ? (lowPT  - price) / price : null;
  const highUpside = price!=null && highPT!=null ? (highPT - price) / price : null;

  // Вердикт (очень грубые эвристики)
  const undervalued = cheapSignals.length >= 2;
  const qualityWeak = redFlags.length >= 2;
  const verdict = undervalued && !qualityWeak
    ? "BUY candidate (valuation attractive; quality acceptable)"
    : undervalued && qualityWeak
    ? "WATCHLIST (cheap, but quality/trajectory weak)"
    : "AVOID for now (no clear valuation edge)";

  // Вероятности сценариев (эвристика)
  let pBear = 0.25, pBase = 0.5, pBull = 0.25;
  if (qualityWeak) { pBear = 0.35; pBase = 0.45; pBull = 0.20; }

  const rows = [
    ["Bear", `${nm!=null&&nm<0?"Losses persist; ":""}growth ≤ 0%; de-risk multiples`, `${Math.round(pBear*100)}%`,
      lowPT!=null? `$${fmt(lowPT,2)}`:"n/a", lowUpside!=null? pct(lowUpside):"n/a"],
    ["Base", "Margins stabilize; muted growth; mean-revert multiples", `${Math.round(pBase*100)}%`,
      basePT!=null?`$${fmt(basePT,2)}`:"n/a", baseUpside!=null?pct(baseUpside):"n/a"],
    ["Bull", "Margins expand; growth re-accelerates; higher quality multiple", `${Math.round(pBull*100)}%`,
      highPT!=null?`$${fmt(highPT,2)}`:"n/a", highUpside!=null?pct(highUpside):"n/a"],
  ];

  const calcNote = (b.valuation?.altCalcs?.length ?? 0) >= 2
    ? "Calculators diverge because PS (growth-driven) vs PB (asset/ROE-driven) vs PE/PFCF (profitability/FCF) load different regimes."
    : "";

  const warnText = [...W].join("; ");

  return [
    `**Verdict:** ${verdict}`,
    "",
    `# Investment thesis`,
    (undervalued ? `- Valuation signals (${cheapSignals.join(", ")}) indicate mispricing.` : `- No strong valuation edge on raw multiples.`),
    (qualityWeak ? `- Quality headwinds: ${redFlags.join(", ")}.` : `- Quality/profitability profile acceptable at current price.`),
    `- Positioning depends on profitability trajectory and balance-sheet risk.`,
    "",
    `# Valuation vs history & peers`,
    `- **P/E:** ${fmt(pe,1)}  | **P/FCF:** ${fmt(pfcf,1)}  | **P/S:** ${fmt(ps,2)}  | **P/B:** ${fmt(pb,2)}`,
    `- **Fair value (blended):** Low ${lowPT!=null?`$${fmt(lowPT,2)}`:"n/a"} / Base ${basePT!=null?`$${fmt(basePT,2)}`:"n/a"} / High ${highPT!=null?`$${fmt(highPT,2)}`:"n/a"}`,
    price!=null ? `- **Upside from $${fmt(price,2)}:** Low ${pct(lowUpside)} | Base ${pct(baseUpside)} | High ${pct(highUpside)}` : "",
    calcNote ? `- ${calcNote}` : "",
    "",
    `# Quality & profitability`,
    `- **Margins:** gross ${pct(gm!=null?gm/100:null)}, net ${pct(nm!=null?nm/100:null)}; **ROE:** ${fmt(roe,1)}%; **ROIC:** ${fmt(roic,1)}%`,
    `- **Cash conversion:** proxy via P/FCF; very low multiple suggests market doubts on durability.`,
    "",
    `# Balance sheet & liquidity`,
    `- **D/E:** ${fmt(de,2)}; **Current ratio:** ${fmt(cr,2)}  ${de!=null&&de>1.5?"(elevated leverage)":"".trim()}`,
    "",
    `# Growth & moat`,
    `- **Revenue growth (YoY/TTM):** ${fmt(gr,1)}% ${gr!=null&&gr<0?"(contraction)":"".trim()}; pricing power/moat uncertain.`,
    "",
    `# Risks`,
    `- ${[...redFlags, "execution risk", beta!=null&&beta>1.3?"high beta/volatility":"market cyclicality"].join("; ")}.`,
    warnText ? `- Warnings: ${warnText}.` : "",
    "",
    `# Scenario matrix (12–18m)`,
    `| Scenario | Assumptions | Probability | PT | Upside |`,
    `|---|---|---:|---:|---:|`,
    ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`),
    "",
    `# Positioning`,
    qualityWeak
      ? `- **Sizing:** starter (≤1–2%) / wait for proof (net margin ≥ 0%, D/E ≤ 1.0).`
      : `- **Sizing:** small-to-core (2–4%) with risk controls.`,
    "",
    `# What to monitor next`,
    `- Net margin turning **≥ 0%** and trending +;`,
    `- ROIC **> 10–12%**;`,
    `- D/E **< 1.0** and interest coverage improving;`,
    `- Revenue growth **≥ +5–10% YoY**;`,
    `- FCF margin trending up;`,
    `- Share count stability (no dilution);`,
    `- Any covenant/credit-rating updates.`,
  ].filter(Boolean).join("\n");
}

// ---------- утилита: текст из Responses API ----------
function extractTextFromResponses(resp: any): string {
  const out = resp?.output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
      }
    }
  }
  return text.trim();
}

// ---------- промпт ----------
function buildPrompt(b: Body) {
  const inputJson = JSON.stringify(b, null, 2);
  return `
You are a buy-side equity analyst. Using the JSON below (current price, key TTM metrics, basic fair-value calcs),
produce a **concise but deep** investment note with sections:

1) Investment thesis — 2–3 bullets on WHY it can outperform/underperform (drivers & bottlenecks).
2) Valuation vs history & peers — interpret PE, P/FCF, PS, PB; comment on blended FV (low/base/high) and upside/downside %.
3) Quality & profitability — margins, ROE/ROIC, cash conversion; flag accounting red flags and dilution.
4) Balance sheet & liquidity — leverage (D/E), interest coverage proxy, liquidity (current ratio).
5) Growth & moat — revenue growth (YoY/TTM), cyclicality, pricing power.
6) Risks — 3–5 crisp bullets (operational/financial/industry/regulatory).
7) Scenario matrix — a small table with Bear/Base/Bull: assumptions + probability + 12-18m PT.
8) Positioning — sizing guidance (starter/full/avoid) and what would change your mind.
9) What to monitor next — 5–7 **quantitative** triggers with thresholds (e.g., "ROIC > 12%", "net margin turns positive", "D/E < 1.0").

RULES:
- No fluff, no disclaimers. Be specific. Use numbers from input where possible.
- If calculators disagree, explain the **mechanics** (PS vs PB vs PE/PFCF) and what regime would favor each.
- Output in Markdown with clear section headers and a 1-line **Verdict** at the top.

INPUT JSON:
${inputJson}
`.trim();
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
        hint: "Set OPENAI_API_KEY in .env.local и в Vercel → Environment Variables; перезапусти dev/redeploy.",
      }));
    }

    const body: Body = await readBody(req);

    // ---- rate-limit + cache ----
    const { cache, inflight, rateIp, rateSym } = getMaps();
    const ip  = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const sym = body?.symbol || "unknown";
    if (!tokenBucketAllow(rateIp, ip, RATE_PER_MIN_IP))   { res.statusCode = 429; res.setHeader("Content-Type","application/json"); return res.end('{"error":"Too Many Requests (per IP)"}'); }
    if (!tokenBucketAllow(rateSym, sym, RATE_PER_MIN_SYMBOL)) { res.statusCode = 429; res.setHeader("Content-Type","application/json"); return res.end('{"error":"Too Many Requests (per symbol)"}'); }

    const compactInput = JSON.stringify({ s: sym, p: body.priceNow, c: body.category, m: body.metric, v: body.valuation });
    const cacheKey = `LLM:${sym}:${hashString(compactInput)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.exp > now()) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-LLM-Mode", "cache");
      return res.end(JSON.stringify({ commentary: cached.val, modelUsed: "cache" }));
    }

    const prompt = buildPrompt(body);
    const modelEnv = (process.env.OPENAI_MODEL || "").trim();
    const client = await getOpenAIClient(key);

    // --- ВАЖНО: вместо nested function-declaration — только const = () => {} ---
    const runWithGPT5 = async (): Promise<string> => {
      const req: any = {
        model: modelEnv || "gpt-5",
        reasoning: { effort: REASONING_EFFORT },
        verbosity: VERBOSITY,
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are a seasoned buy-side equity analyst." }] },
          { role: "user",   content: [{ type: "input_text", text: prompt }] },
        ],
        max_output_tokens: 900,
      };
      if (ENABLE_WEB) {
        req.tools = [{ type: "web_search", ...(WEB_DOMAINS.length ? { filters: { domains: WEB_DOMAINS } } : {}) }];
        req.tool_choice = "auto";
      }
      const resp = await (client as any).responses.create(req);
      const text = extractTextFromResponses(resp);
      return text || "";
    };

    const runWithChatCompletions = async (): Promise<string> => {
      const model = modelEnv || await resolveModel(key);
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are a seasoned buy-side equity analyst." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 900,
      });
      return completion.choices?.[0]?.message?.content ?? "";
    };

    const runLLM = async (): Promise<{ text: string; mode: string }> => {
      try {
        if (modelEnv.startsWith("gpt-5")) {
          const text = await runWithGPT5();
          if (text) return { text, mode: "gpt-5" };
        }
        const text = await runWithChatCompletions();
        if (text) return { text, mode: "chat" };
        return { text: fallbackReport(body), mode: "fallback-empty" };
      } catch (e: any) {
        const status = Number(e?.status) || 0;
        const msg = String(e?.message || e);
        if (status === 429 || /quota/i.test(msg)) {
          return { text: fallbackReport(body), mode: "fallback-quota" };
        }
        return { text: fallbackReport(body), mode: "fallback-error" };
      }
    };

    // дедупликация
    let p = inflight.get(cacheKey);
    if (!p) { p = (async () => (await runLLM()).text)(); inflight.set(cacheKey, p); }
    const text = await p.finally(() => inflight.delete(cacheKey));

    if (text) cache.set(cacheKey, { val: text, exp: now() + LLM_TTL_MS });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Cache", cached ? "HIT" : "MISS");
    res.setHeader("X-LLM-Mode", modelEnv.startsWith("gpt-5") ? "gpt-5" : "chat-or-fallback");
    return res.end(JSON.stringify({ commentary: text || fallbackReport(body), modelUsed: modelEnv || "auto" }));
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
