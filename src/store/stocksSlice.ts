// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch"; // уже есть в твоём файле

// локальная утилита для котировок с ограничением параллелизма
async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}
type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };
async function mapLimit<T, R>(
  arr: T[], limit: number, fn: (x: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  const workers = Array(Math.min(limit, Math.max(1, arr.length))).fill(0).map(async () => {
    while (true) {
      const idx = i++; if (idx >= arr.length) break;
      out[idx] = await fn(arr[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

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

export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>(
  "stocks/mergeStockPatch"
);

export const bootstrapFromFinviz = createAsyncThunk<
  Stock[],
  { pages?: number; quotesConcurrency?: number } | void
>(
  "stocks/bootstrapFromFinviz",
  async (arg = {}, { dispatch }) => {
    const pages = (arg as any)?.pages ?? 1;
    const conc  = (arg as any)?.quotesConcurrency
      ?? Number(import.meta.env.VITE_FINNHUB_QUOTE_RPS || 8); // ↑ увеличил дефолт

    // 1) Быстро тянем finviz (1-я страница) и ОТРИСОВЫВАЕМ сразу
    const { items } = await loadFinviz(0);
    const base: Stock[] = items.map(row => {
      // лёгкий маппер (как у тебя в loadBatch)
      const capTxt = row.marketCapText ?? null;
      const peSnap = row.peSnapshot ?? null;
      const psSnap = row.psSnapshot ?? null;
      const s: any = {
        ticker: row.ticker,
        name: row.company ?? row.ticker,
        category: "mid",          // настоящая категория уже есть в карточке из твоего маппера; здесь не критично
        price: null,
        pe: null, ps: null, pb: null,
        currentRatio: null, debtToEquity: null, grossMargin: null, netMargin: null,
        marketCap: null,
        marketCapText: capTxt,
        peSnapshot: peSnap,
        psSnapshot: psSnap,
        sector: row.sector ?? null,
        industry: row.industry ?? null,
        potentialScore: null,
        reasons: [],
      };
      return s as Stock;
    });

    // показать мгновенно
    dispatch(setStocks(base));

    // 2) В ФОНЕ — котировки для первых 20 (или всех, если хочешь)
    const tickers = base.slice(0, 20).map(s => s.ticker);
    void (async () => {
      const quotes = await mapLimit(tickers, conc, async (symbol) => {
        const q = await fetchJSON<Quote>(`/api/fh/quote?symbol=${encodeURIComponent(symbol)}`);
        return { ticker: symbol, q };
      });
      quotes.forEach(({ ticker, q }) => {
        dispatch(mergeStockPatch({
          ticker,
          price: q.c ?? null,
          // прокинул OHLC — карточка их подхватит
          ...(q.o != null ? { open: q.o as any } : {}),
          ...(q.h != null ? { high: q.h as any } : {}),
          ...(q.l != null ? { low:  q.l as any } : {}),
          ...(q.pc!= null ? { prevClose: q.pc as any } : {}),
        }));
      });
    })();

    // 3) Можно прогреть остальные страницы finviz (без влияния на UX)
    if (pages > 1) {
      for (let p = 1; p < pages; p++) {
        void loadFinviz(p).catch(() => {});
      }
    }

    return base; // уже отрисовано
  }
);

const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
      state.status = "succeeded";
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
        // данные уже показали ранее; тут можно просто убедиться
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
      });
  },
});

export const { setStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;
