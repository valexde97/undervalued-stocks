import { useEffect, useMemo } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import StockList from "../components/StockList";
import { bootstrapFromFinviz, loadNextAndReplace } from "../store/stocksSlice";
import type { Stock } from "../types/stock";


import CryptoMarquee from "../components/CryptoMarquee";
import NewsMini from "../components/NewsMini";
import TopGainers from "../components/TopGainers";
import MarketClosedCard from "../components/MarketClosedCard";
import { getMarketSession } from "../utils/marketSession";


import styles from "./home.module.css";


export const Home = () => {
const dispatch = useAppDispatch();
const { items, status, hasMore } = useAppSelector((s) => s.stocks);


useEffect(() => {
dispatch(bootstrapFromFinviz({ quotesConcurrency: 2 }));
}, [dispatch]);


const visibleStocks = useMemo<Stock[]>(() => items, [items]);
const mkt = getMarketSession();
const onLoadMore = async () => {
try {
await dispatch(loadNextAndReplace()).unwrap();
window.scrollTo({ top: 0, behavior: "smooth" });
} catch (e) {
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
<div className={styles.moreRow}>
<button className={styles.moreBtn} onClick={onLoadMore} disabled={!hasMore || status === "loading"}>
{status === "loading" ? "Loading…" : hasMore ? "Load next 20" : "End of list"}
</button>
</div>
</main>
</div>
</motion.div>
);
};