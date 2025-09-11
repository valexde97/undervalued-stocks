// src/store/newsSlice.ts
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "./index";
import { fetchJSON } from "../utils/http";

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string | null;
  tags: ("Debt" | "Mgmt" | "Guidance" | "Legal" | "Capital")[];
  sentiment: "positive" | "negative" | "neutral";
};

type SymbolNews = {
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string | null;
  insights: string[];
  items: NewsItem[];
  ts?: number;
};

type NewsState = {
  bySymbol: Record<string, SymbolNews>;
};

const initialState: NewsState = { bySymbol: {} };

// 🔒 Стабильные ссылки, чтобы селектор не создавал новых объектов
const EMPTY_INSIGHTS: string[] = [];
const EMPTY_ITEMS: NewsItem[] = [];
const EMPTY_SYMBOL_NEWS: SymbolNews = { status: "idle", insights: EMPTY_INSIGHTS, items: EMPTY_ITEMS };

// -------- Thunk
export const fetchNewsForSymbol = createAsyncThunk<
  { symbol: string; insights: string[]; items: NewsItem[] },
  { symbol: string; lookbackDays?: number; limit?: number }
>(
  "news/fetchForSymbol",
  async ({ symbol, lookbackDays = 14, limit = 20 }) => {
    const qs = new URLSearchParams({
      feature: "news",
      symbol,
      lookbackDays: String(lookbackDays),
      limit: String(limit),
    }).toString();

    const data = await fetchJSON<{ insights: string[]; items: NewsItem[] }>(`/api/finviz?${qs}`, {
      noStore: true,
      timeoutMs: 15000,
    });
    return { symbol, insights: data.insights || [], items: data.items || [] };
  }
);

// -------- Slice
const newsSlice = createSlice({
  name: "news",
  initialState,
  reducers: {
    clearNews(state, action: PayloadAction<{ symbol: string }>) {
      const s = action.payload.symbol.toUpperCase();
      delete state.bySymbol[s];
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchNewsForSymbol.pending, (state, action) => {
      const s = action.meta.arg.symbol.toUpperCase();
      state.bySymbol[s] = state.bySymbol[s] || { ...EMPTY_SYMBOL_NEWS };
      state.bySymbol[s].status = "loading";
      state.bySymbol[s].error = null;
    });
    b.addCase(fetchNewsForSymbol.fulfilled, (state, action) => {
      const { symbol, insights, items } = action.payload;
      const s = symbol.toUpperCase();
      state.bySymbol[s] = {
        status: "succeeded",
        insights,
        items,
        ts: Date.now(),
      };
    });
    b.addCase(fetchNewsForSymbol.rejected, (state, action) => {
      const s = (action.meta.arg.symbol || "").toUpperCase();
      state.bySymbol[s] = state.bySymbol[s] || { ...EMPTY_SYMBOL_NEWS };
      state.bySymbol[s].status = "failed";
      state.bySymbol[s].error = action.error?.message || "Failed to load news";
    });
  },
});

export const { clearNews } = newsSlice.actions;

// -------- Selector (больше не создаёт новый объект)
export const selectNewsFor = (symbol: string) => (state: RootState) =>
  state.news.bySymbol[symbol.toUpperCase()] || EMPTY_SYMBOL_NEWS;

export default newsSlice.reducer;
