// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadBatchFast, enrichBatch, refetchQuotes, computeScore } from "../api/loadBatch";

// --- state
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

// --- actions
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>(
  "stocks/mergeStockPatch"
);

// утилита: "48.80M" -> 0.0488 (в млрд)
function parseCapTextToBillions(txt?: string | null) {
  if (!txt) return null;
  const m = String(txt).trim().match(/^([\d.,]+)\s*([MBT])?$/i);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] || "").toUpperCase();
  const factor = unit === "T" ? 1000 : unit === "B" ? 1 : unit === "M" ? 0.001 : 0;
  if (!Number.isFinite(num)) return null;
  return num * factor; // млрд
}

function capToBandFromText(txt?: string | null): "small" | "mid" | "large" {
  const capB = parseCapTextToBillions(txt) ?? 0;
  if (capB >= 10) return "large";
  if (capB >= 2) return "mid";
  return "small";
}

// --- Finviz bootstrap
type FinvizItem = {
  ticker: string;
  company: string | null;
  marketCapText: string | null;
  peSnapshot: number | null;
  psSnapshot: number | null;
  sector: string | null;
  industry: string | null;
};
type FinvizPage = { page: number; count: number; items: FinvizItem[] };

export const bootstrapFromFinviz = createAsyncThunk<
  Stock[],
  { pages?: number } | void
>(
  "stocks/bootstrapFromFinviz",
  async (arg = {}, { dispatch }) => {
    const pages = arg?.pages ?? 12;

    // 1) первая страница
    const page0: FinvizPage = await fetch("/api/finviz?page=0").then(r => r.json());

   const firstStocks: Stock[] = page0.items.map((x) => {
  const category = capToBandFromText(x.marketCapText); // <- твоя утилита (см. ранее)
  return {
    ticker: x.ticker,
    name: x.company ?? x.ticker,
    category,
    price: null,

    // снапшоты (быстро из Finviz)
    peSnapshot: x.peSnapshot ?? null,
    psSnapshot: x.psSnapshot ?? null,

    // ДОБАВЛЕНО: для UI
    marketCapText: x.marketCapText ?? null,
    sector: x.sector ?? null,
    industry: x.industry ?? null,

    // можно хранить и численную капу, если хочешь
    marketCap: parseCapTextToBillions(x.marketCapText),

    potentialScore: null,
    reasons: [],
  };
});


    // мгновенно показать
    dispatch(setStocks(firstStocks));

    // 2) фоном — страницы 1..pages-1 (разогрев прокси-таблицы)
    if (pages > 1) {
      const tasks: Promise<void>[] = [];
      for (let p = 1; p < pages; p++) {
        tasks.push(fetch(`/api/finviz?page=${p}`).then(() => {}).catch(() => {}));
      }
      void Promise.allSettled(tasks);
    }

    // 3) быстрые котировки для первых 20
    const firstTickers = firstStocks.map(s => s.ticker);
    const withPrices = await loadBatchFast(firstTickers, { quotesFirstN: 20 });
    const priceMap = new Map(withPrices.map(s => [s.ticker, s.price ?? 0]));
    const merged = firstStocks.map<Stock>(s => ({ ...s, price: priceMap.get(s.ticker) ?? null }));

    // 4) фон: метрики + скор
    void dispatch(enrichCurrentBatch(firstTickers));

    // 5) фон: ретрай нулевых цен
    const missing = firstTickers.filter(t => (priceMap.get(t) ?? 0) <= 0);
    if (missing.length) void dispatch(retryZeroQuotes(missing));

    return merged;
  }
);

// --- обогащение
export const enrichCurrentBatch = createAsyncThunk<void, string[]>(
  "stocks/enrich",
  async (tickers, { dispatch, getState }) => {
    const patches = await enrichBatch(tickers, { firstN: tickers.length });
    const state = (getState() as { stocks: StocksState }).stocks;

    patches.forEach((p) => {
      const current = state.items.find((x) => x.ticker === p.ticker);
      if (!current) return;
      const merged = { ...current, ...p } as Stock;
      const potentialScore = computeScore(merged);
      dispatch(mergeStockPatch({ ...p, ticker: p.ticker, potentialScore }));
    });
  }
);

// --- ретрай котировок
export const retryZeroQuotes = createAsyncThunk<void, string[]>(
  "stocks/retryQuotes",
  async (tickers, { dispatch }) => {
    const quotes = await refetchQuotes(tickers, { firstN: tickers.length });
    quotes
      .filter(q => q.price && q.price > 0)
      .forEach(q => dispatch(mergeStockPatch({ ticker: q.ticker, price: q.price })));
  }
);

// --- slice
const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
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
        state.items = action.payload;
      })
      .addCase(bootstrapFromFinviz.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action) => {
        const i = state.items.findIndex(s => s.ticker === action.payload.ticker);
        if (i !== -1) state.items[i] = { ...state.items[i], ...action.payload };
      });
  },
});

export const { setStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;
