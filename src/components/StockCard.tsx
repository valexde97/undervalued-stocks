// src/components/StockCard.tsx
import { Link } from "react-router-dom";
import { motion, useAnimation, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useFavorites } from "./FavoritesContext";
import type { Stock } from "../types/stock";
import { loadValuation, type Valuation } from "../api/valuation";
import styles from "./stockCard.module.css";

type Props = { stock: Stock };

const capText = (s: Stock) => {
  if ((s as any).marketCapText) return (s as any).marketCapText as string;
  if ((s as any).marketCap && (s as any).marketCap > 0) {
    const n = (s as any).marketCap as number;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}B`;
    return `${n.toFixed(2)}M`;
  }
  return "—";
};

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : Number(n).toFixed(d);

const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null || !Number.isFinite(n) ? "—" : (n * 100).toFixed(d) + "%";

export const StockCard: React.FC<Props> = ({ stock }) => {
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = favorites.includes(stock.ticker);

  // Анимация появления
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const controls = useAnimation();
  useEffect(() => {
    if (inView) controls.start("visible");
  }, [inView, controls]);

  // Доп. метрики оценки
  const [val, setVal] = useState<Valuation | null>(null);
  useEffect(() => {
    let alive = true;
    loadValuation(stock.ticker)
      .then((v) => {
        if (alive) setVal(v);
      })
      .catch(() => {
        if (alive) setVal(null);
      });
    return () => {
      alive = false;
    };
  }, [stock.ticker]);

  const title = `${(stock as any)?.company ?? stock.name} (${stock.ticker})`;

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
      </div>

      {/* Капа + категория */}
      <div className={styles.inlineRow}>
        <span className={styles.kv}>
          <span className={styles.k}>Market Cap:</span>{" "}
          <span className={styles.v}>{capText(stock)}</span>
        </span>
        <span className={styles.dot}>•</span>
        <span className={styles.kv}>
          <span className={styles.k}>Category:</span>{" "}
          <span className={styles.badge}>{stock.category}</span>
        </span>
      </div>

      {/* Базовые метрики из списка */}
      <div className={styles.metrics} style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 8 }}>
        <div>
          Price:{" "}
          {stock.price != null ? `$${Number(stock.price).toFixed(2)}` : val?.price != null ? `$${fmt(val.price)}` : "—"}
        </div>
        <div>
          PE:{" "}
          {stock.pe ?? (stock as any).peSnapshot ?? (val?.pe ?? null)
            ? (stock.pe ?? (stock as any).peSnapshot ?? val?.pe)!.toFixed(2)
            : "—"}
          {stock.pe ? " (live)" : (stock as any).peSnapshot ? " (finviz)" : val?.pe ? " (calc)" : ""}
        </div>
        <div>
          PS:{" "}
          {stock.ps ?? (stock as any).psSnapshot
            ? (Number(stock.ps ?? (stock as any).psSnapshot)).toFixed(2)
            : "—"}
          {stock.ps ? " (live)" : (stock as any).psSnapshot ? " (finviz)" : ""}
        </div>
      </div>

      {/* Доп. оценочные мультипликаторы (по возможности) */}
      <div className={styles.metrics} style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: 8 }}>
        <div>EV/EBITDA: {fmt(val?.evEbitda, 2)}</div>
        <div>P/FCF: {fmt(val?.pFcf, 2)}</div>
        <div>FCF-Yield: {fmtPct(val?.fcfYield, 1)}</div>
        <div>PEG: {fmt(val?.peg, 2)}</div>
      </div>

      <div className={styles.ctaWrap}>
        <Link to={`/stocks/${stock.ticker}`}>
          <motion.button className={styles.viewButton} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            View Details
          </motion.button>
        </Link>
      </div>

      {/* Избранное */}
      <button
        onClick={() => toggleFavorite(stock.ticker)}
        className={`${styles.fav} ${isFavorite ? "" : styles.inactive}`}
        aria-label={isFavorite ? "remove from favorites" : "add to favorites"}
        title="Toggle favorite"
      >
        {isFavorite ? "⭐" : "☆"}
      </button>
    </motion.div>
  );
};
