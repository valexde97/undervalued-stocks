import { motion } from "framer-motion";
import { useFavorites } from "./FavoritesContext";
import { StockCard } from "../components/StockCard";

type Stock = {
  ticker: string;
  name: string;
  price: number;
  category: "small" | "mid" | "large";
  listedAt: Date;
};

const allStocks: Stock[] = [
  { ticker: "AAPL", name: "Apple Inc.", price: 155, category: "large", listedAt: new Date("1980-12-12") },
  { ticker: "TSLA", name: "Tesla Inc.", price: 720, category: "large", listedAt: new Date("2010-06-29") },
  { ticker: "AMZN", name: "Amazon.com Inc.", price: 130, category: "large", listedAt: new Date("1997-05-15") },
  { ticker: "NIO", name: "NIO Inc.", price: 9, category: "small", listedAt: new Date("2018-09-12") },
  { ticker: "PLTR", name: "Palantir Technologies", price: 25, category: "mid", listedAt: new Date("2020-09-30") },
  { ticker: "MSFT", name: "Microsoft Corp.", price: 310, category: "large", listedAt: new Date("1986-03-13") },
  { ticker: "NVDA", name: "NVIDIA Corp.", price: 800, category: "large", listedAt: new Date("1999-01-22") },
  { ticker: "SQ", name: "Block Inc.", price: 70, category: "mid", listedAt: new Date("2015-11-19") },
  { ticker: "SOFI", name: "SoFi Technologies", price: 7, category: "small", listedAt: new Date("2021-06-01") },
  { ticker: "ABNB", name: "Airbnb Inc.", price: 140, category: "mid", listedAt: new Date("2020-12-10") },
];

export const Favorites = () => {
  const { favorites, clearFavorites } = useFavorites();
  const favoriteStocks = allStocks.filter((stock) => favorites.includes(stock.ticker));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ padding: "2rem" }}
    >
      <h2>Your Favorites ⭐</h2>
      {favoriteStocks.length > 0 && (
        <button onClick={clearFavorites} style={{ marginBottom: "1rem" }}>
          🧹 Clear Favorites
        </button>
      )}

      {favoriteStocks.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {favoriteStocks.map((stock) => (
            <StockCard key={stock.ticker} stock={stock} />
          ))}
        </div>
      ) : (
        <p>No favorites yet. Add some!</p>
      )}
    </motion.div>
  );
};
