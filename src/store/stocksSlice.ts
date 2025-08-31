// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch";
import { capToBandMillions, parseCapTextToMillions } from "../utils/marketCap";
import { fetchJSON, mapLimit } from "../utils/http";

/**
 * Finnhub quote shape returned by our /api/fh/quote proxy
 */
type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
export type StocksState = {
  items: Stock[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  symbolPage: number;       // сколько страниц (по 20) раскрыто в UI
  symbolsPerPage: number;   // не используется напрямую для Finviz; оставим на будущее
  hasMore: boolean;
};

function getInitialSymbolPage(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem("symbols_page_v1");
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

const initialState: StocksState = {
  items: [],
  status: "idle",
  symbolPage: getInitialSymbolPage(),
  symbolsPerPage: 60,
  hasMore: true,
};

export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
const addStocksReducer = (state: StocksState, payload: Stock[]) => {
  const byTicker = new Map(state.items.map((s) => [s.ticker, s] as const));
  for (const s of payload) {
    const prev = byTicker.get(s.ticker);
    byTicker.set(s.ticker, { ...prev, ...s });
  }
  state.items = Array.from(byTicker.values());
};

/** Drop garbage like dash, pure digits, or values equal to ticker */
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
    const capM = parseCapTextToMillions(row.marketCapText ?? null);
    const category = capToBandMillions(capM) ?? "small";

    const s: Stock = {
      ticker,
      name: saneText(row.company, ticker) ?? ticker,
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

// ----------------------------------------------------------------------------
// BOOTSTRAP
// ----------------------------------------------------------------------------
export const bootstrapFromFinviz = createAsyncThunk<
  Stock[],
  { pages?: number; quotesConcurrency?: number } | void
>("stocks/bootstrapFromFinviz", async (arg = {}, { dispatch }) => {
  const conc =
    (arg as any)?.quotesConcurrency ?? Math.max(1, Number((import.meta as any).env?.VITE_FINNHUB_QUOTE_RPS || 2));

  const { items } = await loadFinviz(0); // page=0 (сервер подольёт до 20 при необходимости)
  const base: Stock[] = mapFinvizItemsToStocks(items);

  // показать мгновенно
  dispatch(setStocks(base));

  // подхватить котировки для первых 20 (новых)
  const tickers = base.slice(0, 20).map((s) => s.ticker);
  if (tickers.length) {
    await dispatch(fetchQuotesForTickers({ tickers, concurrency: conc }));
  }

  // префетч следующей страницы
  void dispatch(fetchFinvizPage({ page: 1 }));

  return base;
});

// ----------------------------------------------------------------------------
// Finviz pages
// ----------------------------------------------------------------------------
export const fetchFinvizPage = createAsyncThunk<Stock[], { page: number }>(
  "stocks/fetchFinvizPage",
  async ({ page }) => {
    const { items } = await loadFinviz(page); // строгие 20 с page >= 1
    return mapFinvizItemsToStocks(items);
  }
);

export const fetchFinvizPageWithPrefetch = createAsyncThunk<
  { payload: Stock[]; page: number },
  { page: number }
>("stocks/fetchFinvizPageWithPrefetch", async ({ page }, { dispatch }) => {
  const payload = await dispatch(fetchFinvizPage({ page })).unwrap();
  if (payload.length === 20) void dispatch(fetchFinvizPage({ page: page + 1 }));
  return { payload, page };
});

// ----------------------------------------------------------------------------
// Quotes (строгая сериализация и анти-429)
// ----------------------------------------------------------------------------
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
const RPS_DELAY_MS = Math.max(400, Number(((import.meta as any).env?.VITE_QUOTE_RPS_DELAY_MS as any) || 1_200));

let lastQuoteAt = 0;
let quotesChain: Promise<void> = Promise.resolve();

async function waitForRpsSlot() {
  const now = Date.now();
  const wait = Math.max(0, RPS_DELAY_MS - (now - lastQuoteAt));
  if (wait > 0) await sleep(wait);
  lastQuoteAt = Date.now();
}

export const fetchQuotesForTickers = createAsyncThunk<
  void,
  { tickers: string[]; concurrency?: number }
>("stocks/fetchQuotesForTickers", async ({ tickers, concurrency = 1 }, { dispatch }) => {
  // сериализуем все «партии» котировок, чтобы не было всплесков
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
      Math.max(1, Math.min(concurrency, 1)), // по умолчанию последовательно
      async (symbol) => {
        if (Date.now() < globalBackoffUntil) return;
        await waitForRpsSlot();
        try {
          const url = `/api/fh/quote?symbol=${encodeURIComponent(symbol)}`;
          const q = await fetchJSON<Quote>(url);
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
  });

  await quotesChain;
});

// ----------------------------------------------------------------------------
// Slice
// ----------------------------------------------------------------------------
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem("symbols_page_v1", String(state.symbolPage));
      }
    },
    resetSymbolsPage(state) {
      state.symbolPage = 0;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("symbols_page_v1", "0");
      }
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
        state.hasMore = action.payload.length === 20;
      })
      .addCase(bootstrapFromFinviz.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action) => {
        const i = state.items.findIndex((s) => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...state.items[i], ...action.payload } as Stock;
      })
      .addCase(fetchFinvizPage.fulfilled, (state, action) => {
        const before = state.items.length;
        addStocksReducer(state, action.payload);
        const after = state.items.length;
        state.hasMore = action.payload.length === 20 && after > before;
      })
      .addCase(fetchFinvizPageWithPrefetch.fulfilled, (state, action) => {
        const { payload } = action.payload;
        const before = state.items.length;
        addStocksReducer(state, payload);
        const after = state.items.length;
        state.hasMore = payload.length === 20 && after > before;
      });
  },
});

export const { setStocks, addStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;

// --- Selectors (добавить внизу файла) ---
import type { RootState } from "./index";

export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => {
  const { items, symbolPage } = state.stocks;
  const end = Math.min(items.length, (symbolPage + 1) * 20);
  return items.slice(0, end);
};
