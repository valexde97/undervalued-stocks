// src/pages/Home.tsx
import { useEffect, useMemo } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import StockList from "../components/StockList";
import { bootstrapFromFinviz, fetchFinvizPageWithPrefetch, nextSymbolsPage } from "../store/stocksSlice";
import type { Stock } from "../types/stock";
import { useMarketStatus } from "../hooks/useMarketStatus";

import CryptoMarquee from "../components/CryptoMarquee";
import NewsMini from "../components/NewsMini";
import TopGainers from "../components/TopGainers";
import MarketStatusBanner from "../components/MarketStatusBanner";

import styles from "./home.module.css";

export const Home = () => {
  const dispatch = useAppDispatch();
  const { items, status, hasMore, symbolPage } = useAppSelector((s) => s.stocks);
  const market = useMarketStatus();
  const marketClosed = market.reason != null && !market.isOpen;

  useEffect(() => {
    dispatch(bootstrapFromFinviz({ quotesConcurrency: 2 }));
  }, [dispatch]);

  const visibleCount = (symbolPage + 1) * 20;
  const visibleStocks = useMemo<Stock[]>(() => items.slice(0, visibleCount), [items, visibleCount]);

  const canShowMore = hasMore || visibleCount < items.length;

  const onLoadMore = async () => {
    const nextPage = symbolPage + 1;
    try {
      const { stocks } = await dispatch(
        fetchFinvizPageWithPrefetch({ page: nextPage, quotesConcurrency: 2 })
      ).unwrap();

      if (stocks.length > 0) {
        dispatch(nextSymbolsPage());
      } else {
        // пустая страница — считаем, что результатов больше нет
        // (ничего не делаем; кнопка останется, если hasMore от сервера true)
      }
    } catch (e) {
      // не гасим кнопку; можно попробовать ещё раз
      // eslint-disable-next-line no-console
      console.warn("Load next 20 failed:", e);
    }
  };

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <CryptoMarquee />
        </div>

        <header className={styles.hero}>
          <MarketStatusBanner />
          {marketClosed && (
            <div className={styles.marketBadge} aria-live="polite">
              US market: {market.reason}
            </div>
          )}
        </header>

        <section className={styles.headerGrid}>
          <div className={styles.newsCol}>
            <NewsMini />
          </div>
          <aside className={styles.sideCol}>
            <TopGainers layout="vertical" />
          </aside>
        </section>

        {status === "loading" && items.length === 0 && (
          <div className={styles.skeletonWrap}>
            <Skeleton count={6} height={140} style={{ marginBottom: 12 }} />
          </div>
        )}

        {status === "failed" && (
          <div className={styles.error}>
            Fetch failed.{" "}
            <button onClick={() => dispatch(bootstrapFromFinviz({ quotesConcurrency: 2 }))}>Retry</button>
          </div>
        )}

        <main className={styles.listArea}>
          <StockList stocks={visibleStocks} />
          {canShowMore && (
            <div className={styles.moreRow}>
              <button className={styles.moreBtn} onClick={onLoadMore}>
                Load next 20
              </button>
            </div>
          )}
        </main>
      </div>
    </motion.div>
  );
};
