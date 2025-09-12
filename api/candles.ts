// /api/candles.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Provider = "finnhub" | "alphavantage" | "yahoo" | "stooq";
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number | null; provider: Provider };

function parseDateOrEpochSec(v: unknown, fallback: number): number {
  if (v == null || v === "") return fallback;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {
    const sec = parseInt(s, 10);
    if (Number.isFinite(sec)) return sec;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : Math.floor(d.getTime() / 1000);
}
function epochSec(d: Date): number { return Math.floor(d.getTime() / 1000); }
function toISODate(sec: number): string { return new Date(sec * 1000).toISOString().slice(0, 10); }
function withinRange(sec: number, from: number, to: number): boolean { return sec >= from && sec <= to; }
function okNum(n: unknown): n is number { return typeof n === "number" && Number.isFinite(n); }

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const r = await fetch(url, init);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${txt.slice(0, 200)}`);
  return txt;
}
async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${body.slice(0, 200)}`);
  try { return JSON.parse(body) as T; } catch { throw new Error(`Invalid JSON from ${url} — ${body.slice(0, 200)}`); }
}
function sendJSON(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").end(JSON.stringify(body));
}

// ---------- providers ----------
async function getFinnhub(params: { symbol: string; from: number; to: number; resolution: string; adjusted: boolean }): Promise<Candle[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY not set");
  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(params.symbol)}` +
    `&resolution=${encodeURIComponent(params.resolution)}` +
    `&from=${params.from}&to=${params.to}&adjusted=${params.adjusted ? "true" : "false"}&token=${key}`;
  const data: any = await fetchJSON(url, { cache: "no-store" });
  if (!data || data.s !== "ok" || !Array.isArray(data.t)) {
    const s = (data && data.s) || "unknown";
    const msg = (data && (data.error || data.message)) || "";
    throw new Error(`Finnhub error: ${s}${msg ? ` — ${msg}` : ""}`);
  }
  const out: Candle[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const t = data.t[i], o = data.o?.[i], h = data.h?.[i], l = data.l?.[i], c = data.c?.[i], v = data.v?.[i];
    if ([t, o, h, l, c].every(okNum)) out.push({ t, o, h, l, c, v: okNum(v) ? v : null, provider: "finnhub" });
  }
  return out;
}

async function getAlphaVantage(params: { symbol: string; from: number; to: number }): Promise<Candle[]> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) throw new Error("ALPHAVANTAGE_API_KEY not set");
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(params.symbol)}&outputsize=full&apikey=${key}`;
  const data: any = await fetchJSON(url, { cache: "no-store" });
  const ts = data?.["Time Series (Daily)"];
  if (!ts || typeof ts !== "object") {
    const note = data?.Note || data?.Information || JSON.stringify(data).slice(0, 200);
    throw new Error(`AlphaVantage error: ${note}`);
  }
  const out: Candle[] = [];
  for (const iso in ts as Record<string, any>) {
    const d = ts[iso];
    const t = Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000);
    if (!withinRange(t, params.from, params.to)) continue;
    const o = parseFloat(d["1. open"]), h = parseFloat(d["2. high"]), l = parseFloat(d["3. low"]);
    const c = parseFloat(d["5. adjusted close"] ?? d["4. close"]);
    const vRaw = d["6. volume"]; const v = vRaw != null ? Number.parseFloat(String(vRaw)) : null;
    if ([t, o, h, l, c].every(Number.isFinite)) out.push({ t, o, h, l, c, v: Number.isFinite(v as number) ? (v as number) : null, provider: "alphavantage" });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function getYahoo(params: { symbol: string; from: number; to: number }): Promise<Candle[]> {
  const period1 = params.from;
  const period2 = params.to + 86400; // include end date
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(params.symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
  const csv = await fetchText(url, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length || !/^Date,Open,High,Low,Close,Adj Close,Volume/i.test(lines[0])) throw new Error("Yahoo: unexpected CSV header");
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [iso, o, h, l, close, adj, vol] = lines[i].split(",");
    const t = Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000);
    if (!withinRange(t, params.from, params.to)) continue;
    const oo = parseFloat(o), hh = parseFloat(h), ll = parseFloat(l);
    const cc = parseFloat(adj || close);
    const vv = vol != null ? Number.parseFloat(String(vol)) : null;
    if ([t, oo, hh, ll, cc].every(Number.isFinite)) out.push({ t, o: oo, h: hh, l: ll, c: cc, v: Number.isFinite(vv as number) ? (vv as number) : null, provider: "yahoo" });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function stooqSymbol(symbol: string): string { return /\.[a-z]{2,4}$/i.test(symbol) ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`; }
async function getStooq(params: { symbol: string; from: number; to: number }): Promise<Candle[]> {
  const sym = stooqSymbol(params.symbol);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const csv = await fetchText(url, { cache: "no-store", headers: { "user-agent": "undervalued-stocks/1.0" } });
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length || !/^Date,Open,High,Low,Close,Volume/i.test(lines[0])) throw new Error("Stooq: unexpected CSV header");
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [iso, o, h, l, c, vol] = lines[i].split(",");
    const t = Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000);
    if (!withinRange(t, params.from, params.to)) continue;
    const oo = parseFloat(o), hh = parseFloat(h), ll = parseFloat(l), cc = parseFloat(c);
    const vv = vol != null ? Number.parseFloat(String(vol)) : null;
    if ([t, oo, hh, ll, cc].every(Number.isFinite)) out.push({ t, o: oo, h: hh, l: ll, c: cc, v: Number.isFinite(vv as number) ? (vv as number) : null, provider: "stooq" });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function mergeBasePlusFill(base: Candle[], fill: Candle[]): Candle[] {
  if (!base.length) return fill.slice();
  if (!fill.length) return base.slice();
  const m = new Map<number, Candle>();
  base.forEach((x) => m.set(x.t, x));
  fill.forEach((r) => { if (!m.has(r.t)) m.set(r.t, r); });
  return Array.from(m.values()).sort((a, b) => a.t - b.t);
}
function buildStats(a: Candle[], b: Candle[]) {
  const setA = new Set<number>(); a.forEach((x) => setA.add(x.t));
  const setB = new Set<number>(); b.forEach((x) => setB.add(x.t));
  let overlap = 0; setA.forEach((t) => { if (setB.has(t)) overlap++; });
  return { daysA: a.length, daysB: b.length, overlap };
}
function buildConsensus(a: Candle[], b: Candle[]) {
  if (!a.length || !b.length) return [] as { t: number; c: number }[];
  const mapA = new Map<number, Candle>(); a.forEach((x) => mapA.set(x.t, x));
  const mapB = new Map<number, Candle>(); b.forEach((x) => mapB.set(x.t, x));
  const out: { t: number; c: number }[] = [];
  mapA.forEach((pa, t) => { const pb = mapB.get(t); if (pb) out.push({ t, c: (pa.c + pb.c) / 2 }); });
  out.sort((x, y) => x.t - y.t);
  return out;
}

// --- handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const proto = (req.headers["x-forwarded-proto"] as string) || "http";
    const host = (req.headers.host as string) || "localhost";
    const url = new URL(req.url || "/", `${proto}://${host}`);

    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return sendJSON(res, 400, { error: "symbol is required" });

    const now = new Date();
    const nowSec = epochSec(now);
    const fromDefault = epochSec(new Date(now.getFullYear() - 20, now.getMonth(), now.getDate()));

    const from = parseDateOrEpochSec(url.searchParams.get("from"), fromDefault);
    const to = parseDateOrEpochSec(url.searchParams.get("to"), nowSec);
    const reso = (url.searchParams.get("res") || "D").toUpperCase();
    const adjusted = (url.searchParams.get("adjusted") || "true").toLowerCase() !== "false";
    const provider = (url.searchParams.get("provider") || "both").toLowerCase();

    const errors: string[] = [];
    let fin: Candle[] = [], av: Candle[] = [], yh: Candle[] = [], st: Candle[] = [];

    if (provider === "finnhub" || provider === "both") {
      try { fin = await getFinnhub({ symbol, from, to, resolution: reso, adjusted }); } catch (e: any) { errors.push(String(e?.message || e)); }
    }
    if ((provider === "alphavantage") || (provider === "both" && fin.length === 0)) {
      try { av = await getAlphaVantage({ symbol, from, to }); } catch (e: any) { errors.push(String(e?.message || e)); }
    }
    if (fin.length === 0 && av.length === 0) {
      try { yh = await getYahoo({ symbol, from, to }); } catch (e: any) { errors.push(String(e?.message || e)); }
    }
    if (fin.length === 0 && av.length === 0 && yh.length === 0) {
      try { st = await getStooq({ symbol, from, to }); } catch (e: any) { errors.push(String(e?.message || e)); }
    }

    let items: Candle[] = [];
    if (fin.length) items = mergeBasePlusFill(fin, av.length ? av : []);
    else if (av.length) items = av;
    else if (yh.length) items = yh;
    else if (st.length) items = st;

    const stats = buildStats(fin, av);
    const consensus = buildConsensus(fin, av);

    const rangeDays = Math.max(1, Math.floor((to - from) / 86400));
    const maxAge = rangeDays > 365 ? 86400 : 3600;
    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);

    return sendJSON(res, 200, {
      symbol, resolution: reso, from, to, items, consensus, stats,
      providerHint: {
        finnhubT: fin.length, alphavantageT: av.length, yahooT: yh.length, stooqT: st.length,
        error: errors.length ? errors.join(" | ") : null
      },
      meta: { fromISO: toISODate(from), toISO: toISODate(to), adjusted }
    });
  } catch (err: any) {
    // принципиально не даём 502, чтобы фронт не краснел
    return sendJSON(res, 200, { items: [], error: String(err?.message || err), providerHint: { fatal: true } });
  }
}
