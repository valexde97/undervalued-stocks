import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
  return (
    <div className={styles.card}>
      <h3>
        {stock.name} ({stock.ticker})
      </h3>
      <p>Price: ${stock.price}</p>
      <button onClick={() => toggleFavorite(stock.ticker)}>
        {isFavorite ? "⭐ Remove" : "☆ Add to Favorites"}
      </button>
      <p className={styles.info}>Category: {stock.category}</p>

      <Link to={`/stocks/${stock.ticker}`}>
      <motion.button className={styles.viewButton}>
          View Details
        </motion.button>
      </Link>
    </div>
  );
};
