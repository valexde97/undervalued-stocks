import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store";
import { goToPage, hydratePageProgressively } from "../store/stocksSlice";
import type { Stock } from "../types/stock";

import { selectSearch, setQuery, clearResult, searchByTickerOrName } from "../store/searchSlice";

import CryptoMarquee from "../components/CryptoMarquee";
import NewsMini from "../components/NewsMini";
import TopGainers from "../components/TopGainers";
import MarketClosedCard from "../components/MarketClosedCard";
import { getMarketSession } from "../utils/marketSession";
import StockCard from "../components/StockCard";

import styles from "./home.module.css";

export const Home = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams<{ page?: string }>();

  const page1 = Math.max(1, Number(params.page ?? "1") || 1);
  const { items, status, hasMore, pageEpoch } = useAppSelector((s) => s.stocks);

  // === SEARCH state ===
  const search = useAppSelector(selectSearch);
  const [localQuery, setLocalQuery] = useState(search.query || "");

  // якорь начала карточек
  const cardsTopRef = useRef<HTMLDivElement | null>(null);
  const prevPageRef = useRef<number | null>(null);
  const hydratedEpochRef = useRef<number | null>(null);

  // грузим страницу по URL
  useEffect(() => {
    void dispatch(goToPage({ page1 }));
  }, [dispatch, page1]);

  // плавный скролл к началу по успешной загрузке
  useEffect(() => {
    const prev = prevPageRef.current;
    const isPageChanged = prev !== null && prev !== page1;
    if (status === "succeeded" && (isPageChanged || prev !== null)) {
      cardsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (status === "succeeded") prevPageRef.current = page1;
  }, [page1, status]);

  // Авто-гидратация при смене pageEpoch (только один раз на эпоху)
  useEffect(() => {
    if (status !== "succeeded") return;
    if (hydratedEpochRef.current === pageEpoch) return;
    hydratedEpochRef.current = pageEpoch;
    void dispatch(hydratePageProgressively());
  }, [status, pageEpoch, dispatch]);

  const visibleStocks = useMemo<Stock[]>(() => items, [items]);
  const mkt = getMarketSession();

  const onPrev = () => { if (page1 > 1) navigate(`/${page1 - 1}`); };
  const onNext = () => { if (hasMore) navigate(`/${page1 + 1}`); };

  // === SEARCH handlers ===
  const onSubmitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = localQuery.trim();
    if (!q) {
      dispatch(clearResult());
      return;
    }
    dispatch(setQuery(q));
    void dispatch(searchByTickerOrName({ query: q }));
  };

  const onClearSearch = () => {
    setLocalQuery("");
    dispatch(clearResult());
  };

  return (
    <motion.div className={styles.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.container}>
        {/* --- Intro / Hero (можно удалить при желании) --- */}
        <section className={styles.intro ?? ""} style={{ margin: "16px 0" }}>
          <h1 style={{ margin: 0 }}>{t("main.title")}</h1>
          <p style={{ opacity: 0.9 }}>{t("main.subtitle")}</p>

          <p style={{ marginTop: 8 }}>{t("homeHero.description")}</p>

          <h3 style={{ marginTop: 12 }}>{t("homeHero.criteriaTitle")}</h3>
          <ul style={{ paddingLeft: 18, marginTop: 6 }}>
            <li>{t("homeHero.criteria.pe")}</li>
            <li>{t("homeHero.criteria.ps")}</li>
            <li>{t("homeHero.criteria.price")}</li>
          </ul>

          <p style={{ marginTop: 8 }}>{t("homeHero.notes")}</p>
          <p style={{ marginTop: 4, fontStyle: "italic", opacity: 0.9 }}>
            {t("homeHero.frontendOnly")}
          </p>
        </section>

        <div className={styles.topBar}>
          <CryptoMarquee />
        </div>

        <header className={styles.hero} />

        {/* ===== Новости + правая колонка (статус рынка / топ-гэйнеры) ===== */}
        <section className={styles.headerGrid}>
          <div className={styles.newsCol}>
            <NewsMini />
          </div>
          <aside className={styles.sideCol}>
            {mkt.isOpen ? <TopGainers /> : <MarketClosedCard />}
          </aside>
        </section>

        {/* ======== SEARCH BAR (перенесен сюда) ======== */}
        <form className={styles.searchBar} onSubmit={onSubmitSearch}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by ticker or company… (e.g. AAPL, NVIDIA)"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
          />
          <button className={styles.searchBtn} type="submit" disabled={search.status === "loading"}>
            {search.status === "loading" ? "Searching…" : "Search"}
          </button>
          {search.query && (
            <button type="button" className={styles.clearBtn} onClick={onClearSearch} aria-label="Clear search">
              ×
            </button>
          )}
        </form>

        {/* ======== SEARCH RESULT ======== */}
        {(search.result || search.notFound || search.error) && (
          <section className={styles.searchResultSection}>
            {search.result && (
              <div className={styles.searchResultCard}>
                <StockCard stock={search.result} />
              </div>
            )}

            {search.notFound && !search.result && (
              <div className={styles.searchNotFound}>Ticker not found on Finnhub.</div>
            )}

            {search.error && !search.result && !search.notFound && (
              <div className={styles.searchError}>{search.error}</div>
            )}
          </section>
        )}

        {status === "loading" && items.length === 0 && (
          <div className={styles.skeletonWrap}>
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
          <div ref={cardsTopRef} style={{ scrollMarginTop: 80 }} />

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
