import { useEffect, useState } from "react";
import { StockList } from "../components/StockList";
import { FilterPanel } from "../components/FilterPanel";
import { useRef } from "react";
import { FormikProps } from "formik";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";

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
  const [activeFilters, setActiveFilters] = useState<FilterValues>({
    minPrice: "",
    maxPrice: "",
    category: "",
    sortBy: "",
  });

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        setIsLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const fakeData: Stock[] = [
          {
            ticker: "AAPL",
            name: "Apple Inc.",
            price: 155,
            category: "large",
            listedAt: new Date("1980-12-12"),
          },
          {
            ticker: "TSLA",
            name: "Tesla Inc.",
            price: 720,
            category: "large",
            listedAt: new Date("2010-06-29"),
          },
          {
            ticker: "AMZN",
            name: "Amazon.com Inc.",
            price: 130,
            category: "large",
            listedAt: new Date("1997-05-15"),
          },
          {
            ticker: "NIO",
            name: "NIO Inc.",
            price: 9,
            category: "small",
            listedAt: new Date("2018-09-12"),
          },
          {
            ticker: "PLTR",
            name: "Palantir Technologies",
            price: 25,
            category: "mid",
            listedAt: new Date("2020-09-30"),
          },
          {
            ticker: "MSFT",
            name: "Microsoft Corp.",
            price: 310,
            category: "large",
            listedAt: new Date("1986-03-13"),
          },
          {
            ticker: "NVDA",
            name: "NVIDIA Corp.",
            price: 800,
            category: "large",
            listedAt: new Date("1999-01-22"),
          },
          {
            ticker: "SQ",
            name: "Block Inc.",
            price: 70,
            category: "mid",
            listedAt: new Date("2015-11-19"),
          },
          {
            ticker: "SOFI",
            name: "SoFi Technologies",
            price: 7,
            category: "small",
            listedAt: new Date("2021-06-01"),
          },
          {
            ticker: "ABNB",
            name: "Airbnb Inc.",
            price: 140,
            category: "mid",
            listedAt: new Date("2020-12-10"),
          },
        ];

        setStocks(fakeData);
        setFilteredStocks(fakeData);
      } catch (error) {
        console.error("Failed to load stocks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStocks();
  }, []);

  const handleFilter = (filters: FilterValues) => {
    let result = [...stocks];
    if (filters.minPrice !== "") {
      result = result.filter(
        (stock) => stock.price >= Number(filters.minPrice)
      );
    }
    if (filters.maxPrice !== "") {
      result = result.filter(
        (stock) => stock.price <= Number(filters.maxPrice)
      );
    }

    if (filters.category) {
      result = result.filter((stock) => stock.category === filters.category);
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
    setActiveFilters(filters);
  };

  const resetMinPrice = () => {
    const newFilters: FilterValues = { ...activeFilters, minPrice: "" };
    handleFilter(newFilters);
    formikRef.current?.setFieldValue("minPrice", "");
  };

  const resetMaxPrice = () => {
    const newFilters: FilterValues = { ...activeFilters, maxPrice: "" };
    handleFilter(newFilters);
    formikRef.current?.setFieldValue("maxPrice", "");
  };

  const resetCategory = () => {
    const newFilters: FilterValues = { ...activeFilters, category: "" };
    handleFilter(newFilters);
    formikRef.current?.setFieldValue("category", "");
  };

  const resetSortBy = () => {
    const newFilters: FilterValues = { ...activeFilters, sortBy: "" };
    handleFilter(newFilters);
    formikRef.current?.setFieldValue("sortBy", "");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <>
        <h2>Welcome, to Demo version of my InvApp!</h2>
        <p>
          Here you can see in live-time how i will be developing my new project.
        </p>

        <FilterPanel onFilter={handleFilter} formikRef={formikRef} />

        <button
          onClick={() => setFilteredStocks(stocks)}
          style={{ marginTop: "1rem" }}
        >
          Reset Filters
        </button>
        {(activeFilters.minPrice ||
          activeFilters.maxPrice ||
          activeFilters.category ||
          activeFilters.sortBy) && (
          <div style={{ margin: "1rem 0" }}>
            <h4>Active Filters:</h4>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {activeFilters.minPrice && (
                <span
                  style={{
                    backgroundColor: "#f0ad4e",
                    padding: "5px 10px",
                    borderRadius: "20px",
                  }}
                >
                  Min Price: {activeFilters.minPrice}$
                  <button
                    onClick={resetMinPrice}
                    style={{
                      marginLeft: "5px",
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    ❌
                  </button>
                </span>
              )}
              {activeFilters.maxPrice && (
                <span
                  style={{
                    backgroundColor: "#5bc0de",
                    padding: "5px 10px",
                    borderRadius: "20px",
                  }}
                >
                  Max Price: {activeFilters.maxPrice}$
                  <button
                    onClick={resetMaxPrice}
                    style={{
                      marginLeft: "5px",
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    ❌
                  </button>
                </span>
              )}
              {activeFilters.category && (
                <span
                  style={{
                    backgroundColor: "#5cb85c",
                    padding: "5px 10px",
                    borderRadius: "20px",
                  }}
                >
                  Category: {activeFilters.category}
                  <button
                    onClick={resetCategory}
                    style={{
                      marginLeft: "5px",
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    ❌
                  </button>
                </span>
              )}
              {activeFilters.sortBy && (
                <span
                  style={{
                    backgroundColor: "#d9534f",
                    padding: "5px 10px",
                    borderRadius: "20px",
                  }}
                >
                  Sort By: {activeFilters.sortBy}
                  <button
                    onClick={resetSortBy}
                    style={{
                      marginLeft: "5px",
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    ❌
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
        {IsLoading ? (
          <div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                style={{
                  border: "1px solid #ccc",
                  padding: "1rem",
                  marginBottom: "1rem",
                  borderRadius: "8px",
                  backgroundColor: "#fff",
                }}
              >
                <Skeleton height={30} width={200} />
                <Skeleton
                  height={20}
                  width={100}
                  style={{ marginTop: "0.5rem" }}
                />
                <Skeleton
                  height={20}
                  width={150}
                  style={{ marginTop: "0.5rem" }}
                />
                <Skeleton
                  height={35}
                  width={120}
                  style={{ marginTop: "1rem" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <StockList stocks={filteredStocks} />
        )}
      </>
    </motion.div>
  );
};
