// src/pages/Home.tsx
import { useEffect, useRef, useState } from "react";
import type { FormikProps } from "formik";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { NewsMini } from "../components/NewsMini";
import { MarketStrip } from "../components/MarketStrip";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { StockList } from "../components/StockList";
import { FilterPanel } from "../components/FilterPanel";
import { bootstrapFromFinviz } from "../store/stocksSlice";
import type { Stock } from "../types/stock";
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

  const [filtered, setFiltered] = useState<Stock[]>([]);
  const [visible, setVisible] = useState(20);

  useEffect(() => {
    dispatch(bootstrapFromFinviz({ pages: 12 }));
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

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.shell}>
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
               <MarketStrip />
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
              Fetch failed. <button onClick={() => dispatch(bootstrapFromFinviz())}>Retry</button>
            </div>
          )}

          <main>
            <StockList stocks={filtered.slice(0, visible)} />
            {canShowMore && (
              <div className={styles.moreRow}>
                <button
                  className={styles.moreBtn}
                  onClick={() => setVisible((v) => Math.min(v + 20, filtered.length))}
                >
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
