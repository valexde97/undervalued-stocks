// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz, resetFinvizEffectiveFilter } from "../api/loadBatch";
import { fetchJSON } from "../utils/http";

// ---------- Finnhub quote shape ----------
type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number; dp?: number; d?: number };

// ---------- State ----------
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

// ---------- helpers ----------
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
      category: "small", // будет уточняться позже по метрикам, пока фикс
      // Finviz больше не даёт снапшоты цены — загрузим из Finnhub
      price: null,
      changePct: null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: null,
      marketCapText: null,

      peSnapshot: null,
      psSnapshot: null,
      pbSnapshot: null,

      sector: saneText(row.sector, ticker),
      industry: saneText(row.industry, ticker),
      country: saneText(row.country, ticker),

      beta: null,
      dividendYield: null,

      potentialScore: null,
      reasons: [],
    };
    return s;
  });
}

// ---------- Batch quotes (NEW) ----------
export const fetchQuotesBatch = createAsyncThunk<
  void,
  { tickers: string[] }
>("stocks/fetchQuotesBatch", async ({ tickers }, { dispatch }) => {
  const unique = Array.from(new Set(tickers)).filter(Boolean);
  if (unique.length === 0) return;

  const qs = encodeURIComponent(unique.join(","));
  const data = await fetchJSON<{ quotes: Record<string, Quote | null> }>(`/api/fh/quotes-batch?symbols=${qs}`);
  const quotes = data?.quotes ?? {};

  for (const [symbol, q] of Object.entries(quotes)) {
    if (!symbol) continue;
    const computedDp =
      q?.dp != null && Number.isFinite(q.dp)
        ? q.dp
        : q?.c != null && q?.pc != null && q.pc !== 0
          ? ((q.c - q.pc) / q.pc) * 100
          : null;

    dispatch(
      mergeStockPatch({
        ticker: symbol,
        price: q?.c ?? null,
        ...(q?.o != null ? { open: q.o } : {}),
        ...(q?.h != null ? { high: q.h } : {}),
        ...(q?.l != null ? { low: q.l } : {}),
        ...(q?.pc != null ? { prevClose: q.pc } : {}),
        ...(computedDp != null ? { changePct: computedDp } : {}),
      })
    );
  }
});

// ---------- Finviz page fetch ----------
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
 * и тянем котировки для первых 20 тикеров одним batch-запросом.
 */
export const bootstrapFromFinviz = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  void
>("stocks/bootstrapFromFinviz", async (_arg, { dispatch }) => {
  resetFinvizEffectiveFilter();

  const { page: p0, stocks: s0, hasMoreMeta: more0 } = await dispatch(fetchFinvizPage({ page: 0 })).unwrap();

  const tickers0 = s0.map((s) => s.ticker);
 if (tickers0.length) {
  void dispatch(fetchQuotesBatch({ tickers: tickers0 }));
  void dispatch(fetchMetricsBatch({ tickers: tickers0 })); // NEW
}


  let nextCache: Stock[] | null = null;
  if (more0) {
    try {
      const { stocks: s1 } = await dispatch(fetchFinvizPage({ page: 1 })).unwrap();
      nextCache = s1;
      // префетч котировок следующей двадцатки — в фоне
      const tickers1 = s1.map((s) => s.ticker);
      if (tickers1.length) void dispatch(fetchQuotesBatch({ tickers: tickers1 }));
    if (tickers1.length) void dispatch(fetchMetricsBatch({ tickers: tickers1 })); // NEW
    } catch {
      nextCache = null;
    }
  }

  return { items: s0, nextCache, page: p0, hasMore: more0 || Boolean(nextCache?.length) };
});

/**
 * По клику «LOAD NEXT 20»: заменяем текущую 20-ку на следующую и
 * префетчим ещё одну страницу вперёд.
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

  // Загружаем котировки для новой двадцатки
  const tickers = nextItems.map((s) => s.ticker);
  if (tickers.length) void dispatch(fetchQuotesBatch({ tickers }));
if (tickers.length) void dispatch(fetchMetricsBatch({ tickers })); // NEW

  // Префетчим следующую страницу (и её котировки — в фоне)
  let nextCache: Stock[] | null = null;
  let hasMore = true;
  try {
    const { stocks: sNext, hasMoreMeta } = await dispatch(fetchFinvizPage({ page: effectivePage + 1 })).unwrap();
    nextCache = sNext;
    hasMore = hasMoreMeta || (sNext.length > 0);
    const tickersNext = sNext.map((s) => s.ticker);
   
    if (tickersNext.length) void dispatch(fetchQuotesBatch({ tickers: tickersNext }));
   if (tickersNext.length) void dispatch(fetchMetricsBatch({ tickers: tickersNext }));
  } catch {
    hasMore = false;
    nextCache = null;
  }

  return { items: nextItems, nextCache, page: effectivePage, hasMore };
});

// ---------- slice ----------
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

type Metrics = { marketCap?: number | null; pe?: number | null; ps?: number | null; pb?: number | null };

export const fetchMetricsBatch = createAsyncThunk<
  void,
  { tickers: string[] }
>("stocks/fetchMetricsBatch", async ({ tickers }, { dispatch }) => {
  const unique = Array.from(new Set(tickers)).filter(Boolean);
  if (unique.length === 0) return;

  const qs = encodeURIComponent(unique.join(","));
  const data = await fetchJSON<{ metrics: Record<string, Metrics> }>(`/api/fh/metrics-batch?symbols=${qs}`);
  const map = data?.metrics ?? {};

  for (const [symbol, m] of Object.entries(map)) {
const rawCap = m?.marketCap ?? null;
const marketCap = typeof rawCap === "number" ? rawCap * 1000 : null; // B -> M

    // категория по капе (примерная шкала)
    let category: Stock["category"] | undefined = undefined;
    if (typeof marketCap === "number") {
      if (marketCap >= 10000) category = "large";
      else if (marketCap >= 2000) category = "mid";
      else category = "small";
    }

    dispatch(
      mergeStockPatch({
        ticker: symbol,
        marketCap: marketCap, // Finnhub в миллиардах USD → если у тебя ожидание в M, умножь на 1000
        pe: m?.pe ?? null,
        ps: m?.ps ?? null,
        pb: m?.pb ?? null,
        ...(category ? { category } : {}),
      })
    );
  }
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

// -------- selectors --------
import type { RootState } from "./index";
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;
