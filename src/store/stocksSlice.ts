// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch";
import { capToBandMillions, parseCapTextToMillions } from "../utils/marketCap";
import { fetchJSON, mapLimit } from "../utils/http";

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

type StocksState = {
  items: Stock[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  symbolPage: number;
  symbolsPerPage: number;
  hasMore: boolean; // NEW
};
const initialState: StocksState = {
  items: [],
  status: "idle",
  symbolPage: Number(localStorage.getItem("symbols_page_v1") || 0),
  symbolsPerPage: 60,
  hasMore: true, // предполагаем, что страницы есть, пока не докажем обратное
};

export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

const addStocksReducer = (state: StocksState, payload: Stock[]) => {
  const byTicker = new Map(state.items.map((s) => [s.ticker, s]));
  for (const s of payload) {
    const prev = byTicker.get(s.ticker);
    byTicker.set(s.ticker, { ...prev, ...s });
  }
  state.items = Array.from(byTicker.values());
};

const lastFetchBySymbol = new Map<string, number>();
let globalBackoffUntil = 0;
const PER_SYMBOL_COOLDOWN_MS = 0;
const GLOBAL_BACKOFF_MS = 30_000;

export const bootstrapFromFinviz = createAsyncThunk<
  Stock[],
  { pages?: number; quotesConcurrency?: number } | void
>("stocks/bootstrapFromFinviz", async (arg = {}, { dispatch }) => {
  const pages = (arg as any)?.pages ?? 1;
  const conc = (arg as any)?.quotesConcurrency ?? Math.max(1, Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 2));

  const { items } = await loadFinviz(0);
  const base: Stock[] = items.map((row: any) => {
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

  // показать сразу
  dispatch(setStocks(base));

  // быстрые котировки для первых 20
  const tickers = base.slice(0, 20).map((s) => s.ticker);
  if (tickers.length) {
    await dispatch(fetchQuotesForTickers({ tickers, concurrency: conc }));
  }

  // фоновая предзагрузка страниц (если просили)
  if (pages > 1) {
    for (let p = 1; p < pages; p++) {
      void dispatch(fetchFinvizPage({ page: p }));
    }
  }

  return base;
});

export const fetchFinvizPage = createAsyncThunk<Stock[], { page: number }>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items } = await loadFinviz(page);
  const payload: Stock[] = items.map((row: any) => {
    const capM = parseCapTextToMillions(row.marketCapText ?? null);
    const category = capToBandMillions(capM) ?? "small";
    return {
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
    } as Stock;
  });
  return payload;
});

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
          if ((e?.status === 429) || msg.includes("429")) {
            globalBackoffUntil = Date.now() + GLOBAL_BACKOFF_MS;
          }
        }
      }
    );
  }
);

const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
      state.status = "succeeded";
      // если первая страница вернула мало (например 9), ещё могут быть страницы
      state.hasMore = true;
    },
    addStocks(state, action: PayloadAction<Stock[]>) {
      addStocksReducer(state, action.payload);
    },
    nextSymbolsPage(state) {
      state.symbolPage += 1;
      localStorage.setItem("symbols_page_v1", String(state.symbolPage));
    },
    resetSymbolsPage(state) {
      state.symbolPage = 0;
      localStorage.setItem("symbols_page_v1", "0");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapFromFinviz.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(bootstrapFromFinviz.fulfilled, (state, action: PayloadAction<Stock[]>) => {
        state.status = "succeeded";
        if (!state.items.length) state.items = action.payload;
        state.hasMore = true;
      })
      .addCase(bootstrapFromFinviz.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action) => {
        const i = state.items.findIndex((s) => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...state.items[i], ...action.payload };
      })
      .addCase(fetchFinvizPage.fulfilled, (state, action) => {
        const countBefore = state.items.length;
        addStocksReducer(state, action.payload);
        const countAfter = state.items.length;
        const added = countAfter - countBefore;
        // если страница ничего не добавила — считаем, что страниц больше нет
        state.hasMore = added > 0;
      });
  },
});

export const { setStocks, addStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;
