import { StockCard } from "./StockCard";
import { motion } from "framer-motion";
import styles from "./stockList.module.css";

type Stock = {
  ticker: string;
  name: string;
  price: number;
  category: "small" | "mid" | "large";
  listedAt: Date;
};

type Props = {
  stocks: Stock[];
};

export const StockList = ({ stocks }: Props) => (
  <div className={styles.grid}>
    {stocks.map((stock, index) => (
      <motion.div
        key={stock.ticker}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        transition={{
          type: "spring",
          stiffness: 80,
          damping: 15,
          delay: index * 0.1,
        }}
        className={styles.cardContainer}
      >
        <StockCard stock={stock} />
      </motion.div>
    ))}
  </div>
);
