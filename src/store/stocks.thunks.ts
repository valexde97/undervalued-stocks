// src/store/stocks.thunks.ts
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { capToBandMillions, parseCapTextToMillions } from "../utils/marketCap";
import { fetchJSON, mapLimit } from "../utils/http";
import {
  setStocks, addStocks, setStatus, setError, setHasMore, mergeStockPatch,
} from "./stocks.slice";

// Если у тебя есть обёртка loadFinviz — можешь оставить и использовать её.
// Здесь для наглядности запросим напрямую.
async function loadFinviz(page: number): Promise<{ items: any[] }> {
  const res = await fetch(`/api/finviz?page=${page}`);
  if (!res.ok) throw new Error(`Finviz fetch failed: ${res.status}`);
  return res.json();
}

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

const lastFetchBySymbol = new Map<string, number>();
let globalBackoffUntil = 0;
const PER_SYMBOL_COOLDOWN_MS = 0;
const GLOBAL_BACKOFF_MS = 30_000;

function mapFinvizItemsToStocks(rows: any[]): Stock[] {
  return rows.map((row: any) => {
    const capM = parseCapTextToMillions(row.marketCapText ?? null);
    const category = capToBandMillions(capM) ?? "small";
    const s: Stock = {
      ticker: row.ticker,
      name: row.company ?? row.ticker,
      category,
      price: row.price ?? null,
      changePct: row.changePct ?? null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: capM,
      marketCapText: row.marketCapText ?? null,

      peSnapshot: row.peSnapshot ?? null,
      psSnapshot: row.psSnapshot ?? null,
      pbSnapshot: row.pbSnapshot ?? null,

      sector: row.sector ?? null,
      industry: row.industry ?? null,
      country: row.country ?? null,

      beta: row.beta ?? null,
      dividendYield: row.dividendYield ?? null,

      potentialScore: null,
      reasons: [],
    };
    return s;
  });
}

// ---- BOOTSTRAP: показать 20 и префетч 20 ----
export const bootstrapFromFinviz = createAsyncThunk<Stock[], { quotesConcurrency?: number } | void>(
  "stocks/bootstrapFromFinviz",
  async (arg = {}, { dispatch }) => {
    const conc = (arg as any)?.quotesConcurrency ?? Math.max(1, Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 2));

    dispatch(setStatus("loading"));
    dispatch(setError(undefined));

    const { items } = await loadFinviz(0); // страница 0 (+relax top-up)
    const base = mapFinvizItemsToStocks(items);

    // показать сразу первые 20
    dispatch(setStocks(base));
    dispatch(setStatus("succeeded"));
    dispatch(setHasMore(base.length === 20));

    // котировки для первых 20
    const tickers = base.slice(0, 20).map((s) => s.ticker);
    if (tickers.length) {
      await dispatch(fetchQuotesForTickers({ tickers, concurrency: conc })).unwrap().catch(() => void 0);
    }

    // префетч: загружаем в «стол» следующую 20-ку
    void dispatch(fetchFinvizPageWithPrefetch({ page: 1 }));

    return base;
  }
);

// ---- Загрузка конкретной страницы по 20 ----
export const fetchFinvizPage = createAsyncThunk<Stock[], { page: number }>(
  "stocks/fetchFinvizPage",
  async ({ page }) => {
    const { items } = await loadFinviz(page);
    return mapFinvizItemsToStocks(items);
  }
);

// ---- Загрузка страницы + тихий префетч следующей ----
export const fetchFinvizPageWithPrefetch = createAsyncThunk<{ payload: Stock[]; page: number }, { page: number }>(
  "stocks/fetchFinvizPageWithPrefetch",
  async ({ page }, { dispatch }) => {
    const payload = await dispatch(fetchFinvizPage({ page })).unwrap();
    // если ровно 20 — префетчим следующую
    if (payload.length === 20) {
      void dispatch(fetchFinvizPage({ page: page + 1 }));
    }
    return { payload, page };
  }
);

// ---- Котировки Finnhub ----
export const fetchQuotesForTickers = createAsyncThunk<void, { tickers: string[]; concurrency?: number }>(
  "stocks/fetchQuotesForTickers",
  async ({ tickers, concurrency = Math.max(1, Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 2)) }, { dispatch }) => {
    if (Date.now() < globalBackoffUntil) return;

    const unique = Array.from(new Set(tickers));
    const now = Date.now();
    const toQuery = unique.filter((sym) => {
      const last = lastFetchBySymbol.get(sym) ?? 0;
      return now - last >= PER_SYMBOL_COOLDOWN_MS;
    });
    if (toQuery.length === 0) return;

    await mapLimit(
      toQuery,
      Math.max(1, Math.min(concurrency, 3)),
      async (symbol) => {
        try {
          const url = `/api/fh/quote?symbol=${encodeURIComponent(symbol)}&ts=${Date.now()}`;
          const q = await fetchJSON<Quote>(url, { noStore: true } as any);
          lastFetchBySymbol.set(symbol, Date.now());

          dispatch(
            mergeStockPatch({
              ticker: symbol,
              price: q.c ?? null,
              ...(q.o != null ? { /* @ts-ignore */ open: q.o } : {}),
              ...(q.h != null ? { /* @ts-ignore */ high: q.h } : {}),
              ...(q.l != null ? { /* @ts-ignore */ low: q.l } : {}),
              ...(q.pc != null ? { /* @ts-ignore */ prevClose: q.pc } : {}),
            })
          );
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (e?.status === 429 || msg.includes("429")) {
            globalBackoffUntil = Date.now() + GLOBAL_BACKOFF_MS;
          }
        }
      }
    );
  }
);

// ---- Подключение к slice через builder (вызывается из configureStore.ts) ----
export const attachStocksExtraReducers = (builder: any) => {
  builder
    .addCase(bootstrapFromFinviz.rejected, (state: any, action: any) => {
      state.status = "failed";
      state.error = action.error?.message || "Unknown error";
    })
    .addCase(fetchFinvizPage.fulfilled, (state: any, action: any) => {
      const before = state.items.length;
      const payload: Stock[] = action.payload;
      // мержим
      const byTicker = new Map(state.items.map((s: Stock) => [s.ticker, s]));
      for (const s of payload) byTicker.set(s.ticker, { ...byTicker.get(s.ticker), ...s });
      state.items = Array.from(byTicker.values());
      const after = state.items.length;
      state.hasMore = payload.length === 20 && after > before;
    })
    .addCase(fetchFinvizPageWithPrefetch.fulfilled, (state: any, action: any) => {
      const payload: Stock[] = action.payload.payload;
      const before = state.items.length;
      const byTicker = new Map(state.items.map((s: Stock) => [s.ticker, s]));
      for (const s of payload) byTicker.set(s.ticker, { ...byTicker.get(s.ticker), ...s });
      state.items = Array.from(byTicker.values());
      const after = state.items.length;
      state.hasMore = payload.length === 20 && after > before;
    });
};
