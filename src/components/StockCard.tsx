import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import styles from "./StockCard.module.css";

type Stock = {
  ticker: string;
  name: string;
  price: number;
  category: "small" | "mid" | "large";
  listedAt: Date;
};

type Props = {
  stock: Stock;
};

export const StockCard = ({ stock }: Props) => (
  <div className={styles.card}>
    <h3 className={styles.title}>
      {stock.name} ({stock.ticker})
    </h3>
    <p className={styles.info}>Price: ${stock.price}</p>
    <p className={styles.info}>Category: {stock.category}</p>

    <Link to={`/stocks/${stock.ticker}`}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={styles.viewButton}
      >
        View Details
      </motion.button>
    </Link>
  </div>
);
