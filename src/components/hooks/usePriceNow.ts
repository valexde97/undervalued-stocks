// src/hooks/usePriceNow.ts
import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../../store";
import { selectSeedByTicker } from "../../store/stocksSlice";
import { fetchJSON } from "../../utils/http";

type SnapItem = { price?: number | null; prevClose?: number | null; open?: number | null; high?: number | null; low?: number | null; };
type SnapResp = { items?: SnapItem[] };

export function usePriceNow(symbol: string, priceSeed?: number | null) {
  const upper = (symbol || "").toUpperCase();
  const stock = useAppSelector((s) => s.stocks.items.find((it) => it.ticker === upper));
  const seed = useAppSelector(selectSeedByTicker(upper));

  const [fallbackPrice, setFallbackPrice] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);

  const priceNow = useMemo(() => {
    const candidates = [
      fallbackPrice,
      priceSeed,
      seed?.price,
      stock?.price,
      (stock as any)?.prevClose,
      (stock as any)?.open,
      (stock as any)?.high,
      (stock as any)?.low,
    ];
    for (const x of candidates) {
      if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
    }
    return null;
  }, [fallbackPrice, priceSeed, seed?.price, stock?.price, (stock as any)?.prevClose, (stock as any)?.open, (stock as any)?.high, (stock as any)?.low]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (priceNow != null || fetching || !upper) return;
      try {
        setFetching(true);
        const r = await fetchJSON<SnapResp>(`/api/fh/snapshot-batch?symbols=${encodeURIComponent(upper)}`, { noStore: true, timeoutMs: 12000 });
        const it = r?.items?.[0] || {};
        const cand = [it.price, it.prevClose, it.open, it.high, it.low].find((v) => typeof v === "number" && Number.isFinite(v) && (v as number) > 0) as number | undefined;
        if (!ignore && typeof cand === "number") setFallbackPrice(cand);
      } catch {
        // молча
      } finally {
        if (!ignore) setFetching(false);
      }
    })();
    return () => { ignore = true; };
  }, [priceNow, fetching, upper]);

  return { priceNow, fetchingPrice: fetching, stock, seed };
}
