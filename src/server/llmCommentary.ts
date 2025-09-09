// /server/llmCommentary.ts
// Единый хендлер для POST /api/llm/commentary
// Ожидает JSON с полями: { symbol, priceNow, category, metric, valuation }
// Возвращает: { commentary: string }

type CommentaryBody = {
  symbol?: string;
  priceNow?: number;
  category?: "small" | "mid" | "large" | null;
  metric?: Record<string, any>;
  valuation?: {
    blended?: { low: number | null; base: number | null; high: number | null } | null;
    altCalcs?: Array<{ label: string; low?: number | null; base?: number | null; high?: number | null }>;
    warnings?: string[];
    compositeAverage?: number | null;
  };
};

function readJSON(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: any) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", (e: any) => reject(e));
  });
}

function send(res: any, code: number, obj: any) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export async function llmCommentary(req: any, res: any) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return send(res, 500, { error: "OPENAI_API_KEY not set" });
    }

    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const body = (await readJSON(req)) as CommentaryBody;

    const payload = {
      model,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Ты — аналитик акций. Отвечай кратко, по делу, на русском. Формат: 1) Вердикт (WATCHLIST/BUY/AVOID), 2) Ключевые метрики и что они значат, 3) Риски/триггеры, 4) Что мониторить. Не давай инвестиционных рекомендаций, только анализ. Без лишней воды.",
        },
        {
          role: "user",
          content: JSON.stringify({
            symbol: body.symbol ?? null,
            priceNow: body.priceNow ?? null,
            category: body.category ?? null,
            metric: body.metric ?? null,
            valuation: body.valuation ?? null,
          }),
        },
      ],
    };

    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      // Пробросим 429/квоты и пр. — на клиенте есть красивый претер
      return send(res, resp.status, { error: text || resp.statusText });
    }

    let data: any = {};
    try { data = JSON.parse(text); } catch {/* ignore */}

    const commentary =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      "Не удалось сформировать комментарий.";

    // Анти-кэш на уровне CDN: пусть кэш делает фронт (sessionStorage)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return send(res, 200, { commentary });
  } catch (e: any) {
    return send(res, 500, { error: String(e?.message || e) });
  }
}
