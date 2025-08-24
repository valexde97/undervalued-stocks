// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch";
import { capToBandMillions, parseCapTextToMillions } from "../utils/marketCap";
import { fetchJSON, mapLimit } from "../utils/http";

type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

// ================= state =================
type StocksState = {
  items: Stock[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  symbolPage: number;
  symbolsPerPage: number;
};
const initialState: StocksState = {
  items: [],
  status: "idle",
  symbolPage: Number(localStorage.getItem("symbols_page_v1") || 0),
  symbolsPerPage: 60,
};

// ================= actions =================
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>(
  "stocks/mergeStockPatch"
);

// Добавляющий редьюсер — слияние по тикеру
const addStocksReducer = (state: StocksState, payload: Stock[]) => {
  const byTicker = new Map(state.items.map(s => [s.ticker, s]));
  for (const s of payload) {
    const prev = byTicker.get(s.ticker);
    byTicker.set(s.ticker, { ...prev, ...s });
  }
  state.items = Array.from(byTicker.values());
};

// ================= thunks =================

// 1) Старт: быстрая 0-я страница Finviz → мгновенный рендер, котировки для первых 20.
export const bootstrapFromFinviz = createAsyncThunk<
  Stock[],
  { pages?: number; quotesConcurrency?: number } | void
>(
  "stocks/bootstrapFromFinviz",
  async (arg = {}, { dispatch }) => {
    const pages = (arg as any)?.pages ?? 1;
    const conc  = (arg as any)?.quotesConcurrency
      ?? Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 8);

    // 1) Первая страница
    const { items } = await loadFinviz(0);
    const base: Stock[] = items.map(row => {
      const capM = parseCapTextToMillions(row.marketCapText ?? null);
      const category = capToBandMillions(capM) ?? "small";
      const s: Stock = {
        ticker: row.ticker,
        name: row.company ?? row.ticker,
        category,
        price: null,

        pe: null, ps: null, pb: null,
        currentRatio: null, debtToEquity: null, grossMargin: null, netMargin: null,

        marketCap: capM, // в млн $
        marketCapText: row.marketCapText ?? null,
        peSnapshot: row.peSnapshot ?? null,
        psSnapshot: row.psSnapshot ?? null,
        sector: row.sector ?? null,
        industry: row.industry ?? null,

        potentialScore: null,
        reasons: [],
      };
      return s;
    });

    // показать мгновенно
    dispatch(setStocks(base));

    // 2) Котировки для первых 20 — БЕЗ КЕША
    const tickers = base.slice(0, 20).map(s => s.ticker);
    void (async () => {
      const quotes = await mapLimit(tickers, conc, async (symbol) => {
        const q = await fetchJSON<Quote>(
          `/api/fh/quote?symbol=${encodeURIComponent(symbol)}`,
          { noStore: true }
        );
        return { ticker: symbol, q };
      });
      quotes.forEach(({ ticker, q }) => {
        dispatch(mergeStockPatch({
          ticker,
          price: q.c ?? null,
          ...(q.o != null ? { open: q.o as any } : {}),
          ...(q.h != null ? { high: q.h as any } : {}),
          ...(q.l != null ? { low:  q.l as any } : {}),
          ...(q.pc!= null ? { prevClose: q.pc as any } : {}),
        }));
      });
    })();

    // 3) Догрузка последующих страниц — расширяем список
    if (pages > 1) {
      for (let p = 1; p < pages; p++) {
        void dispatch(fetchFinvizPage({ page: p }));
      }
    }

    return base;
  }
);

// 2) Догрузка конкретной страницы Finviz с добавлением в общий список
export const fetchFinvizPage = createAsyncThunk<
  Stock[],
  { page: number }
>(
  "stocks/fetchFinvizPage",
  async ({ page }) => {
    const { items } = await loadFinviz(page);
    const payload: Stock[] = items.map(row => {
      const capM = parseCapTextToMillions(row.marketCapText ?? null);
      const category = capToBandMillions(capM) ?? "small";
      return {
        ticker: row.ticker,
        name: row.company ?? row.ticker,
        category,
        price: null,

        pe: null, ps: null, pb: null,
        currentRatio: null, debtToEquity: null, grossMargin: null, netMargin: null,

        marketCap: capM,
        marketCapText: row.marketCapText ?? null,
        peSnapshot: row.peSnapshot ?? null,
        psSnapshot: row.psSnapshot ?? null,
        sector: row.sector ?? null,
        industry: row.industry ?? null,

        potentialScore: null,
        reasons: [],
      } as Stock;
    });
    return payload;
  }
);

// 3) Подкачка котировок для группы тикеров (с ограничением параллелизма)
export const fetchQuotesForTickers = createAsyncThunk<
  void,
  { tickers: string[], concurrency?: number }
>(
  "stocks/fetchQuotesForTickers",
  async ({ tickers, concurrency = Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 8) }, { dispatch }) => {
    await mapLimit(tickers, concurrency, async (symbol) => {
      try {
        const q = await fetchJSON<Quote>(
          `/api/fh/quote?symbol=${encodeURIComponent(symbol)}`,
          { noStore: true }
        );
        dispatch(mergeStockPatch({
          ticker: symbol,
          price: q.c ?? null,
          ...(q.o != null ? { open: q.o as any } : {}),
          ...(q.h != null ? { high: q.h as any } : {}),
          ...(q.l != null ? { low:  q.l as any } : {}),
          ...(q.pc!= null ? { prevClose: q.pc as any } : {}),
        }));
      } catch {}
    });
  }
);

// ================= slice =================
const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
      state.status = "succeeded";
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
      })
      .addCase(bootstrapFromFinviz.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action) => {
        const i = state.items.findIndex(s => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...state.items[i], ...action.payload };
      })
      .addCase(fetchFinvizPage.fulfilled, (state, action) => {
        addStocksReducer(state, action.payload);
      });
  },
});

export const { setStocks, addStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;
