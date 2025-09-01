// src/store/stocksSlice.ts
import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz, resetFinvizEffectiveFilter } from "../api/loadBatch";import { capToBandMillions, parseCapTextToMillions } from "../utils/marketCap";
import { fetchJSON, mapLimit } from "../utils/http";

/** Finnhub quote shape from /api/fh/quote */
type Quote = { c?: number; o?: number; h?: number; l?: number; pc?: number };

export type StocksState = {
  items: Stock[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  symbolPage: number;       // сколько страниц (по 20) показано в UI
  hasMore: boolean;         // есть ли ещё страницы на сервере (по данным API)
  maxFetchedPage: number;   // наибольшая фактически загруженная страница Finviz (0..N)
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
  hasMore: true,
  maxFetchedPage: -1,
};

export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

// --------------------- helpers ---------------------
const addStocksReducer = (state: StocksState, payload: Stock[]) => {
  const byTicker = new Map(state.items.map((s) => [s.ticker, s] as const));
  for (const s of payload) {
    const prev = byTicker.get(s.ticker);
    byTicker.set(s.ticker, { ...prev, ...s });
  }
  state.items = Array.from(byTicker.values());
};

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

// --------------------- quotes throttling ---------------------
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
const RPS_DELAY_MS = Math.max(300, Number(((import.meta as any).env?.VITE_QUOTE_RPS_DELAY_MS as any) || 900));

let lastQuoteAt = 0;
let quotesChain: Promise<void> = Promise.resolve();

async function waitForRpsSlot() {
  const now = Date.now();
  const wait = Math.max(0, RPS_DELAY_MS - (now - lastQuoteAt));
  if (wait > 0) await sleep(wait);
  lastQuoteAt = Date.now();
}

// --------------------- thunks ---------------------
export const fetchQuotesForTickers = createAsyncThunk<
  void,
  { tickers: string[]; concurrency?: number }
>("stocks/fetchQuotesForTickers", async ({ tickers, concurrency = 2 }, { dispatch }) => {
  const conc = Math.max(1, Math.min(Math.floor(concurrency), 3));

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
      conc,
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

export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

/**
 * Загружает запрошенную страницу и префетчит следующую, поддерживая «буфер» в 20 бумаг.
 * Параллельно подтягивает котировки для только что загруженных тикеров.
 */
export const fetchFinvizPageWithPrefetch = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number; quotesConcurrency?: number }
>("stocks/fetchFinvizPageWithPrefetch", async ({ page, quotesConcurrency = 2 }, { dispatch }) => {
  const { page: p, stocks, hasMoreMeta } = await dispatch(fetchFinvizPage({ page })).unwrap();

  const tickers = stocks.map((s) => s.ticker);
  if (tickers.length) {
    void dispatch(fetchQuotesForTickers({ tickers, concurrency: quotesConcurrency }));
  }

  if (stocks.length === 20) void dispatch(fetchFinvizPage({ page: page + 1 }));

  return { page: p, stocks, hasMoreMeta };
});

/**
 * Фоновая догрузка страниц до лимита (по умолчанию 200), держа «буфер» 1 страницу вперёд.
 * Если страницу вернули пустой, но hasMoreMeta === true (антибот), пробуем повторить позже.
 */
export const prefetchFinvizToLimit = createAsyncThunk<
  void,
  { maxTotal?: number; quotesConcurrency?: number; delayMs?: number } | void
>("stocks/prefetchFinvizToLimit", async (arg = {}, { getState, dispatch }) => {
  const { maxTotal = 200, quotesConcurrency = 2, delayMs = 250 } = arg as any;

  let state = getState() as { stocks: StocksState };
  let nextPage = Math.max(1, state.stocks.maxFetchedPage + 1);

  // до 3 попыток на одну и ту же страницу при блоке
  let attemptsOnSamePage = 0;

  while (true) {
    state = getState() as { stocks: StocksState };
    if (!state.stocks.hasMore) break;
    if (state.stocks.items.length >= maxTotal) break;

    const buffered = Math.floor(state.stocks.items.length / 20) - state.stocks.symbolPage - 1;
    if (buffered >= 1) {
      await sleep(delayMs);
      continue;
    }

    const { stocks, hasMoreMeta } = await (dispatch(fetchFinvizPage({ page: nextPage })) as any).unwrap();
    if (stocks.length) {
      const tickers = stocks.map((s) => s.ticker);
      void dispatch(fetchQuotesForTickers({ tickers, concurrency: quotesConcurrency }));
      attemptsOnSamePage = 0;
    } else {
      // пусто — если API говорит «hasMoreMeta=true», то это, скорее всего, блок; попробуем позже
      if (hasMoreMeta && attemptsOnSamePage < 3) {
        attemptsOnSamePage += 1;
        await sleep(delayMs + 400);
        continue; // пробуем ту же страницу снова
      } else {
        // либо реальный конец, либо 3 неудачные попытки — переходим дальше
        attemptsOnSamePage = 0;
      }
    }

    if (!hasMoreMeta || stocks.length < 20) break;
    nextPage += 1;
    await sleep(delayMs);
  }
});

// --------------------- bootstrap ---------------------
// Вверху файла:
import { loadFinviz, resetFinvizEffectiveFilter } from "../api/loadBatch";

// ...

export const bootstrapFromFinviz = createAsyncThunk<
  { stocks: Stock[]; hasMoreMeta: boolean },
  { quotesConcurrency?: number } | void
>("stocks/bootstrapFromFinviz", async (arg = {}, { dispatch }) => {
  const quotesConc =
    (arg as any)?.quotesConcurrency ?? Math.max(1, Number((import.meta as any).env?.VITE_FINNHUB_QUOTE_RPS || 2));

  // Сбрасываем видимую страницу и effectiveF на новый запуск,
  // чтобы не было рассинхрона со старым фильтром
  dispatch(resetSymbolsPage());
  resetFinvizEffectiveFilter();

  // Первая страница — сервер сам подберёт effectiveF и вернёт его в заголовке
  const { items, meta } = await loadFinviz(0);
  const base: Stock[] = mapFinvizItemsToStocks(items);

  dispatch(setStocks(base));

  const tickers = base.slice(0, 20).map((s) => s.ticker);
  if (tickers.length) {
    await dispatch(fetchQuotesForTickers({ tickers, concurrency: quotesConc }));
  }

  void dispatch(fetchFinvizPage({ page: 1 }));
  void dispatch(prefetchFinvizToLimit({ maxTotal: 200, quotesConcurrency: quotesConc, delayMs: 250 }));

  return { stocks: base, hasMoreMeta: !!meta?.hasMore };
});

// --------------------- slice ---------------------
const stocksSlice = createSlice({
  name: "stocks",
  initialState,
  reducers: {
    setStocks(state, action: PayloadAction<Stock[]>) {
      state.items = action.payload;
      state.status = "succeeded";
      // hasMore устанавливаем в extraReducers из meta, чтобы тут не перетирать неизвестным
      state.maxFetchedPage = Math.max(state.maxFetchedPage, 0);
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
      .addCase(bootstrapFromFinviz.fulfilled, (state, action) => {
        const { stocks, hasMoreMeta } = action.payload;
        state.status = "succeeded";
        if (!state.items.length) state.items = stocks;
        state.hasMore = hasMoreMeta; // из ответа API
        state.maxFetchedPage = Math.max(state.maxFetchedPage, 0);
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
        const { page, stocks, hasMoreMeta } = action.payload;
        const before = state.items.length;
        addStocksReducer(state, stocks);
        const after = state.items.length;

        // Если пришло 0 — НЕ сбрасываем hasMore (оставляем шанс на ретрай)
        if (stocks.length === 0) {
          // не трогаем state.hasMore
        } else {
          // Есть данные — используем метаданные от API, либо эвристику
          state.hasMore = hasMoreMeta ?? (stocks.length === 20 && after > before);
        }

        state.maxFetchedPage = Math.max(state.maxFetchedPage, page);
      })
      .addCase(fetchFinvizPageWithPrefetch.fulfilled, (state, action) => {
        const { page, stocks, hasMoreMeta } = action.payload;
        const before = state.items.length;
        addStocksReducer(state, stocks);
        const after = state.items.length;

        if (stocks.length === 0) {
          // не трогаем hasMore (пусть кнопка остаётся)
        } else {
          state.hasMore = hasMoreMeta ?? (stocks.length === 20 && after > before);
        }

        state.maxFetchedPage = Math.max(state.maxFetchedPage, page);
      });
  },
});

export const { setStocks, addStocks, nextSymbolsPage, resetSymbolsPage } = stocksSlice.actions;
export default stocksSlice.reducer;

// -------- selectors --------
import type { RootState } from "./index";
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => {
  const { items, symbolPage } = state.stocks;
  const end = Math.min(items.length, (symbolPage + 1) * 20);
  return items.slice(0, end);
};
