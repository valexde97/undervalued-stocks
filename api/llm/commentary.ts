// /api/llm/commentary.ts
export const runtime = "nodejs";

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

// ——— ин-мемори кеш выбора модели
declare global {
  // eslint-disable-next-line no-var
  var __openaiModelCache: { id: string; ts: number } | undefined;
}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 часов

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

  if (globalThis.__openaiModelCache && Date.now() - globalThis.__openaiModelCache.ts < CACHE_TTL_MS) {
    return globalThis.__openaiModelCache.id;
  }

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/v1/models?limit=200`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const id = j?.data ? pickBestModel(j.data) : null;
      if (id) {
        globalThis.__openaiModelCache = { id, ts: Date.now() };
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
  const mod: any = await import("openai"); // динамический импорт — дружит с "type": "commonjs"
  const OpenAI = mod.default ?? mod;
  const baseURL = process.env.OPENAI_BASE_URL ? `${process.env.OPENAI_BASE_URL.replace(/\/+$/, "")}/v1` : undefined;
  return new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"Method Not Allowed"}');
    }

    const key =
      process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY_1; // опциональный бэкап-ключ

    if (!key) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        error: "OPENAI_API_KEY not set",
        hint: "Set OPENAI_API_KEY in .env.local (dev) и в Vercel → Project Settings → Environment Variables (preview/prod); затем перезапусти dev или redeploy."
      }));
    }

    const body: Body = await readBody(req);
    const model = await resolveModel(key);
    const client = await getOpenAIClient(key); // ← ИСПОЛЬЗУЕМ key, а не process.env напрямую

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

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a seasoned buy-side equity analyst." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 700,
    });

    const commentary = completion.choices?.[0]?.message?.content ?? "";

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.end(JSON.stringify({ commentary, modelUsed: model }));
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: e?.message || "Internal Server Error",
      hint:
        status === 401 ? "401 from OpenAI: invalid/missing key или нет доступа к модели."
      : status === 429 ? "429 from OpenAI: rate limit — уменьшите частоту или смените модель."
      : undefined,
    }));
  }
}
