import { useEffect, useMemo, useRef, useState } from "react";
import type { FormikProps } from "formik";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
// import CryptoMarquee from "../components/CryptoMarquee";
import { NewsMini } from "../components/NewsMini";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import StockList from "../components/StockList";
import { FilterPanel } from "../components/FilterPanel";
import { bootstrapFromFinviz, fetchFinvizPage, fetchQuotesForTickers } from "../store/stocksSlice";
import type { Stock } from "../types/stock";
import { useMarketStatus } from "../hooks/useMarketStatus";
import styles from "./home.module.css";

type FilterValues = {
  minPrice: number | "";
  maxPrice: number | "";
  category: string;
  sortBy: string;
};

export const Home = () => {
  const formikRef = useRef<FormikProps<FilterValues>>(null);
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.stocks);
  const market = useMarketStatus();
  const marketClosed = market.reason != null && !market.isOpen;

  const [filtered, setFiltered] = useState<Stock[]>([]);
  const [visible, setVisible] = useState(20);
  const [pageLoaded, setPageLoaded] = useState(0);

  useEffect(() => {
    dispatch(bootstrapFromFinviz({ pages: 1 }));
  }, [dispatch]);

  useEffect(() => {
    setFiltered(items);
    setVisible(20);
  }, [items]);

  const handleFilter = (filters: FilterValues) => {
    let result = [...items];

    const min = filters.minPrice === "" ? null : Number(filters.minPrice);
    const max = filters.maxPrice === "" ? null : Number(filters.maxPrice);
    if (min !== null) result = result.filter((s) => s.price != null && s.price >= min);
    if (max !== null) result = result.filter((s) => s.price != null && s.price <= max);
    if (filters.category) result = result.filter((s) => s.category === filters.category);

    if (filters.sortBy === "priceAsc") {
      result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (filters.sortBy === "priceDesc") {
      result.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else if (filters.sortBy === "nameAsc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filters.sortBy === "nameDesc") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }

    setFiltered(result);
    setVisible(20);
  };

  const canShowMore = visible < filtered.length;

  const loadMore = async () => {
    const nextVisible = Math.min(visible + 20, filtered.length);

    if (nextVisible >= items.length - 5) {
      const nextPage = pageLoaded + 1;
      try {
        const payload = await dispatch(fetchFinvizPage({ page: nextPage })).unwrap();
        setPageLoaded(nextPage);
        const newTickers = payload.map((s) => s.ticker);
        if (newTickers.length) {
          await dispatch(fetchQuotesForTickers({ tickers: newTickers, concurrency: 2 }));
        }
      } catch {
        // ignore; button remains enabled for retry
      }
    }

    setVisible((v) => v + 20);
  };

  const visibleStocks = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="sr-only">Front-End React Testing App</h1>

      <div className={styles.shell}>
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              {/* <CryptoMarquee /> */}
              {marketClosed && (
                <div style={{ margin: "4px 0 10px", opacity: 0.85 }}>
                  <span
                    style={{
                      padding: "4px 8px",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      background: "rgba(255,255,255,.04)",
                      fontSize: 12
                    }}
                  >
                    US market: {market.reason}
                  </span>
                </div>
              )}
              <NewsMini />
            </div>

            <div className={styles.filterBox}>
              <div className={styles.filterCardSlim}>
                <FilterPanel onFilter={handleFilter} formikRef={formikRef} />
              </div>
            </div>
          </header>

          {status === "loading" && items.length === 0 && (
            <Skeleton count={6} height={140} style={{ marginBottom: 12 }} />
          )}

          {status === "failed" && (
            <div style={{ color: "#ff8080", marginBottom: 12 }}>
              Fetch failed. <button onClick={() => dispatch(bootstrapFromFinviz({ pages: 1 }))}>Retry</button>
            </div>
          )}

          <main>
            <StockList stocks={visibleStocks} marketClosed={marketClosed} />
            {canShowMore && (
              <div className={styles.moreRow}>
                <button className={styles.moreBtn} onClick={loadMore}>
                  Load next 20
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </motion.div>
  );
};
