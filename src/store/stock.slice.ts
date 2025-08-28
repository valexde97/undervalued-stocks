// src/store/stocks.slice.ts
import { createAction, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";

export type StocksState = {
  items: Stock[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  symbolPage: number;        // текущая показанная страница (0-индекс)
  symbolsPerPage: number;    // 20*pagesToShow? оставим 60 по умолчанию как было
  hasMore: boolean;
};

const initialState: StocksState = {
  items: [],
  status: "idle",
  symbolPage: Number(localStorage.getItem("symbols_page_v1") || 0),
  symbolsPerPage: 60,
  hasMore: true,
};

// патч отдельной бумаги (цены и т.п.)
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

// утилита мержа пачки без дублей
const addStocksReducer = (state: StocksState, payload: Stock[]) => {
  const byTicker = new Map(state.items.map((s) => [s.ticker, s]));
  for (const s of payload) {
    const prev = byTicker.get(s.ticker);
    byTicker.set(s.ticker, { ...prev, ...s });
  }
  state.items = Array.from(byTicker.values());
};

const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
      state.status = "succeeded";
      state.hasMore = action.payload.length === 20;
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
    setStatus(state, action: PayloadAction<StocksState["status"]>) {
      state.status = action.payload;
    },
    setError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
    },
    setHasMore(state, action: PayloadAction<boolean>) {
      state.hasMore = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Асинхронщина уедет в stocks.thunks.ts и подключится там через builder.addCase(...)
  },
});

export const {
  setStocks,
  addStocks,
  nextSymbolsPage,
  resetSymbolsPage,
  setStatus,
  setError,
  setHasMore,
} = stocksSlice.actions;

export default stocksSlice.reducer;

// ------ Selectors ------

export const selectStocksState = (s: { stocks: StocksState }) => s.stocks;
export const selectAllStocks = (s: { stocks: StocksState }) => s.stocks.items;

// сколько карточек показать (страницы * 20, с потолком по items.length)
export const selectVisibleCount = (s: { stocks: StocksState }) => {
  const page = s.stocks.symbolPage; // 0 => 1*20, 1 => 2*20 ...
  return Math.min(s.stocks.items.length, (page + 1) * 20);
};

export const selectVisibleStocks = (s: { stocks: StocksState }) =>
  s.stocks.items.slice(0, selectVisibleCount(s));
