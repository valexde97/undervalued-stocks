import { Link } from "react-router-dom";
import { motion, useAnimation, useInView } from "framer-motion";
import { useEffect, useRef } from "react";
import { useFavorites } from "./FavoritesContext";
import type { Stock } from "../types/stock";
import styles from "./StockCard.module.css";

type Props = { stock: Stock };

const capText = (s: Stock) => {
  if (s.marketCapText) return s.marketCapText as string;
  if (s.marketCap && s.marketCap > 0) {
    const n = s.marketCap;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}B`;
    return `${n.toFixed(2)}M`;
  }
  return "—";
};

export const StockCard: React.FC<Props> = ({ stock }) => {
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = favorites.includes(stock.ticker);

  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const controls = useAnimation();
  useEffect(() => {
    if (inView) controls.start("visible");
  }, [inView, controls]);

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

      {/* Капа + категория в одну строку */}
      <div className={styles.inlineRow}>
        <span className={styles.kv}>
          <span className={styles.k}>Market Cap:</span> <span className={styles.v}>{capText(stock)}</span>
        </span>
        <span className={styles.dot}>•</span>
        <span className={styles.kv}>
          <span className={styles.k}>Category:</span>{" "}
          <span className={styles.badge}>{stock.category}</span>
        </span>
      </div>

      {/* Метрики */}
      <div className={styles.metrics}>
        <div>PE: {stock.pe ?? stock.peSnapshot ?? "—"}{stock.pe ? " (live)" : stock.peSnapshot ? " (finviz)" : ""}</div>
        <div>PS: {stock.ps ?? stock.psSnapshot ?? "—"}{stock.ps ? " (live)" : stock.psSnapshot ? " (finviz)" : ""}</div>
        <div>Price: {stock.price != null ? `$${Number(stock.price).toFixed(2)}` : "— loading"}</div>
      </div>

      <div className={styles.ctaWrap}>
        <Link to={`/stocks/${stock.ticker}`}>
          <motion.button className={styles.viewButton} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            View Details
          </motion.button>
        </Link>
      </div>

      {/* ⭐ уехала вниз-вправо и не мешает заголовку */}
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
