import type { Stock } from "../types/stock";

/** Ответ от /api/finviz */
type FinvizRow = {
  ticker: string;
  company?: string | null;
  marketCapText?: string | null; // "49.06M" | "12.83B"
  peSnapshot?: number | null;
  psSnapshot?: number | null;
  sector?: string | null;
  industry?: string | null;
};
type FinvizResp = { page: number; count: number; items: FinvizRow[] };

const QUOTE_CONCURRENCY =
  Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS) || 3;

/** "49.06M" | "12.83B" -> число в МЛН $ */
function parseCapTextToMillions(txt?: string | null): number | null {
  if (!txt) return null;
  const s = String(txt).trim().replace(/[, ]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)([MBT])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toUpperCase();
  if (u === "B") return Math.round(n * 1000 * 100) / 100;      // млрд → млн
  if (u === "T") return Math.round(n * 1_000_000 * 100) / 100; // трлн → млн
  return Math.round(n * 100) / 100;                            // млн
}

type Band = "small" | "mid" | "large";
function capToBandMillions(mcM?: number | null): Band {
  const mcB = mcM != null ? mcM / 1000 : 0;
  if (mcB >= 10) return "large";
  if (mcB >= 2) return "mid";
  return "small";
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  return r.json() as Promise<T>;
}

/** ограничение параллелизма */
async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  const workers = Array(Math.min(limit, Math.max(1, arr.length)))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= arr.length) break;
        out[idx] = await fn(arr[idx], idx);
      }
    });
  await Promise.all(workers);
  return out;
}

/* ====== scoring (экспортируется) ====== */
export function computeScore(s: Partial<Stock> & { price?: number | null }) {
  const price = s.price ?? 0;
  const pe = (s as any).pe ?? null;
  const ps = (s as any).ps ?? null;
  const currentRatio = (s as any).currentRatio ?? null;
  const debtToEquity = (s as any).debtToEquity ?? null;
  const grossMargin = (s as any).grossMargin ?? null;
  const netMargin = (s as any).netMargin ?? null;

  let valuePts = 0;
  if (pe != null && pe > 0 && pe <= 15) valuePts++;
  if (ps != null && ps > 0 && ps <= 1) valuePts++;

  let healthPts = 0;
  if (currentRatio != null && currentRatio >= 1) healthPts++;
  if (debtToEquity != null && debtToEquity < 2) healthPts++;
  if (grossMargin != null && grossMargin > 0) healthPts++;
  if (netMargin != null && netMargin > 0) healthPts++;

  const valueScore = valuePts / 2;
  const healthScore = healthPts / 4;
  const cheapBonus = price > 0 ? Math.max(0, (20 - price) / 20) * 0.1 : 0;

  return Math.min(1, 0.6 * valueScore + 0.4 * healthScore + cheapBonus);
}

/* ================= main ================= */

export async function loadFinviz(page = 0, f?: string): Promise<FinvizResp> {
  const url = new URL("/api/finviz", window.location.origin);
  url.searchParams.set("page", String(page));
  if (f) url.searchParams.set("f", f);
  return fetchJSON<FinvizResp>(url.toString());
}

/** Полный батч: finviz → котировки (c, o, h, l, pc) → мёрдж + скоринг */
export async function loadBatch(
  page = 0,
  opts?: { quotesFirstN?: number }
): Promise<Stock[]> {
  const { items } = await loadFinviz(page);

  // базовые карточки из finviz
  const base: Stock[] = items.map((row) => {
    const mcM = parseCapTextToMillions(row.marketCapText);
    const category = capToBandMillions(mcM);
    return {
      ticker: row.ticker,
      name: row.company ?? row.ticker,
      category,
      price: null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: mcM,
      marketCapText: row.marketCapText ?? null,
      peSnapshot: row.peSnapshot ?? null,
      psSnapshot: row.psSnapshot ?? null,
      sector: row.sector ?? null,
      industry: row.industry ?? null,

      potentialScore: null,
      reasons: [],
    } as unknown as Stock;
  });

  // быстрые котировки для первых N (или всех)
  const firstN = opts?.quotesFirstN ?? base.length;
  const tickers = base.slice(0, firstN).map((s) => s.ticker);

  type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

  const quotes = await mapLimit(tickers, QUOTE_CONCURRENCY, async (symbol) => {
    const q = await fetchJSON<Quote>(
      `/api/fh/quote?symbol=${encodeURIComponent(symbol)}`
    );
    return {
      ticker: symbol,
      price: q?.c ?? null,
      open: q?.o ?? null,
      high: q?.h ?? null,
      low: q?.l ?? null,
      prevClose: q?.pc ?? null,
    };
  });

  const qMap = new Map(quotes.map((q) => [q.ticker, q]));

  // мёрдж и расчёт скоринга
  const merged = base.map<Stock>((b) => {
    const q = qMap.get(b.ticker);
    const price = q?.price ?? null;
    const pe = b.pe ?? b.peSnapshot ?? null;
    const ps = b.ps ?? b.psSnapshot ?? null;

    const out: Stock = { ...b, price, pe, ps } as Stock;

    // прокинем OHLC для карточки
    (out as any).open = q?.open ?? null;
    (out as any).high = q?.high ?? null;
    (out as any).low = q?.low ?? null;
    (out as any).prevClose = q?.prevClose ?? null;

    out.potentialScore = computeScore(out);

    const reasons: string[] = [];
    if (pe != null && pe > 0 && pe <= 15) reasons.push("P/E ≤ 15");
    if (ps != null && ps > 0 && ps <= 1) reasons.push("P/S ≤ 1");
    if ((out as any).debtToEquity != null && (out as any).debtToEquity < 2) {
      reasons.push("D/E < 2");
    }
    out.reasons = reasons;

    return out;
  });

  return merged;
}

export default loadBatch;
