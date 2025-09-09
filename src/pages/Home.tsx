// src/pages/Home.tsx
import { useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { goToPage, hydratePageProgressively } from "../store/stocksSlice";
import type { Stock } from "../types/stock";

import CryptoMarquee from "../components/CryptoMarquee";
import NewsMini from "../components/NewsMini";
import TopGainers from "../components/TopGainers";
import MarketClosedCard from "../components/MarketClosedCard";
import { getMarketSession } from "../utils/marketSession";
import StockCard from "../components/StockCard";

import styles from "./home.module.css";

export const Home = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams<{ page?: string }>();

  const page1 = Math.max(1, Number(params.page ?? "1") || 1);
  const { items, status, hasMore, pageEpoch } = useAppSelector((s) => s.stocks);

  // --- Якорь начала карточек ---
  const cardsTopRef = useRef<HTMLDivElement | null>(null);
  const prevPageRef = useRef<number | null>(null);

  // Загружаем данные для конкретной страницы из URL
  useEffect(() => {
    void dispatch(goToPage({ page1 }));
  }, [dispatch, page1]);

  useEffect(() => {
    const prev = prevPageRef.current;
    const isPageChanged = prev !== null && prev !== page1;
    if (status === "succeeded" && (isPageChanged || prev !== null)) {
      cardsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (status === "succeeded") prevPageRef.current = page1;
  }, [page1, status]);

  useEffect(() => {
    if (status === "succeeded" && items.length > 0) {
      // thunk сам прервётся, если pageEpoch изменится (страница переключится)
      void dispatch(hydratePageProgressively());
    }
  }, [dispatch, status, pageEpoch, items.length]);

  useEffect(() => {
  (async () => {
    await dispatch(goToPage({ page1 }));
    dispatch(hydratePageProgressively());
  })();
}, [dispatch, page1]);


  const visibleStocks = useMemo<Stock[]>(() => items, [items]);
  const mkt = getMarketSession();

  const onPrev = () => {
    if (page1 > 1) navigate(`/${page1 - 1}`);
  };
  const onNext = () => {
    if (hasMore) navigate(`/${page1 + 1}`);
  };

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <CryptoMarquee />
        </div>

        {/* hero removed – right column used for market module */}
        <header className={styles.hero} />

        <section className={styles.headerGrid}>
          <div className={styles.newsCol}>
            <NewsMini />
          </div>

          <aside className={styles.sideCol}>
            {mkt.isOpen ? <TopGainers /> : <MarketClosedCard />}
          </aside>
        </section>

        {status === "loading" && items.length === 0 && (
          <div className={styles.skeletonWrap}>
            {/* 6 скелетонов, визуально близко к карточкам */}
            <div className={styles.cardsGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <Skeleton height={140} style={{ marginBottom: 12 }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className={styles.error}>
            Fetch failed. <button onClick={() => dispatch(goToPage({ page1 }))}>Retry</button>
          </div>
        )}

        <main className={styles.listArea}>
          {/* --- Якорь начала карточек (учитывает фиксированный Header) --- */}
          <div ref={cardsTopRef} style={{ scrollMarginTop: 80 }} />

          {/* Сетка карточек: 1 / 2 / 3 колонки */}
          <div className={styles.cardsGrid}>
            {visibleStocks.map((s) => (
              <StockCard key={s.ticker} stock={s} />
            ))}
          </div>

          <div className={styles.moreRow}>
            {page1 > 1 && (
              <button className={styles.moreBtn} onClick={onPrev} disabled={status === "loading"}>
                Prev 20
              </button>
            )}
            <div className={styles.pageLabel}>Page {page1}</div>
            <button className={styles.moreBtn} onClick={onNext} disabled={!hasMore || status === "loading"}>
              {status === "loading" ? "Loading…" : "Next 20"}
            </button>
          </div>
        </main>
      </div>
    </motion.div>
  );
};

export default Home;
