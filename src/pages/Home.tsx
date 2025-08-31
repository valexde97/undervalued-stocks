// src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import StockList from "../components/StockList";
import { bootstrapFromFinviz, fetchFinvizPage, fetchQuotesForTickers } from "../store/stocksSlice";
import type { Stock } from "../types/stock";
import { useMarketStatus } from "../hooks/useMarketStatus";

import CryptoMarquee from "../components/CryptoMarquee";
import NewsMini from "../components/NewsMini";
import TopGainers from "../components/TopGainers";
import MarketStatusBanner from "../components/MarketStatusBanner";

import styles from "./home.module.css";

export const Home = () => {
  const dispatch = useAppDispatch();
  const { items, status, hasMore } = useAppSelector((s) => s.stocks);
  const market = useMarketStatus();
  const marketClosed = market.reason != null && !market.isOpen;

  const [visible, setVisible] = useState(20);
  const [pageLoaded, setPageLoaded] = useState(0);

  useEffect(() => {
    dispatch(bootstrapFromFinviz({ pages: 1 }));
  }, [dispatch]);

  useEffect(() => {
    setVisible(20);
  }, [items]);

  const canShowMore = visible < items.length || hasMore;

  const loadMore = async () => {
    setVisible((v) => Math.min(v + 20, items.length + 20));
    if (hasMore) {
      const nextPage = pageLoaded + 1;
      try {
        const payload = await dispatch(fetchFinvizPage({ page: nextPage })).unwrap();
        setPageLoaded(nextPage);
        const newTickers = payload.map((s) => s.ticker);
        if (newTickers.length) {
          await dispatch(fetchQuotesForTickers({ tickers: newTickers, concurrency: 2 }));
        }
      } catch {
        /* оставить кнопку активной для повторной попытки */
      }
    }
  };

  const visibleStocks = useMemo<Stock[]>(() => items.slice(0, visible), [items, visible]);

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.container}>
        {/* Crypto marquee */}
        <div className={styles.topBar}>
          <CryptoMarquee />
        </div>

        {/* Hero / market status */}
        <header className={styles.hero}>
          <MarketStatusBanner />
          {marketClosed && (
            <div className={styles.marketBadge} aria-live="polite">
              US market: {market.reason}
            </div>
          )}
        </header>

        {/* Header grid: news + gainers */}
        <section className={styles.headerGrid}>
          <div className={styles.newsCol}>
            <NewsMini />
          </div>
          <aside className={styles.sideCol}>
            <TopGainers layout="vertical" />
          </aside>
        </section>

        {/* List */}
        {status === "loading" && items.length === 0 && (
          <div className={styles.skeletonWrap}>
            <Skeleton count={6} height={140} style={{ marginBottom: 12 }} />
          </div>
        )}

        {status === "failed" && (
          <div className={styles.error}>
            Fetch failed. <button onClick={() => dispatch(bootstrapFromFinviz({ pages: 1 }))}>Retry</button>
          </div>
        )}

        <main className={styles.listArea}>
          <StockList stocks={visibleStocks} />
          {canShowMore && (
            <div className={styles.moreRow}>
              <button className={styles.moreBtn} onClick={loadMore}>
                Load next 20
              </button>
            </div>
          )}
        </main>
      </div>
    </motion.div>
  );
};
