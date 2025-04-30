import { useEffect, useState, useRef } from "react";
import { StockList } from "../components/StockList";
import { FilterPanel } from "../components/FilterPanel";
import { FormikProps } from "formik";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import styles from './home.module.css';

type Stock = {
  ticker: string;
  name: string;
  price: number;
  category: "small" | "mid" | "large";
  listedAt: Date;
};

type FilterValues = {
  minPrice: number | "";
  maxPrice: number | "";
  category: string;
  sortBy: string;
};

export const Home = () => {
  const formikRef = useRef<FormikProps<FilterValues>>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);
  const [IsLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchStocks = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const fakeData: Stock[] = [
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

      setStocks(fakeData);
      setFilteredStocks(fakeData);
      setIsLoading(false);
    };

    fetchStocks();
  }, []);

  const handleFilter = (filters: FilterValues) => {
    let result = [...stocks];
    if (filters.minPrice !== "") {
      result = result.filter(stock => stock.price >= Number(filters.minPrice));
    }
    if (filters.maxPrice !== "") {
      result = result.filter(stock => stock.price <= Number(filters.maxPrice));
    }
    if (filters.category) {
      result = result.filter(stock => stock.category === filters.category);
    }
    if (filters.sortBy === "priceAsc") {
      result.sort((a, b) => a.price - b.price);
    } else if (filters.sortBy === "priceDesc") {
      result.sort((a, b) => b.price - a.price);
    } else if (filters.sortBy === "nameAsc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filters.sortBy === "nameDesc") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }
    setFilteredStocks(result);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={styles.wrapper}
    >
      <div className={styles.container}>
        <div className={styles.mainContent}>
         
          {IsLoading ? (
            <Skeleton count={5} height={150} style={{ marginBottom: "1rem" }} />
          ) : (
            <StockList stocks={filteredStocks} />
          )}
        </div>

        <aside className={styles.sidebar}>
          <FilterPanel onFilter={handleFilter} formikRef={formikRef} />
        </aside>
      </div>
    </motion.div>
  );
};
