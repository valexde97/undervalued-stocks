import { createAsyncThunk } from "@reduxjs/toolkit";
import type { Stock } from "../../types/stock";
import { loadFinviz } from "../../api/loadBatch";
import { fetchJSON } from "../../utils/http";

import {
  mapFinvizItemsToStocks,
  capMillions,
  prettyCategoryByCap,
  mergeStockPatch,
  type SnapshotItem,
  type SnapshotResponse,
} from "./actions";

/* =========================
   Finviz: страница
========================= */
export const fetchFinvizPage = createAsyncThunk<
  { page: number; stocks: Stock[]; hasMoreMeta: boolean },
  { page: number }
>("stocks/fetchFinvizPage", async ({ page }) => {
  const { items, meta } = await loadFinviz(page);
  const stocks = mapFinvizItemsToStocks(items);
  return { page, stocks, hasMoreMeta: !!meta?.hasMore };
});

/* =========================
   Прогрессивная гидратация
========================= */
export const hydratePageProgressively = createAsyncThunk<void, void, { state: { stocks: { pageEpoch: number; items: Stock[] } } }>(
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
      // отменяемся при смене эпохи страницы
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

/* =========================
   Переключение страниц + префетч
========================= */
export const goToPage = createAsyncThunk<
  { items: Stock[]; nextCache: Stock[] | null; page: number; hasMore: boolean },
  { page1: number }
>("stocks/goToPage", async ({ page1 }, { dispatch }) => {
  const page0 = Math.max(0, (page1 | 0) - 1);

  const { page: p0, stocks: s0, hasMoreMeta: more0 } =
    await (dispatch as any)(fetchFinvizPage({ page: page0 })).unwrap();

  // префетч следующей страницы
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

/* =========================
   FMP profiles — заглушка
========================= */
export const queueFmpProfilesForTickers = createAsyncThunk<void, { tickers: string[] }>(
  "stocks/queueFmpProfilesForTickers",
  async () => {
    // no-op
    return;
  }
);

/* =========================
   Приоритезация снэпшота 1 тикера
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
    await (dispatch as any)(queueFmpProfilesForTickers({ tickers: [t] })); // no-op
  }
);

