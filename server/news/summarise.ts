import { ClassifiedItem } from "./types";

function trimTo(input: string, max: number) {
  return input.length <= max ? input : input.slice(0, max);
}

export async function buildInsightsLLM(items: ClassifiedItem[]): Promise<string[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!items.length) return [];

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const bullets = items.slice(0, 10).map((it, i) =>
    `- [${it.sentiment.toUpperCase()}][${it.tags.join(",") || "General"}] ${it.title}`
  ).join("\n");

  const prompt =
    `You are a finance assistant. Extract 3-7 crisp, price-moving bullet points from recent headlines for a single stock.\n` +
    `Focus on DEBT/REFINANCING, MANAGEMENT CHANGES, GUIDANCE/EARNINGS, LEGAL/REGULATORY, CAPITAL ACTIONS.\n` +
    `No fluff. English. Use short bullets (max 20 words each).`;

  const body = {
    model,
    messages: [
      { role: "system", content: "You write concise, price-relevant summaries for equity investors." },
      { role: "user", content: `${prompt}\n\nHeadlines:\n${trimTo(bullets, 6000)}` }
    ],
    temperature: 0.2,
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt: string = j?.choices?.[0]?.message?.content || "";
    const lines = txt.split(/\r?\n/).map(s => s.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean);
    return lines.slice(0, 7);
  } catch {
    return null;
  }
}

export function buildInsightsHeuristic(items: ClassifiedItem[]): string[] {
  if (!items.length) return [];
  const top = items.slice(0, 12);

  const have = (tag: string) => top.some(it => it.tags.includes(tag as any));
  const first = (tag: string) => top.find(it => it.tags.includes(tag as any))?.title;

  const out: string[] = [];
  if (have("Debt")) out.push(`Debt/Refinancing: ${first("Debt")}`);
  if (have("Mgmt")) out.push(`Management: ${first("Mgmt")}`);
  if (have("Guidance")) out.push(`Guidance/Earnings: ${first("Guidance")}`);
  if (have("Legal")) out.push(`Legal/Regulatory: ${first("Legal")}`);
  if (have("Capital")) out.push(`Capital actions: ${first("Capital")}`);

  // добьём до 3-5 пунктов общими сильными заголовками
  for (const it of top) {
    if (out.length >= 5) break;
    if (out.some(s => s.includes(it.title))) continue;
    out.push(it.title);
  }
  return out.slice(0, 7);
}
