// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz, resetFinvizEffectiveFilter } from "../api/loadBatch";
import { fetchJSON, mapLimit } from "../utils/http";

// --------------------- Finnhub quote shape ---------------------
type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number; dp?: number; d?: number };

// --------------------- State ---------------------
export type StocksState = {
  items: Stock[];
  nextCache: Stock[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  currentPage: number;
  hasMore: boolean;
};

const initialState: StocksState = {
  items: [],
  nextCache: null,
  status: "idle",
  currentPage: -1,
  hasMore: true,
};

// --------------------- helpers ---------------------
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

function saneText(v?: string | null, ticker?: string | null) {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-" || t === "—") return null;
  if (ticker && t.toUpperCase() === ticker.toUpperCase()) return null;
  if (/^[0-9]+$/.test(t)) return null;
  return t;
}

function mapFinvizItemsToStocks(rows: any[]): Stock[] {
  return rows.map((row: any) => {
    const ticker: string = row.ticker;
    const s: Stock = {
      ticker,
      name: saneText(row.company, ticker) ?? ticker,
      category: "small",
      price: row.price ?? null,
      changePct: row.changePct ?? null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: row.marketCap ?? null,
      marketCapText: saneText(row.marketCapText, ticker),

      peSnapshot: row.peSnapshot ?? null,
      psSnapshot: row.psSnapshot ?? null,
      pbSnapshot: row.pbSnapshot ?? null,

      sector: saneText(row.sector, ticker),
      industry: saneText(row.industry, ticker),
      country: saneText(row.country, ticker),

      beta: row.beta ?? null,
      dividendYield: row.dividendYield ?? null,

      potentialScore: null,
      reasons: [],
    };
    return s;
  });
}

// --------------------- quotes throttling ---------------------
let globalBackoffUntil = 0;
const lastFetchBySymbol = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PER_SYMBOL_COOLDOWN_MS = Math.max(
  10_000,
  Number(((import.meta as any).env?.VITE_QUOTE_COOLDOWN_MS as any) || 60_000)
);
const GLOBAL_BACKOFF_MS = Math.max(
  15_000,
  Number(((import.meta as any).env?.VITE_QUOTE_BACKOFF_MS as any) || 60_000)
);
const RPS_DELAY_MS = Math.max(300, Number(((import.meta as any).env?.VITE_QUOTE_RPS_DELAY_MS as any) || 900));

let lastQuoteAt = 0;
let quotesChain: Promise<void> = Promise.resolve();

async function waitForRpsSlot() {
  const now = Date.now();
  const wait = Math.max(0, RPS_DELAY_MS - (now - lastQuoteAt));
  if (wait > 0) await sleep(wait);
  lastQuoteAt = Date.now();
}

// --------------------- API/thunks ---------------------
export const fetchQuotesForTickers = createAsyncThunk<
  void,
  { tickers: string[]; concurrency?: number }
>("stocks/fetchQuotesForTickers", async ({ tickers, concurrency = 2 }, { dispatch }) => {
  const conc = Math.max(1, Math.min(Math.floor(concurrency), 3));

  quotesChain = quotesChain.then(async () => {
    if (Date.now() < globalBackoffUntil) return;

    const now = Date.now();
    const unique = Array.from(new Set(tickers));
    const toQuery = unique.filter((sym) => {
      const last = lastFetchBySymbol.get(sym) ?? 0;
      return now - last >= PER_SYMBOL_COOLDOWN_MS;
    });
    if (toQuery.length === 0) return;

    await mapLimit(
      toQuery,
      conc,
      async (symbol) => {
        if (Date.now() < globalBackoffUntil) return;
        await waitForRpsSlot();
        try {
          const url = `/api/fh/quote?symbol=${encodeURIComponent(symbol)}`;
          const q = await fetchJSON<Quote>(url);
          lastFetchBySymbol.set(symbol, Date.now());

          // Intraday % change
          const computedDp =
            q.dp != null && Number.isFinite(q.dp)
              ? q.dp
              : (q.c != null && q.pc != null && q.pc !== 0)
                ? ((q.c - q.pc) / q.pc) * 100
                : null;

          dispatch(
            mergeStockPatch({
              ticker: symbol,
              price: q.c ?? null,
              ...(q.o != null ? { open: q.o } : {}),
              ...(q.h != null ? { high: q.h } : {}),
              ...(q.l != null ? { low: q.l } : {}),
              ...(q.pc != null ? { prevClose: q.pc } : {}),
              ...(computedDp != null ? { changePct: computedDp } : {}),
            })
          );
        } catch (e: any) {
          const msg = String(e?.message || e);
          if ((e?.status === 429) || msg.includes("429")) {
            globalBackoffUntil = Date.now() + GLOBAL_BACKOFF_MS;
          }
        }
      }
    );
  });

  await quotesChain;
});

export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

/**
 * Первая загрузка: берём страницу 0, показываем её, префетчим 1-ю,
 * подтягиваем котировки для 20 текущих тикеров.
 */
export const bootstrapFromFinviz = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  { quotesConcurrency?: number } | void
>("stocks/bootstrapFromFinviz", async (arg = {}, { dispatch }) => {
  const quotesConc =
    (arg as any)?.quotesConcurrency ?? Math.max(1, Number((import.meta as any).env?.VITE_FINNHUB_QUOTE_RPS || 2));

  resetFinvizEffectiveFilter();

  const { page: p0, stocks: s0, hasMoreMeta: more0 } = await dispatch(fetchFinvizPage({ page: 0 })).unwrap();

  const tickers0 = s0.map((s) => s.ticker);
  if (tickers0.length) {
    void dispatch(fetchQuotesForTickers({ tickers: tickers0, concurrency: quotesConc }));
  }

  let nextCache: Stock[] | null = null;
  if (more0) {
    try {
      const { stocks: s1 } = await dispatch(fetchFinvizPage({ page: 1 })).unwrap();
      nextCache = s1;
    } catch {
      nextCache = null;
    }
  }

  return { items: s0, nextCache, page: p0, hasMore: more0 || Boolean(nextCache?.length) };
});

/**
 * По клику «LOAD NEXT 20»
 */
export const loadNextAndReplace = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  void
>("stocks/loadNextAndReplace", async (_: void, { getState, dispatch }) => {
  const state = getState() as { stocks: StocksState };
  const curr = state.stocks.currentPage < 0 ? 0 : state.stocks.currentPage;
  const wantPage = curr + 1;

  let nextItems: Stock[] = state.stocks.nextCache ?? [];
  let effectivePage = wantPage;

  if (nextItems.length === 0) {
    const { page, stocks } = await dispatch(fetchFinvizPage({ page: wantPage })).unwrap();
    nextItems = stocks;
    effectivePage = page;
  }

  if (nextItems.length === 0) {
    return { items: state.stocks.items, nextCache: null, page: curr, hasMore: false };
  }

  let nextCache: Stock[] | null = null;
  let hasMore = true;
  try {
    const { stocks: sNext, hasMoreMeta } = await dispatch(fetchFinvizPage({ page: effectivePage + 1 })).unwrap();
    nextCache = sNext;
    hasMore = hasMoreMeta || (sNext.length > 0);
  } catch {
    hasMore = false;
    nextCache = null;
  }

  return { items: nextItems, nextCache, page: effectivePage, hasMore };
});

// --------------------- slice ---------------------
const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    resetPager(state) {
      state.items = [];
      state.nextCache = null;
      state.status = "idle";
      state.error = undefined;
      state.currentPage = -1;
      state.hasMore = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapFromFinviz.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(bootstrapFromFinviz.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.items;
        state.nextCache = action.payload.nextCache;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
      })
      .addCase(bootstrapFromFinviz.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(loadNextAndReplace.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(loadNextAndReplace.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.items;
        state.nextCache = action.payload.nextCache;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
      })
      .addCase(loadNextAndReplace.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action: PayloadAction<any>) => {
        const i = state.items.findIndex((s) => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...(state.items[i] as any), ...action.payload } as Stock;
      });
  },
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

// -------- selectors --------
import type { RootState } from "./index";
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;
