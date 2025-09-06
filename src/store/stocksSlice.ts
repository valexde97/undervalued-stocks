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

/** Значение уже в МИЛЛИОНАХ USD — возвращаем как есть (для profile2.marketCapitalization) */
function capMillions(v?: number | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  // safety clamp against garbage
  if (v > 5_000_000) return 5_000_000; // 5 трлн — верх
  return v;
}

/** Легаси путь: из МИЛЛИАРДОВ -> в МИЛЛИОНЫ (на случай старого server JSON) */
function billionsToMillions(v?: number | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  let m = v * 1000;
  while (m > 5_000_000) m /= 1000;
  return m;
}

function saneText(v?: string | null, ticker?: string | null) {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-" || t === "—") return null;
  if (ticker && t.toUpperCase() === ticker.toUpperCase()) return null;
  if (/^[0-9]+$/.test(t)) return null;
  return t;
}

function looksLikeNoise(s?: string | null) {
  const x = (s || "").trim().toLowerCase();
  if (!x) return false;
  return [
    "export",
    "overview",
    "valuation",
    "financial",
    "ownership",
    "performance",
    "technical",
    "order by",
    "any",
    "index",
    "signal",
    "dividend yield",
    "average volume",
    "target price",
    "ipo date",
    "filters:",
  ].some((w) => x.includes(w));
}

function cleanField(v?: string | null, ticker?: string | null) {
  if (looksLikeNoise(v)) return null;
  return saneText(v, ticker);
}

function mapFinvizItemsToStocks(rows: any[]): Stock[] {
  const out: Stock[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row?.ticker) continue;
    if (seen.has(row.ticker)) continue;

    const ticker: string = row.ticker;
    const name = cleanField(row.company, ticker) ?? ticker;

    out.push({
      ticker,
      name,
      category: "small",
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

      // будем заполнять из Finnhub profile (lite)
      sector: null,    // у Finnhub сектора нет
      industry: null,  // finnhubIndustry -> сюда
      country: null,

      beta: null,
      dividendYield: null,

      peSnapshot: null,
      psSnapshot: null,
      pbSnapshot: null,

      listedAt: undefined,
      potentialScore: null,
      reasons: [],
    });

    seen.add(ticker);
  }

  return out;
}

// ---------- Quotes (быстрые котировки) ----------
export const fetchQuotesBatch = createAsyncThunk<void, { tickers: string[] }>(
  "stocks/fetchQuotesBatch",
  async ({ tickers }, { dispatch }) => {
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
  }
);

// ---------- Metrics: LITE (profile2) ----------
type LiteMetrics = {
  marketCapM?: number | null;
  name?: string | null;
  industry?: string | null;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
  logo?: string | null;
};

export const fetchMetricsLiteBatch = createAsyncThunk<void, { tickers: string[] }>(
  "stocks/fetchMetricsLiteBatch",
  async ({ tickers }, { dispatch }) => {
    const unique = Array.from(new Set(tickers)).filter(Boolean);
    if (unique.length === 0) return;

    const qs = encodeURIComponent(unique.join(","));
    const data = await fetchJSON<{ metrics: Record<string, LiteMetrics | null> }>(
      `/api/fh/metrics-batch?lite=1&symbols=${qs}`
    );
    const map = data?.metrics ?? {};

    for (const [symbol, m] of Object.entries(map)) {
      if (!symbol || !m) continue;

      const capM = capMillions(m.marketCapM ?? null);

      let category: Stock["category"] | undefined;
      if (typeof capM === "number") {
        if (capM >= 10000) category = "large";
        else if (capM >= 2000) category = "mid";
        else category = "small";
      }

      const patch: any = {
        ticker: symbol,
        marketCap: capM,
        ...(typeof m.name === "string" && m.name.trim() ? { name: m.name.trim() } : {}),
        ...(typeof m.industry === "string" ? { industry: m.industry } : {}),
        ...(typeof m.country === "string" ? { country: m.country } : {}),
      };
      if (category) patch.category = category;
      if (m.logo) patch.logo = m.logo;

      dispatch(mergeStockPatch(patch));
    }
  }
);

// ---------- Metrics: FULL (metric=all) ----------
type FullMetrics = LiteMetrics & {
  pe?: number | null;
  ps?: number | null;
  pb?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  marketCap?: number | null;   // legacy (в млрд), если вдруг прилетит
  marketCapM?: number | null;  // предпочтительно
};

export const fetchMetricsFullBatch = createAsyncThunk<void, { tickers: string[] }>(
  "stocks/fetchMetricsFullBatch",
  async ({ tickers }, { dispatch }) => {
    const unique = Array.from(new Set(tickers)).filter(Boolean);
    if (unique.length === 0) return;

    const qs = encodeURIComponent(unique.join(","));
    const data = await fetchJSON<{ metrics: Record<string, FullMetrics | null> }>(
      `/api/fh/metrics-batch?symbols=${qs}`
    );
    const map = data?.metrics ?? {};

    for (const [symbol, m] of Object.entries(map)) {
      if (!symbol || !m) continue;

      const capM =
        typeof m.marketCapM === "number"
          ? capMillions(m.marketCapM)
          : typeof m.marketCap === "number"
          ? billionsToMillions(m.marketCap)
          : null;

      let category: Stock["category"] | undefined;
      if (typeof capM === "number") {
        if (capM >= 10000) category = "large";
        else if (capM >= 2000) category = "mid";
        else category = "small";
      }

      const patch: any = {
        ticker: symbol,
        marketCap: capM,
        pe: m.pe ?? null,
        ps: m.ps ?? null,
        pb: m.pb ?? null,
        beta: m.beta ?? null,
        dividendYield: m.dividendYield ?? null,
      };

      if (typeof m.name === "string" && m.name.trim()) patch.name = m.name.trim();
      if (typeof m.industry === "string") patch.industry = m.industry;
      if (typeof m.country === "string") patch.country = m.country;
      if (m.logo) patch.logo = m.logo;
      if (category) patch.category = category;

      dispatch(mergeStockPatch(patch));
    }
  }
);

// ---------- Finviz page fetch ----------
export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

/** Быстрый приоритет для карточки деталей */
export const prioritizeDetailsTicker = createAsyncThunk<void, { ticker: string }>(
  "stocks/prioritizeDetailsTicker",
  async ({ ticker }, { dispatch }) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    await Promise.allSettled([
      dispatch(fetchQuotesBatch({ tickers: [t] })),
      dispatch(fetchMetricsFullBatch({ tickers: [t] })),
    ]);
  }
);

/** Первая загрузка */
export const bootstrapFromFinviz = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  void
>("stocks/bootstrapFromFinviz", async (_arg, { dispatch }) => {
  resetFinvizEffectiveFilter();

  const { page: p0, stocks: s0, hasMoreMeta: more0 } = await (dispatch as any)(fetchFinvizPage({ page: 0 })).unwrap();

  const tickers0 = s0.map((s: Stock) => s.ticker);
  if (tickers0.length) {
    void (dispatch as any)(fetchQuotesBatch({ tickers: tickers0 }));
    void (dispatch as any)(fetchMetricsLiteBatch({ tickers: tickers0 }));
    // спустя ~1.2с — полные мультипликаторы
    setTimeout(() => { void (dispatch as any)(fetchMetricsFullBatch({ tickers: tickers0 })); }, 1200);
  }

  let nextCache: Stock[] | null = null;
  if (more0) {
    try {
      const { stocks: s1 } = await (dispatch as any)(fetchFinvizPage({ page: 1 })).unwrap();
      nextCache = s1;
      const tickers1 = s1.map((s: Stock) => s.ticker);
      if (tickers1.length) {
        void (dispatch as any)(fetchQuotesBatch({ tickers: tickers1 }));
        void (dispatch as any)(fetchMetricsLiteBatch({ tickers: tickers1 }));
        setTimeout(() => { void (dispatch as any)(fetchMetricsFullBatch({ tickers: tickers1 })); }, 1500);
      }
    } catch {
      nextCache = null;
    }
  }

  return { items: s0, nextCache, page: p0, hasMore: more0 || Boolean(nextCache?.length) };
});

/** Загрузка следующей 20-ки (replace + prefetch) */
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
    const { page, stocks } = await (dispatch as any)(fetchFinvizPage({ page: wantPage })).unwrap();
    nextItems = stocks;
    effectivePage = page;
  }

  if (nextItems.length === 0) {
    return { items: state.stocks.items, nextCache: null, page: curr, hasMore: false };
  }

  const tickers = nextItems.map((s) => s.ticker);
  if (tickers.length) {
    void (dispatch as any)(fetchQuotesBatch({ tickers }));
    void (dispatch as any)(fetchMetricsLiteBatch({ tickers }));
    setTimeout(() => { void (dispatch as any)(fetchMetricsFullBatch({ tickers })); }, 1200);
  }

  let nextCache: Stock[] | null = null;
  let hasMore = true;
  try {
    const { stocks: sNext, hasMoreMeta } = await (dispatch as any)(fetchFinvizPage({ page: effectivePage + 1 })).unwrap();
    nextCache = sNext;
    hasMore = hasMoreMeta || (sNext.length > 0);
    const tickersNext = sNext.map((s: Stock) => s.ticker);
    if (tickersNext.length) {
      void (dispatch as any)(fetchQuotesBatch({ tickers: tickersNext }));
      void (dispatch as any)(fetchMetricsLiteBatch({ tickers: tickersNext }));
      setTimeout(() => { void (dispatch as any)(fetchMetricsFullBatch({ tickers: tickersNext })); }, 1500);
    }
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

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

// -------- selectors --------
import type { RootState } from "./index";
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;
