import { Link } from "react-router-dom";
import { motion } from "framer-motion";

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
  <div style={{ border: "1px solid #ccc", padding: "1rem", margin: "1rem 0", borderRadius: "8px" }}>
  <h3>{stock.name} ({stock.ticker})</h3>
    <p>Price: ${stock.price}</p>
    <p>Category: {stock.category}</p>
    <Link to={`/stocks/${stock.ticker}`}>
  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '8px', backgroundColor: '#007bff', color: '#fff', border: 'none' }}
  >
    View Details
  </motion.button>
</Link>
  </div>
);