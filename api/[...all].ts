// /api/[...all].ts
export const runtime = "nodejs";

import { llmCommentary } from "./_handlers/llmCommentary";

function sendJSON(res: any, code: number, obj: any) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    // убрать /api/ с начала и слеш с конца
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
    const method = req.method || "GET";

    // CORS на всякий случай
    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      res.statusCode = 204;
      return res.end();
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    // ---- РОУТЫ ----
    if (method === "POST" && (path === "llm/commentary" || path === "llm/commentary/")) {
      return llmCommentary(req, res);
    }

    if (method === "GET" && path === "debug/env") {
      const yes = (v: any) => Boolean(v);
      return sendJSON(res, 200, {
        ok: true,
        OPENAI_API_KEY: yes(process.env.OPENAI_API_KEY),
        OPENAI_MODEL: process.env.OPENAI_MODEL || null,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || null,
        node: process.version,
        path,
        method,
      });
    }

    // Эхо-диагностика: поможет понять, попадаем ли вообще в функцию
    if (method === "GET" && path === "_whoami") {
      return sendJSON(res, 200, { ok: true, path, method, note: "catch-all alive" });
    }

    return sendJSON(res, 404, { error: "Not Found", path, method });
  } catch (e: any) {
    return sendJSON(res, 500, { error: String(e?.message || e) });
  }
}
