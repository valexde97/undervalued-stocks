// Unified multi-op endpoint. Keep client API: POST /api/olts with { tasks: {key:{op,params}}, concurrency? }
export const runtime = "nodejs";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function sendJSON(res: any, code: number, obj: any) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

class MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  // добавляем, чтобы серверные хендлеры могли читать так же, как из VercelRequest
  query: Record<string, any> = {};

  constructor(url: string, method: string = "GET", headers: Record<string, string> = {}) {
    this.url = url;
    this.method = method;
    this.headers = headers;
    try {
      const u = new URL(url, "http://local");
      this.query = Object.fromEntries(u.searchParams.entries());
    } catch {
      this.query = {};
    }
  }
}


class MockResponse {
  statusCode = 200;
  private _headers: Record<string, string> = {};
  private _ended = false;
  private _body: string | Buffer = "";

  setHeader(name: string, value: any) { this._headers[String(name)] = String(value); }
  getHeaders() { return Object.assign({}, this._headers); }
  status(code: number) { this.statusCode = code; return this; }
  json(obj: any) { this.setHeader("Content-Type", "application/json"); this._body = JSON.stringify(obj); this._ended = true; }
  end(chunk?: any) { if (typeof chunk !== "undefined") { this._body = typeof chunk === "string" ? chunk : (Buffer.isBuffer(chunk) ? chunk : String(chunk)); } this._ended = true; }
  async result() {
    const bodyStr = Buffer.isBuffer(this._body) ? this._body.toString("utf-8") : String(this._body || "");
    let data: any = null;
    const ct = this._headers["Content-Type"] || this._headers["content-type"] || "";
    if (/json/i.test(ct) && bodyStr) { try { data = JSON.parse(bodyStr); } catch { data = bodyStr; } } else { data = bodyStr; }
    return { status: this.statusCode, headers: this.getHeaders(), data };
  }
}

function qs(params?: Record<string, any>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const k in params) {
    const v = (params as any)[k];
    if (typeof v === "undefined" || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? ("?" + s) : "";
}

async function callHandler(handler: (req: any, res: any) => Promise<any> | any, path: string, params?: Record<string, any>) {
  const url = path + qs(params);
  const req = new MockRequest(url, "GET", { host: "localhost" });
  const res = new MockResponse();
  await handler(req as any, res as any);
  return await res.result();
}

async function runWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const q = items.slice();
  const n = Math.max(1, Math.min(limit, q.length || 1));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    workers.push((async () => { while (q.length) { const it = q.shift() as T; await worker(it); } })());
  }
  await Promise.all(workers);
}

// Import server handlers (not Serverless routes)
import finviz from "../server/handlers/finviz";
import fh_quotesBatch from "../server/handlers/fh/quotes-batch";
import fh_quote from "../server/handlers/fh/quote";
import fh_metrics from "../server/handlers/fh/metrics";
import fh_metricsBatch from "../server/handlers/fh/metrics-batch";
import fh_profile2 from "../server/handlers/fh/profile2";
import fh_news from "../server/handlers/fh/news";
import fh_marketStatus from "../server/handlers/fh/marketStatus";
import fh_snapshotBatch from "../server/handlers/fh/snapshot-batch";
import sec_companyFacts from "../server/handlers/sec/company-facts";
import llm_commentary from "../server/handlers/llm/commentary";
import llm_diag from "../server/handlers/llm/_diag";
import alpha_overview from "../server/handlers/alpha/overwiev";
import av_overview from "../server/handlers/av/overview";

type OpDef = { handler: (req:any,res:any)=>any, path: string, allow?: string[], fixed?: Record<string,any> };
const OPS: Record<string, OpDef> = {
  "finviz.default": { handler: finviz as any, path: "/api/finviz", allow: ["page","f","order","min","mode","limit","o"] },

  "fh.quote": { handler: fh_quote as any, path: "/api/fh?op=quote", allow: ["symbol"] },
  "fh.quotes-batch": { handler: fh_quotesBatch as any, path: "/api/fh?op=quotes-batch", allow: ["symbols"] },
  "fh.metrics": { handler: fh_metrics as any, path: "/api/fh?op=metrics", allow: ["symbol"] },
  "fh.metrics-batch": { handler: fh_metricsBatch as any, path: "/api/fh?op=metrics-batch", allow: ["symbols"] },
  "fh.profile2": { handler: fh_profile2 as any, path: "/api/fh?op=profile2", allow: ["symbol"] },
  // ВАЖНО: разрешаем category для новостей
  "fh.news": { handler: fh_news as any, path: "/api/fh?op=news", allow: ["symbol","from","to","category"] },
  "fh.marketStatus": { handler: fh_marketStatus as any, path: "/api/fh?op=marketStatus" },
  "fh.snapshot-batch": { handler: fh_snapshotBatch as any, path: "/api/fh?op=snapshot-batch", allow: ["symbols"] },

  "sec.company-facts": { handler: sec_companyFacts as any, path: "/api/sec?op=company-facts", allow: ["ticker","symbol"] },

  "llm.commentary": { handler: llm_commentary as any, path: "/api/llm?op=commentary" },
  "llm.diag": { handler: llm_diag as any, path: "/api/llm?op=diag" },

  "alpha.overview": { handler: alpha_overview as any, path: "/api/alpha?op=alpha-overview", allow: ["symbol"] },
  "av.overview": { handler: av_overview as any, path: "/api/alpha?op=av-overview", allow: ["symbol"] },
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const method = req.method || "GET";

    // CORS
    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      res.statusCode = 204; res.end(); return;
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    if (method === "GET") {
      return sendJSON(res, 200, { ok: true, note: "POST tasks to this endpoint", supportedOps: Object.keys(OPS) });
    }
    if (method !== "POST") return sendJSON(res, 405, { ok: false, error: "Method Not Allowed" });

    // read body
    let buf = "";
    await new Promise<void>((r) => { req.on("data", (c: any) => { buf += c; }); req.on("end", () => r()); });
    const payload = buf ? JSON.parse(buf) : {};
    const tasks: Record<string, { op: string; params?: Record<string, any> }> = payload.tasks || {};
    const concurrency = Math.max(1, Math.min(16, parseInt(String(payload.concurrency || "6"), 10) || 6));

    const entries = Object.entries(tasks);
    const results: Record<string, any> = {};

    await runWithLimit(entries, concurrency, async ([key, spec]) => {
      const def = OPS[spec.op];
      if (!def) { results[key] = { ok: false, error: "Unknown op: " + spec.op }; return; }

      const params: Record<string, any> = {};
      if (def.fixed) { for (const k in def.fixed) params[k] = def.fixed[k]; }
      const allow = new Set(def.allow || []);
      for (const k in (spec.params || {})) {
        if (allow.size === 0 || allow.has(k)) params[k] = (spec.params as any)[k];
      }

      try {
        const r = await callHandler(def.handler, def.path, params);
        results[key] = { ok: (r.status >= 200 && r.status < 300), status: r.status, headers: r.headers, data: r.data };
      } catch (e: any) {
        const msg = e && e.message ? e.message : String(e);
        results[key] = { ok: false, error: msg };
      }
    });

    return sendJSON(res, 200, { ok: true, serverTs: Date.now(), results });
  } catch (e: any) {
    const msg = e && e.message ? e.message : String(e);
    return sendJSON(res, 500, { ok: false, error: msg });
  }
}
