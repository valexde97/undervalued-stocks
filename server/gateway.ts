import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";

function parseTickersRanks(s: string): Array<{ ticker: string; rank: number }> {
  return s.split(",").map(x => x.trim()).filter(Boolean).map(pair => {
    const [t, r] = pair.split(":");
    return { ticker: (t || "").toUpperCase(), rank: Math.max(1, Number(r) || 1) };
  });
}
function pickThemeBySeed(seed: number) {
  const THEMES = ["motivation","success","growth","mountain","sunrise","focus","strength","inspiration","ocean","city night","abstract","forest","desert","cityscape"];
  return THEMES[Math.abs(seed) % THEMES.length];
}

async function fetchWordsBatch(langs: string[], n: number, topic: string, seed: string) {
  if (!OPENAI_API_KEY) return [];
  const system = "You output compact JSON only. No commentary.";
  const user = JSON.stringify({
    instruction: "Return C1-level single words (no phrases), same concept across languages. Output exactly `count` items.",
    count: n, languages: langs, topic,
    format: "array of objects keyed by language codes",
    example: [{ ru:"устремление", de:"Entschlossenheit", en:"resolve", es:"determinación" }]
  });

  const r = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role:"system", content: system }, { role:"user", content: user }],
      temperature: 0.6, n: 1, user: `covers-${seed}`
    })
  });
  if (!r.ok) return [];
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content ?? "[]";
  try { return JSON.parse(txt) as Array<Record<string,string>>; } catch { return []; }
}

async function fetchImagesBatch(n: number, seedNum: number) {
  if (!PEXELS_API_KEY) return [];
  const theme = pickThemeBySeed(seedNum);
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", theme);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", String(Math.min(Math.max(n,1), 30)));
  url.searchParams.set("page", String((Math.abs(seedNum) % 50) + 1));

  const r = await fetch(url.toString(), { headers: { Authorization: PEXELS_API_KEY } });
  if (!r.ok) return [];
  const data = await r.json();
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return photos.slice(0, n).map((ph: any) => ({
    url: ph?.src?.landscape || ph?.src?.large2x || ph?.src?.medium || null,
    author: ph?.photographer || null,
    link: ph?.url || null,
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const action = String(req.query.action || "").toLowerCase();

    if (action === "coversbatch") {
      const pairs = parseTickersRanks(String(req.query.tickers || "")).slice(0, 40);
      const n = pairs.length;
      const langs = Array.from(new Set(String(req.query.langs || "ru,de,en,es").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)));
      const topic = String(req.query.topic || "motivation");
      const seed = pairs.map(p => `${p.ticker}:${p.rank}`).join(",");

      const [wordsArr, imagesArr] = await Promise.all([
        fetchWordsBatch(langs, n, topic, seed),
        fetchImagesBatch(n, seed.length),
      ]);

      const items = pairs.map((p, i) => ({
        ticker: p.ticker,
        rank: p.rank,
        words: Array.isArray(wordsArr) ? (wordsArr[i] ?? null) : null,
        image: Array.isArray(imagesArr) ? (imagesArr[i] ?? null) : null,
      }));

      res.setHeader("Cache-Control","public, max-age=60, s-maxage=60");
      return res.status(200).json({ items });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e:any) {
    return res.status(200).json({ items: [], error: String(e?.message || e) });
  }
}
