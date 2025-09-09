import { createAction, createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Stock } from "../types/stock";
import { loadFinviz } from "../api/loadBatch";
import { fetchJSON } from "../utils/http";

// ---- types ----
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

// ---- state ----
export type StocksState = {
  items: Stock[];
  nextCache: Stock[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  currentPage: number; // 0-based
  hasMore: boolean;

  pageEpoch: number;   // увеличиваем на каждую смену страницы
};

const initialState: StocksState = {
  items: [],
  nextCache: null,
  status: "idle",
  currentPage: -1,
  hasMore: true,
  pageEpoch: 0,
};

// ---- helpers ----
export const mergeStockPatch = createAction<{ ticker: string } & Partial<Stock>>("stocks/mergeStockPatch");

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

// ---- finviz page ----
export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

// ---- прогрессивная гидрация с мульти-проходами ----
/**
 * Делаем до 3 проходов по текущей странице.
 * На каждом проходе: шлём батчи по 4 тикера → патчим карточки сразу по приходу.
 * Если сервер дал backoffUntil — ждём и продолжаем.
 * Прерываемся, если сменился pageEpoch.
 */
export const hydratePageProgressively = createAsyncThunk<void, void, { state: { stocks: StocksState } }>(
  "stocks/hydratePageProgressively",
  async (_: void, { getState, dispatch }) => {
    const startEpoch = getState().stocks.pageEpoch;
    const allTickers = getState().stocks.items.map(s => s.ticker);
    if (!allTickers.length) return;

    const MAX_PASSES = 3;
    const CHUNK = 4;

    // считаем заполненной карточку, если есть либо price, либо marketCap
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
        } catch { /* пропускаем этот батч, попробуем на следующем проходе */ }

        if (!resp?.items?.length) continue;

        // уважим backoff
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

        // небольшая рассинхронизация, чтобы не врезаться в лимиты
        await new Promise(r => setTimeout(r, 120));
      }

      // между проходами — короткая пауза
      if (remaining.size && pass + 1 < MAX_PASSES) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }
);

// ---- навигация ----
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

  return { items: s0, nextCache, page: p0, hasMore };
});

// ---- совместимость: details-страница просит этот thunk ----
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
  }
);

// ---- slice ----
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
      });
  },
});

export const { resetPager } = stocksSlice.actions;
export default stocksSlice.reducer;

// selectors
import type { RootState } from "./index";
export const selectStocksState = (state: RootState) => state.stocks;
export const selectVisibleStocks = (state: RootState) => state.stocks.items;
