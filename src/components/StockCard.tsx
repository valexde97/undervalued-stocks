import { Link } from "react-router-dom";
import { useInView } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef } from "react";
import styles from "./StockCard.module.css";
import { useFavorites } from "./FavoritesContext";

type Stock = {
  ticker: string;
  name: string;
  price: number;
  category: "small" | "mid" | "large";
  listedAt: Date;
};

export const StockCard = ({ stock }: { stock: Stock }) => {
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = favorites.includes(stock.ticker);

  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const controls = useAnimation();

  useEffect(() => {
    if (inView) {
      controls.start("visible");
    }
  }, [inView, controls]);

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      whileHover={{ scale: 1.03 }}
      variants={{
        hidden: { opacity: 0, y: 50, scale: 0.98 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.5, ease: "easeOut" }
        }
      }}
      className={styles.card}
    >
      <div className={styles.header}>
        <h3>
          {stock.name} ({stock.ticker})
        </h3>
        <button onClick={() => toggleFavorite(stock.ticker)} className={styles.favoriteButton}>
          {isFavorite ? "⭐" : "☆"}
        </button>
      </div>
      <p>Price: ${stock.price}</p>
      <p className={styles.info}>Category: {stock.category}</p>
      <Link to={`/stocks/${stock.ticker}`}>
        <motion.button
          className={styles.viewButton}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          View Details
        </motion.button>
      </Link>
    </motion.div>
  );
};
