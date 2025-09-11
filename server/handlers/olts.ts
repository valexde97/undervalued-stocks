// /api/olts.ts
export const runtime = "nodejs";

// ---------- утилиты (без геттеров — совместимо со старым target) ----------
function sendJSON(res: any, code: number, obj: any) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

class MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  constructor(
    url: string,
    method: string = "GET",
    headers: Record<string, string> = {}
  ) {
    this.url = url;
    this.method = method;
    this.headers = headers;
  }
}

class MockResponse {
  statusCode = 200;
  private _headers: Record<string, string> = {};
  private _ended = false;
  private _body: string | Buffer = "";

  setHeader(name: string, value: any) {
    this._headers[String(name)] = String(value);
  }
  getHeaders() {
    return Object.assign({}, this._headers);
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(obj: any) {
    this.setHeader("Content-Type", "application/json");
    this._body = JSON.stringify(obj);
    this._ended = true;
  }
  end(chunk?: any) {
    if (typeof chunk !== "undefined") {
      this._body =
        typeof chunk === "string"
          ? chunk
          : Buffer.isBuffer(chunk)
          ? chunk
          : String(chunk);
    }
    this._ended = true;
  }
  async result() {
    const bodyStr = Buffer.isBuffer(this._body)
      ? this._body.toString("utf-8")
      : String(this._body || "");
    let data: any = null;
    const ct =
      this._headers["Content-Type"] || this._headers["content-type"] || "";
    if (/json/i.test(ct) && bodyStr) {
      try {
        data = JSON.parse(bodyStr);
      } catch {
        data = bodyStr;
      }
    } else {
      data = bodyStr;
    }
    return { status: this.statusCode, headers: this.getHeaders(), data };
  }
}

function qs(params?: Record<string, any>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const k in params) {
    const v = params[k];
    if (typeof v === "undefined" || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}

async function callHandler(
  handler: (req: any, res: any) => Promise<any> | any,
  path: string,
  params?: Record<string, any>
) {
  const url = path + qs(params);
  const req = new MockRequest(url, "GET", { host: "localhost" });
  const res = new MockResponse();
  await handler(req as any, res as any);
  return await res.result();
}

async function thLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  const q = items.slice();
  const n = Math.max(1, Math.min(limit, q.length || 1));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    workers.push(
      (async () => {
        while (q.length) {
          const it = q.shift() as T;
          await worker(it);
        }
      })()
    );
  }
  await Promise.all(workers);
}

// ---------- импорт существующих хендлеров (можем расширять позже) ----------
import finvizHandler from "./finviz";
// при необходимости добавим и остальные: quotes-batch, metrics-batch, profile2 и т.д.

// ---------- реестр операций ----------
const OPS: Record<
  string,
  {
    handler: (req: any, res: any) => any;
    path: string;
    allow?: string[];
    fixed?: Record<string, any>;
  }
> = {
  "finviz.default": {
    handler: finvizHandler as any,
    path: "/api/finviz",
    allow: ["page", "f", "order", "min"],
  },
};

// ---------- сам обработчик /api/olts ----------
export default async function handler(req: any, res: any) {
  try {
    const method = req.method || "GET";

    // CORS
    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization"
      );
      res.statusCode = 204;
      return res.end();
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    if (method === "GET") {
      return sendJSON(res, 200, {
        ok: true,
        note: "POST tasks to this endpoint",
        supportedOps: Object.keys(OPS),
      });
    }
    if (method !== "POST") {
      return sendJSON(res, 405, { ok: false, error: "Method Not Allowed" });
    }

    // читаем тело
    let buf = "";
    await new Promise<void>((r) => {
      req.on("data", (c: any) => {
        buf += c;
      });
      req.on("end", () => r());
    });
    const payload = buf ? JSON.parse(buf) : {};
    const tasks: Record<string, { op: string; params?: Record<string, any> }> =
      payload.tasks || {};
    const concurrency = Math.max(
      1,
      Math.min(16, parseInt(String(payload.concurrency || "6"), 10) || 6)
    );

    const entries = Object.entries(tasks);
    const results: Record<string, any> = {};

    await runWithLimit(entries, concurrency, async ([key, spec]) => {
      const def = OPS[spec.op];
      if (!def) {
        results[key] = { ok: false, error: "Unknown op: " + spec.op };
        return;
      }

      const params: Record<string, any> = {};
      if (def.fixed) {
        for (const k in def.fixed) params[k] = def.fixed[k];
      }
      const allow = new Set(def.allow || []);
      for (const k in spec.params || {}) {
        if (allow.size === 0 || allow.has(k))
          params[k] = (spec.params as any)[k];
      }
if (spec.op === "sec.company-facts") {
  if (params.symbol && !params.ticker) params.ticker = params.symbol;
}


      try {
        const r = await callHandler(def.handler, def.path, params);
        results[key] = {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          headers: r.headers,
          data: r.data,
        };
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
function runWithLimit(entries: [string, { op: string; params?: Record<string, any>; }][], concurrency: number, arg2: ([key, spec]: [any, any]) => Promise<void>) {
  throw new Error("Function not implemented.");
}

