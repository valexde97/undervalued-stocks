import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../../types/stock";
import type { RootState } from "../index";
import { goToPage } from "./thunks";
import { mergeStockPatch, seedDetails } from "./actions";

/* =========================
   State
========================= */
export type StocksState = {
  items: Stock[];
  nextCache: Stock[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  currentPage: number; // 0-based
  hasMore: boolean;
  pageEpoch: number; // увеличиваем на каждую смену страницы

  // Кеш семян для страницы деталей
  detailsSeeds: Record<string, { price: number | null; category: Stock["category"] | null; ts: number }>;

  // FMP profiles — отключено, но оставляем для совместимости
  fmpProfiles: Record<string, { profile: any | null; error?: string | null; ts: number }>;
  fmpQueue: string[];
  fmpBusy: boolean;
};

const initialState: StocksState = {
  items: [],
  nextCache: null,
  status: "idle",
  currentPage: -1,
  hasMore: true,
  pageEpoch: 0,
  detailsSeeds: {},

  fmpProfiles: {},
  fmpQueue: [],
  fmpBusy: false,
};

/* =========================
   Slice
========================= */
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
      state.pageEpoch = 0;

      state.detailsSeeds = {};

      state.fmpProfiles = {};
      state.fmpQueue = [];
      state.fmpBusy = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(goToPage.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(goToPage.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.items;
        state.nextCache = action.payload.nextCache;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
        state.pageEpoch += 1; // новая страница → новая эпоха
      })
      .addCase(goToPage.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action: PayloadAction<any>) => {
        const i = state.items.findIndex((s) => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...(state.items[i] as any), ...action.payload } as Stock;
      })
      .addCase(seedDetails, (state, action) => {
        const { ticker, price, category } = action.payload;
        state.detailsSeeds[ticker.toUpperCase()] = {
          price,
          category: (category ?? null) as Stock["category"] | null,
          ts: Date.now(),
        };
      });
  },
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

/* =========================
   Selectors
========================= */
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;

export const selectSeedByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.detailsSeeds[ticker.toUpperCase()] || null;

// FMP selectors — заглушки
export const selectFmpProfileByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.fmpProfiles[ticker.toUpperCase()]?.profile ?? null;

export const selectFmpProfileStatus = (ticker: string) => (state: RootState) => {
  const t = ticker.toUpperCase();
  const inQueue = state.stocks.fmpQueue.includes(t);
  const cached = !!state.stocks.fmpProfiles[t];
  return { inQueue, cached, busy: state.stocks.fmpBusy };
};
