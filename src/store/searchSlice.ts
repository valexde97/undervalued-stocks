import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "./index";
import type { Stock } from "../types/stock";
import { searchSymbols, getProfile, getQuote } from "../api/finhub";

type SearchState = {
  query: string;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string | null;
  result: Stock | null;
  notFound: boolean;
};

const initialState: SearchState = {
  query: "",
  status: "idle",
  error: null,
  result: null,
  notFound: false,
};

function categoryFromBillionCap(mcB?: number | null): Stock["category"] | undefined {
  if (typeof mcB !== "number" || !Number.isFinite(mcB) || mcB <= 0) return undefined;
  if (mcB >= 10) return "large";
  if (mcB >= 2) return "mid";
  return "small";
}
function capTextFromBillionCap(mcB?: number | null): string | null {
  if (typeof mcB !== "number" || !Number.isFinite(mcB) || mcB <= 0) return null;
  if (mcB >= 1) return `${mcB.toFixed(2)}B`;
  return `${(mcB * 1000).toFixed(2)}M`;
}

export const searchByTickerOrName = createAsyncThunk<
  { result: Stock | null; notFound: boolean; normQuery: string },
  { query: string }
>("search/searchByTickerOrName", async ({ query }) => {
  const q = (query || "").trim();
  const qUpper = q.toUpperCase();
  if (!q) return { result: null, notFound: false, normQuery: "" };

  const list = await searchSymbols(q);
  const items = (list?.result ?? []) as Array<{ symbol?: string; description?: string; type?: string }>;

  const picked = items.find(it => (it.symbol || "").toUpperCase() === qUpper)
    ?? items.find(it => (it.description || "").toUpperCase() === qUpper)
    ?? items.find(it =>
      (it.symbol || "").toUpperCase().includes(qUpper) ||
      (it.description || "").toUpperCase().includes(qUpper)
    );

  if (!picked?.symbol) {
    return { result: null, notFound: true, normQuery: q };
  }

  const symbol = picked.symbol.toUpperCase();

  const [profile, quote] = await Promise.all([
    getProfile(symbol),
    getQuote(symbol),
  ]);

  const mcB = typeof profile?.marketCapitalization === "number" ? profile.marketCapitalization : null;
  const category = categoryFromBillionCap(mcB);
  const marketCapText = capTextFromBillionCap(mcB);

  const stock: Stock = {
    ticker: symbol,
    name: profile?.name || picked.description || symbol,
    category: category ?? "small",

    price: typeof quote?.c === "number" && Number.isFinite(quote.c) ? quote.c : null,
    changePct: typeof quote?.dp === "number" && Number.isFinite(quote.dp) ? quote.dp : null,

    pe: null,
    ps: null,
    pb: null,
    currentRatio: null,
    debtToEquity: null,
    grossMargin: null,
    netMargin: null,

    marketCap: mcB != null ? Math.round(mcB * 1000) : null, // млрд -> млн
    marketCapText,

    sector: null,
    industry: (profile as any)?.finnhubIndustry ?? null,
    country: (profile as any)?.country ?? null,

    beta: null,
    dividendYield: null,

    peSnapshot: null,
    psSnapshot: null,
    pbSnapshot: null,

    listedAt: profile?.ipo ? new Date(profile.ipo) : undefined,
    potentialScore: null,
    reasons: [],
  };

  return { result: stock, notFound: false, normQuery: q };
});

const searchSlice = createSlice({
  name: "search",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    clearResult(state) {
      state.result = null;
      state.notFound = false;
      state.error = null;
      state.status = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchByTickerOrName.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.notFound = false;
        if (action.meta.arg?.query != null) state.query = action.meta.arg.query;
      })
      .addCase(searchByTickerOrName.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.result = action.payload.result;
        state.notFound = action.payload.notFound;
      })
      .addCase(searchByTickerOrName.rejected, (state, action) => {
        const msg = action.error?.message || "Search failed";
        state.status = "failed";
        state.error = msg === "FINNHUB_TOKEN_MISSING"
          ? "Finnhub API key is missing. Set VITE_FINNHUB_KEY."
          : msg;
      });
  },
});

export const { setQuery, clearResult } = searchSlice.actions;
export default searchSlice.reducer;

export const selectSearch = (s: RootState) => s.search;
