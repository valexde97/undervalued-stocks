import { Link } from "react-router-dom";
import { motion, useAnimation, useInView } from "framer-motion";
import React, { useEffect, useMemo, useRef } from "react";
import { useFavorites } from "./FavoritesContext";
import type { Stock } from "../types/stock";
import styles from "./stockCard.module.css";

type Props = { stock: Stock };

function capTextM(m?: number | null, text?: string | null) {
  if (text) return text;
  if (m == null) return "—";
  if (m >= 1000) return `${(m / 1000).toFixed(2)}B`;
  return `${m.toFixed(2)}M`;
}
function prettyCategory(cat?: string | null) {
  if (!cat) return "—";
  const s = String(cat).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const StockCardBase: React.FC<Props> = ({ stock }) => {
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = favorites.includes(stock.ticker);

  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const controls = useAnimation();
  useEffect(() => { if (inView) controls.start("visible"); }, [inView, controls]);

  const title = `${(stock as any)?.company ?? stock.name} (${stock.ticker})`;

  const day = useMemo(() => {
    const open = (stock as any)?.open ?? null;
    const prev = (stock as any)?.prevClose ?? null;
    const high = (stock as any)?.high ?? null;
    const low  = (stock as any)?.low  ?? null;
    const price = stock.price ?? null;

    const dAbs = price != null && prev != null ? price - prev : null;
    const dPct = dAbs != null && prev ? (dAbs / prev) * 100 : null;
    const openDelta = open != null && prev != null ? open - prev : null;

    return { open, prev, high, low, price, dAbs, dPct, openDelta };
  }, [stock]);

  const catLabel = prettyCategory((stock as any)?.category);
  const mainDeltaClass = day.dPct != null ? (day.dPct >= 0 ? styles.up : styles.down) : "";
  const openPrevClass = day.openDelta != null ? (day.openDelta >= 0 ? styles.up : styles.down) : "";

  const openPrevText =
    day.open != null && day.prev != null
      ? `${day.open.toFixed(2)} • ${day.prev.toFixed(2)}${
          day.openDelta != null ? ` (${day.openDelta >= 0 ? "+" : ""}${day.openDelta.toFixed(2)})` : ""
        }`
      : "—";

  const dayRangeText =
    day.low != null && day.high != null ? `${day.low.toFixed(2)} – ${day.high.toFixed(2)}` : "—";

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      whileHover={{ scale: 1.02 }}
      variants={{
        hidden: { opacity: 0, y: 30, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
      }}
      className={styles.card}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <button
          onClick={() => toggleFavorite(stock.ticker)}
          className={`${styles.fav} ${isFavorite ? styles.activeFav : ""}`}
          aria-label={isFavorite ? "remove from favorites" : "add to favorites"}
          title="Toggle favorite"
        >
          {isFavorite ? "⭐" : "☆"}
        </button>
      </div>

      <div className={styles.inlineRow}>
        <span className={styles.kv}>
          <span className={styles.k}>Market Cap:</span>{" "}
          <span className={styles.v}>
            {capTextM(stock.marketCap ?? null, (stock as any)?.marketCapText)}
          </span>
        </span>
        <span className={styles.dot}>•</span>
        <span className={styles.kv}>
          <span className={styles.k}>Category:</span>{" "}
          <span className={styles.badge}>
            <span className={styles.badgeDot} />
            {catLabel}
          </span>
        </span>
      </div>

      <div className={styles.priceRow}>
        <div className={styles.priceBlock}>
          <span className={styles.priceLabel}>Price:</span>
          <span className={styles.priceValue}>
            {day.price != null ? `$${day.price.toFixed(2)}` : "—"}
          </span>
        </div>
        <span className={`${styles.delta} ${mainDeltaClass}`}>
          {day.dPct == null ? "" : `${day.dPct >= 0 ? "+" : ""}${day.dPct.toFixed(2)}% `}
          {day.dAbs == null ? "" : `(${day.dAbs >= 0 ? "+" : ""}${day.dAbs.toFixed(2)})`}
        </span>
      </div>

      <div className={styles.subStats}>
        <div className={styles.range}>Day range: <span>{dayRangeText}</span></div>
        <div className={styles.xtra}>Open/Prev: <span className={openPrevClass}>{openPrevText}</span></div>
      </div>

      <div className={styles.metrics}>
        <div>
          PE: {stock.pe ?? (stock as any).peSnapshot ?? "—"}
          {stock.pe ? "" : (stock as any).peSnapshot ? " (finviz)" : ""}
        </div>
        <div>
          PS: {stock.ps ?? (stock as any).psSnapshot ?? "—"}
          {stock.ps ? "" : (stock as any).psSnapshot ? " (finviz)" : ""}
        </div>
      </div>

      <div className={styles.ctaWrap}>
        <Link to={`/stocks/${stock.ticker}`}>
          <motion.button className={styles.viewButton} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            View Details
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
};

// сравниваем только значимые поля, чтобы не перерисовываться зря
function eq(a: Props, b: Props) {
  const sa = a.stock as any;
  const sb = b.stock as any;
  return (
    a.stock.ticker === b.stock.ticker &&
    a.stock.price === b.stock.price &&
    sa.open === sb.open &&
    sa.high === sb.high &&
    sa.low === sb.low &&
    sa.prevClose === sb.prevClose &&
    a.stock.pe === b.stock.pe &&
    a.stock.ps === b.stock.ps &&
    (sa.marketCapText ?? null) === (sb.marketCapText ?? null)
  );
}

const StockCard = React.memo(StockCardBase, eq);
export { StockCard };
export default StockCard;
