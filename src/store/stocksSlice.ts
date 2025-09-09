import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch";
import { fetchJSON } from "../utils/http";

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

type FmpProfileItem = {
  symbol?: string;
  companyName?: string;
  description?: string;
  industry?: string;
  sector?: string;
  country?: string;
  city?: string;
  website?: string;
  fullTimeEmployees?: number;
  exchangeShortName?: string;
  currency?: string;
  mktCap?: number;
  ipoDate?: string;
  image?: string;
};
type FmpProfileApiResp = { symbol: string; serverTs: number; profile: FmpProfileItem | null };

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

  // Бесплатные FMP-профили (Company Profile): кэш и очередь
  fmpProfiles: Record<
    string,
    { profile: FmpProfileItem | null; error?: string | null; ts: number }
  >;
  fmpQueue: string[];      // тикеры, ожидающие загрузки профиля
  fmpBusy: boolean;        // идёт ли сейчас фоновая загрузка очереди
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
   Helpers & Actions
========================= */
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

// кладём семя из карточки при клике на View Details
export const seedDetails = createAction<{ ticker: string; price: number | null; category: Stock["category"] | null }>(
  "stocks/seedDetails"
);

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
   Thunks: Finviz / Finnhub
========================= */
export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
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
    if (!allTickers.length) return;

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
  }
);

export const goToPage = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  { page1: number }
>("stocks/goToPage", async ({ page1 }, { dispatch }) => {
  const page0 = Math.max(0, (page1 | 0) - 1);

  const { page: p0, stocks: s0, hasMoreMeta: more0 } =
    await (dispatch as any)(fetchFinvizPage({ page: page0 })).unwrap();

  // префетч сырой следующей
  let nextCache: Stock[] | null = null;
  let hasMore = !!more0;
  if (more0) {
    try {
      const { stocks: s1, hasMoreMeta: more1 } =
        await (dispatch as any)(fetchFinvizPage({ page: p0 + 1 })).unwrap();
      nextCache = s1;
      hasMore = more1 || s1.length > 0;
    } catch { /* ignore */ }
  }

  // Стартуем фоновую очередную загрузку бесплатных FMP-профилей для текущей страницы
  try {
    const tickers = s0.map(s => s.ticker);
    await (dispatch as any)(queueFmpProfilesForTickers({ tickers }));
  } catch { /* ignore */ }

  return { items: s0, nextCache, page: p0, hasMore };
});

/**
 * Детали: приоритетный снэпшот одного тикера (карточка → View Details).
 */
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

    // Заодно поставим в очередь FMP-профиль конкретного тикера (если ещё не загружен)
    await (dispatch as any)(queueFmpProfilesForTickers({ tickers: [t] }));
  }
);

/* =========================
   Thunks: FMP Profiles (free)
   — очередь «один за другим»
========================= */

// Настраиваемая пауза между запросами к FMP
const FMP_DELAY_MS = Number((import.meta as any)?.env?.VITE_FMP_PROFILE_RPS_DELAY_MS ?? 300) || 300;

// Внутренние actions для очереди
const addToFmpQueue = createAction<{ tickers: string[] }>("stocks/addToFmpQueue");
const shiftFmpQueue = createAction<void>("stocks/shiftFmpQueue");
const setFmpBusy = createAction<{ busy: boolean }>("stocks/setFmpBusy");
const storeFmpProfile = createAction<{ ticker: string; profile: FmpProfileItem | null; error?: string | null }>(
  "stocks/storeFmpProfile"
);

/**
 * Положить тикеры в очередь загрузки FMP-профилей и запустить обработчик.
 * Пропускаем то, что уже в кэше/очереди.
 */
export const queueFmpProfilesForTickers = createAsyncThunk<void, { tickers: string[] }, { state: { stocks: StocksState } }>(
  "stocks/queueFmpProfilesForTickers",
  async ({ tickers }, { getState, dispatch }) => {
    const st = getState().stocks;
    const normalized = tickers
      .map(t => t.toUpperCase().trim())
      .filter(Boolean)
      .filter(t => !(t in st.fmpProfiles) && !st.fmpQueue.includes(t));

    if (normalized.length) {
      dispatch(addToFmpQueue({ tickers: normalized }));
    }

    // Если обработчик не занят — запускаем
    if (!getState().stocks.fmpBusy) {
      await (dispatch as any)(processFmpQueue());
    }
  }
);

/**
 * Обработчик очереди: тянем /api/fmp/profile?symbol=... по одному, с паузой.
 * Уважает остановку (busy=false) и моментально завершится, если очередь опустела.
 */
export const processFmpQueue = createAsyncThunk<void, void, { state: { stocks: StocksState } }>(
  "stocks/processFmpQueue",
  async (_: void, { getState, dispatch }) => {
    // Если уже идёт обработка — выходим
    if (getState().stocks.fmpBusy) return;

    dispatch(setFmpBusy({ busy: true }));
    try {
      // Бежим, пока в очереди есть тикеры
      while (true) {
        const st = getState().stocks;
        const nextTicker = st.fmpQueue[0];
        if (!nextTicker) break;

        try {
          const resp = await fetchJSON<FmpProfileApiResp>(`/api/fmp/profile?symbol=${encodeURIComponent(nextTicker)}`, {
            noStore: true,
            timeoutMs: 15000,
          });
          const profile = resp?.profile ?? null;
          dispatch(storeFmpProfile({ ticker: nextTicker, profile, error: null }));
        } catch (e: any) {
          dispatch(storeFmpProfile({ ticker: nextTicker, profile: null, error: String(e?.message || e) }));
        } finally {
          dispatch(shiftFmpQueue());
        }

        // Пауза между запросами — чтобы не «прибить» приложение и уважить лимиты
        if (FMP_DELAY_MS > 0) {
          await new Promise(r => setTimeout(r, FMP_DELAY_MS));
        }
      }
    } finally {
      dispatch(setFmpBusy({ busy: false }));
    }
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
      })

      // Очередь FMP: add / shift / busy / store
      .addCase(addToFmpQueue, (state, action) => {
        const toAdd: string[] = [];
        for (const t of action.payload.tickers) {
          const up = t.toUpperCase();
          if (state.fmpProfiles[up]) continue;           // уже закэширован
          if (state.fmpQueue.includes(up)) continue;     // уже в очереди
          toAdd.push(up);
        }
        if (toAdd.length) state.fmpQueue.push(...toAdd);
      })
      .addCase(shiftFmpQueue, (state) => {
        state.fmpQueue.shift();
      })
      .addCase(setFmpBusy, (state, action) => {
        state.fmpBusy = !!action.payload.busy;
      })
      .addCase(storeFmpProfile, (state, action) => {
        const { ticker, profile, error } = action.payload;
        state.fmpProfiles[ticker.toUpperCase()] = { profile, error: error ?? null, ts: Date.now() };

        // Бонус: если из профиля пришли базовые поля — можем мягко дополнить карточку
        const idx = state.items.findIndex(s => s.ticker === ticker.toUpperCase());
        if (idx !== -1 && profile) {
          const patch: Partial<Stock> = {};
          if (profile.industry && !state.items[idx].industry) patch.industry = profile.industry;
          if (profile.country && !state.items[idx].country) patch.country = profile.country;
          if (profile.sector && !state.items[idx].sector) patch.sector = profile.sector as any;
          // market cap у FMP может быть в долларах; карточка хранит миллионы — не трогаем здесь.
          state.items[idx] = { ...state.items[idx], ...patch };
        }
      });
  },
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

/* =========================
   Selectors
========================= */
import type { RootState } from "./index";

export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;

export const selectSeedByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.detailsSeeds[ticker.toUpperCase()] || null;

export const selectFmpProfileByTicker = (ticker: string) => (state: RootState) =>
  state.stocks.fmpProfiles[ticker.toUpperCase()]?.profile ?? null;

export const selectFmpProfileStatus = (ticker: string) => (state: RootState) => {
  const t = ticker.toUpperCase();
  const inQueue = state.stocks.fmpQueue.includes(t);
  const cached = !!state.stocks.fmpProfiles[t];
  return { inQueue, cached, busy: state.stocks.fmpBusy };
};
