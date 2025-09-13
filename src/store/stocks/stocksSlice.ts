import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../../types/stock";
import { loadFinviz } from "../../api/loadBatch";
import { fetchJSON } from "../../utils/http";

/* =========================
   Types
========================= */
type SnapshotItem = {
  ticker: string;
  name?: string | null;
  industry?: string | null;
  country?: string | null;
  marketCapM?: number | null;
  logo?: string | null;

  price?: number | null;
  changePct?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
};
type SnapshotResponse = { items: SnapshotItem[]; serverTs?: number; backoffUntil?: number };

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

  // == Новый раздел: кэш Finviz-страниц и метаданных для быстрого перехода и префетча ==
  pagesCache: Record<number, Stock[]>;
  pageHasMore: Record<number, boolean | undefined>;
  prefetching: boolean;

  // FMP profiles — оставляем поля, но отключено
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

  pagesCache: {},
  pageHasMore: {},
  prefetching: false,

  fmpProfiles: {},
  fmpQueue: [],
  fmpBusy: false,
};

/* =========================
   Helpers & Actions
========================= */
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

// кладём семя из карточки при клике на View Details
export const seedDetails = createAction<{ ticker: string; price: number | null; category: Stock["category"] | null }>(
  "stocks/seedDetails"
);

// внутр. экшн: сохранить страницу в кэш
const cachePage = createAction<{ page: number; stocks: Stock[]; hasMore?: boolean }>("stocks/cachePage");

function capMillions(v?: number | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(v, 5_000_000);
}
function prettyCategoryByCap(capM?: number | null): Stock["category"] | undefined {
  if (typeof capM !== "number") return undefined;
  // (млн USD) — small / mid / large
  if (capM >= 10_000) return "large";
  if (capM >= 2_000) return "mid";
  return "small";
}

function saneText(v?: string | null, ticker?: string | null) {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-" || t === "—") return null;
  if (ticker && t.toUpperCase() === ticker.toUpperCase()) return null;
  if (/^[0-9]+$/.test(t)) return null;
  return t;
}
function looksLikeNoise(s?: string | null) {
  const x = (s || "").trim().toLowerCase();
  if (!x) return false;
  return [
    "export","overview","valuation","financial","ownership","performance","technical",
    "order by","any","index","signal","dividend yield","average volume","target price","ipo date","filters:",
  ].some((w) => x.includes(w));
}
function cleanField(v?: string | null, ticker?: string | null) {
  if (looksLikeNoise(v)) return null;
  return saneText(v, ticker);
}

function mapFinvizItemsToStocks(rows: any[]): Stock[] {
  const out: Stock[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row?.ticker) continue;
    if (seen.has(row.ticker)) continue;

    const ticker: string = row.ticker;
    const name = cleanField(row.company, ticker) ?? ticker;

    out.push({
      ticker,
      name,
      category: "small", // обновится после гидрации
      price: null,
      changePct: null,

      pe: null,
      ps: null,
      pb: null,
      currentRatio: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: null,

      marketCap: null,
      marketCapText: null,

      sector: null,
      industry: null,
      country: null,

      beta: null,
      dividendYield: null,

      peSnapshot: null,
      psSnapshot: null,
      pbSnapshot: null,

      listedAt: undefined,
      potentialScore: null,
      reasons: [],
    });

    seen.add(ticker);
  }
  return out;
}

/* =========================
   Thunks: Finviz / Prefetch
========================= */

// Загрузка ТОЛЬКО одной страницы (без записи в items), отдаём наверх для дальнейшего решения
export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

/**
 * Перейти на страницу (1-based), с учётом локального кэша страниц.
 * Кэш не мешает свежей подгрузке — если страницы нет в кэше, дёргаем сеть.
 */
export const goToPage = createAsyncThunk<
  { items: Stock[]; nextCache: Stock | Stock[] | null; page: number; hasMore: boolean },
  { page1: number },
  { state: { stocks: StocksState } }
>("stocks/goToPage", async ({ page1 }, { dispatch, getState }) => {
  const page0 = Math.max(0, (page1 | 0) - 1);
  const state0 = getState().stocks;

  // 1) Текущая страница: берем из кэша или грузим
  let items: Stock[] | null = state0.pagesCache[page0] ?? null;
  let hasMore0: boolean | undefined = state0.pageHasMore[page0];

  if (!items) {
    const { stocks, hasMoreMeta } = await (dispatch as any)(fetchFinvizPage({ page: page0 })).unwrap();
    items = stocks;
    hasMore0 = hasMoreMeta;
    // положим в кэш
    (dispatch as any)(cachePage({ page: page0, stocks, hasMore: hasMoreMeta }));
  }

  // 2) Следующая страница как nextCache (для мгновенного перехода)
  let nextCache: Stock[] | null = getState().stocks.pagesCache[page0 + 1] ?? null;
  if (!nextCache && hasMore0) {
    try {
      const { stocks: s1, hasMoreMeta: more1 } = await (dispatch as any)(fetchFinvizPage({ page: page0 + 1 })).unwrap();
      nextCache = s1;
      (dispatch as any)(cachePage({ page: page0 + 1, stocks: s1, hasMore: more1 }));
    } catch {
      nextCache = null;
    }
  }

  const hasMore = Boolean(hasMore0 ?? (nextCache && nextCache.length > 0));

  return { items: items!, nextCache, page: page0, hasMore };
});

/**
 * Прогрессивная гидрация текущей страницы (снэпшоты/котировки) батчами по 4 тикера.
 * Уважает pageEpoch, 429/backoff и не ломает UI.
 */
export const hydratePageProgressively = createAsyncThunk<void, void, { state: { stocks: StocksState } }>(
  "stocks/hydratePageProgressively",
  async (_: void, { getState, dispatch }) => {
    const startEpoch = getState().stocks.pageEpoch;
    const allTickers = getState().stocks.items.map(s => s.ticker);
    if (!allTickers.length) {
      // Стартуем фоновый префетч страниц даже если список пуст (страница могла не успеть проставиться)
      void (dispatch as any)(prefetchFinvizToTarget({ target: 200 }));
      return;
    }

    const MAX_PASSES = 3;
    const CHUNK = 4;

    const isFilled = (it: SnapshotItem) =>
      (typeof it.price === "number" && Number.isFinite(it.price) && it.price > 0) ||
      (typeof it.marketCapM === "number" && Number.isFinite(it.marketCapM) && it.marketCapM > 0);

    const remaining = new Set(allTickers);

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      if (getState().stocks.pageEpoch !== startEpoch) return;

      const arr = Array.from(remaining);
      if (!arr.length) break;

      for (let i = 0; i < arr.length; i += CHUNK) {
        if (getState().stocks.pageEpoch !== startEpoch) return;

        const slice = arr.slice(i, i + CHUNK);
        const qs = encodeURIComponent(slice.join(","));
        let resp: SnapshotResponse | null = null;

        try {
          resp = await fetchJSON<SnapshotResponse>(`/api/fh/snapshot-batch?symbols=${qs}`, {
            noStore: true, timeoutMs: 22000,
          });
        } catch { /* next pass */ }

        if (!resp?.items?.length) continue;

        if (resp.backoffUntil && resp.backoffUntil > Date.now()) {
          const waitMs = Math.min(resp.backoffUntil - Date.now(), 3500);
          await new Promise(r => setTimeout(r, waitMs));
        }

        for (const it of resp.items) {
          const capM = capMillions(it.marketCapM ?? null);
          const category = prettyCategoryByCap(capM);

          const patch: any = {
            ticker: it.ticker,
            price: it.price ?? null,
            changePct: it.changePct ?? null,
            ...(it.open != null ? { open: it.open } : {}),
            ...(it.high != null ? { high: it.high } : {}),
            ...(it.low  != null ? { low:  it.low  } : {}),
            ...(it.prevClose != null ? { prevClose: it.prevClose } : {}),
            ...(typeof it.name === "string" && it.name.trim() ? { name: it.name.trim() } : {}),
            ...(typeof it.industry === "string" ? { industry: it.industry } : {}),
            ...(typeof it.country  === "string" ? { country:  it.country  } : {}),
            ...(typeof capM === "number" ? { marketCap: capM } : {}),
          };
          if (category) patch.category = category;
          if ((it as any).logo) patch.logo = (it as any).logo;

          dispatch(mergeStockPatch(patch));

          if (isFilled(it)) remaining.delete(it.ticker);
        }

        await new Promise(r => setTimeout(r, 120));
      }

      if (remaining.size && pass + 1 < MAX_PASSES) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // 🚀 Параллельно — фоновой префетч страниц до 200 карточек
    void (dispatch as any)(prefetchFinvizToTarget({ target: 200 }));
  }
);

// Фоновая догрузка Finviz-страниц: p+1, p+2, ... пока суммарно не будет >= target карточек или не кончится hasMore
export const prefetchFinvizToTarget = createAsyncThunk<
  void,
  { target?: number } | undefined,
  { state: { stocks: StocksState } }
>("stocks/prefetchFinvizToTarget", async (arg, { getState, dispatch }) => {
  const target = Math.max(20, Math.min(1000, arg?.target ?? 200));
  const startEpoch = getState().stocks.pageEpoch;

  const countPrefetched = () => {
    const st = getState().stocks;
    const own = st.items.length;
    const cachedPagesTotal = Object.values(st.pagesCache).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
    const next = st.nextCache?.length ?? 0;
    return own + cachedPagesTotal + next;
  };

  // быстрый выход
  if (countPrefetched() >= target) return;

  let page = getState().stocks.currentPage + 1;

  // прогоняем страницы последовательно; да, последовательно — чтобы не душить прокси/сервер
  // мягкая пауза между запросами
  while (getState().stocks.pageEpoch === startEpoch) {
    // цель достигнута?
    if (countPrefetched() >= target) break;

    // уже есть в кэше?
    if (getState().stocks.pagesCache[page]) {
      page += 1;
      continue;
    }

    try {
      const { items, meta } = await loadFinviz(page);
      const stocks = mapFinvizItemsToStocks(items);
      (dispatch as any)(cachePage({ page, stocks, hasMore: !!meta?.hasMore }));

      // если страница пустая или больше нет hasMore — выходим
      if (!stocks.length || !meta?.hasMore) break;
    } catch {
      // на ошибке прерываем цикл, чтобы не спамить
      break;
    }

    page += 1;
    await new Promise(r => setTimeout(r, 120));
  }
});

/* =========================
   Thunks: Детали тикера (приоритет)
========================= */
export const prioritizeDetailsTicker = createAsyncThunk<void, { ticker: string }>(
  "stocks/prioritizeDetailsTicker",
  async ({ ticker }, { dispatch }) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;

    const resp = await fetchJSON<SnapshotResponse>(
      `/api/fh/snapshot-batch?symbols=${encodeURIComponent(t)}`,
      { noStore: true, timeoutMs: 20000 }
    );
    const it = resp.items?.[0];
    if (!it) return;

    const capM = capMillions(it.marketCapM ?? null);
    const category = prettyCategoryByCap(capM);

    const patch: any = {
      ticker: it.ticker,
      price: it.price ?? null,
      changePct: it.changePct ?? null,
      ...(it.open != null ? { open: it.open } : {}),
      ...(it.high != null ? { high: it.high } : {}),
      ...(it.low  != null ? { low:  it.low  } : {}),
      ...(it.prevClose != null ? { prevClose: it.prevClose } : {}),
      ...(typeof it.name === "string" && it.name.trim() ? { name: it.name.trim() } : {}),
      ...(typeof it.industry === "string" ? { industry: it.industry } : {}),
      ...(typeof it.country  === "string" ? { country:  it.country  } : {}),
      ...(typeof capM === "number" ? { marketCap: capM } : {}),
    };
    if (category) patch.category = category;
    if ((it as any).logo) patch.logo = (it as any).logo;

    dispatch(mergeStockPatch(patch));

    // FMP отключён
    await (dispatch as any)(queueFmpProfilesForTickers({ tickers: [t] }));
  }
);

/* =========================
   Thunks: FMP Profiles — заглушка
========================= */
export const queueFmpProfilesForTickers = createAsyncThunk<void, { tickers: string[] }>(
  "stocks/queueFmpProfilesForTickers",
  async () => {
    // no-op: FMP отключён
    return;
  }
);

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

      // сброс кэша страниц/мета
      state.pagesCache = {};
      state.pageHasMore = {};
      state.prefetching = false;

      // FMP disabled: просто очищаем поля
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
        state.nextCache = Array.isArray(action.payload.nextCache) ? action.payload.nextCache : null;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
        state.pageEpoch += 1; // новая страница → новая эпоха

        // Обновим кэш: текущую и следующую страницы положим (на случай быстрого возврата)
        state.pagesCache[state.currentPage] = action.payload.items;
        if (state.nextCache) {
          state.pagesCache[state.currentPage + 1] = state.nextCache;
        }
      })
      .addCase(goToPage.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message || "Unknown error";
      })
      .addCase(mergeStockPatch, (state, action: PayloadAction<any>) => {
        interface MergeStockPatchPayload extends Partial<Stock> {
          ticker: string;
        }

        const i: number = state.items.findIndex((s: Stock) => s.ticker === (action.payload as MergeStockPatchPayload).ticker);
        if (i !== -1) state.items[i] = { ...(state.items[i] as any), ...action.payload } as Stock;
      })
      .addCase(seedDetails, (state, action) => {
        const { ticker, price, category } = action.payload;
        state.detailsSeeds[ticker.toUpperCase()] = {
          price,
          category: (category ?? null) as Stock["category"] | null,
          ts: Date.now(),
        };
      })
      .addCase(cachePage, (state, action) => {
        const { page, stocks, hasMore } = action.payload;
        state.pagesCache[page] = stocks;
        if (typeof hasMore !== "undefined") state.pageHasMore[page] = hasMore;
      })
      .addCase(prefetchFinvizToTarget.pending, (state) => {
        state.prefetching = true;
      })
      .addCase(prefetchFinvizToTarget.fulfilled, (state) => {
        state.prefetching = false;
      })
      .addCase(prefetchFinvizToTarget.rejected, (state) => {
        state.prefetching = false;
      });
  },
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

/* =========================
   Selectors
========================= */
import type { RootState } from "../index";

export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;

export const selectSeedByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.detailsSeeds[ticker.toUpperCase()] || null;

// FMP selectors сохраняем как заглушки для совместимости
export const selectFmpProfileByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.fmpProfiles[ticker.toUpperCase()]?.profile ?? null;

export const selectFmpProfileStatus = (ticker: string) => (state: RootState) => {
  const t = ticker.toUpperCase();
  const inQueue = state.stocks.fmpQueue.includes(t);
  const cached = !!state.stocks.fmpProfiles[t];
  return { inQueue, cached, busy: state.stocks.fmpBusy };
};
