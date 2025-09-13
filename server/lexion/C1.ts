// /server/lexicon/c1.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const langsParam = String(req.query.langs || "ru,de,en,es");
    const langs = Array.from(new Set(langsParam.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)));
    const n = Math.max(1, Math.min(4, Number(req.query.n ?? 1) | 0));
    const topic = String(req.query.topic || "motivation");
    const seed = String(req.query.q || "seed");

    if (!OPENAI_API_KEY) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ items: [], error: "missing OPENAI_API_KEY" });
    }

    const system = "You output compact JSON only. No commentary.";
    const user = JSON.stringify({
      instruction: "Return C1-level single words (no phrases), same concept across languages.",
      count: n,
      languages: langs,
      topic,
      format: "array of objects keyed by language codes",
      example: [{ ru:"устремление", de:"Entschlossenheit", en:"resolve", es:"determinación" }]
    });

    const r = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role:"system", content: system },
          { role:"user", content: user }
        ],
        temperature: 0.7,
        n: 1,
        user: `lexicon-${seed}`
      })
    });

    if (!r.ok) {
      const txt = await r.text().catch(()=>"");
            res.setHeader("Cache-Control","no-store");
          }
        } catch (error) {
          res.setHeader("Cache-Control", "no-store");
          res.status(500).json({ items: [], error: String(error) });
        }
      }
