import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { motion } from "framer-motion";


export const StockDetails = () => {
  const { ticker } = useParams<{ ticker: string }>();
  const [isLoading, setIsLoading] = useState(true);

  const dummyData = {
    name: "Company Name Placeholder",
    price: 150,
    category: "large",
    listedAt: new Date("2010-06-29"),
    description:
      "This is a placeholder description for the company. In the future, it will be replaced by real API data.",
  };

  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
    <div style={{ padding: "2rem" }}>
       <h2 style={{ marginBottom: "1rem" }}>
        {isLoading ? <Skeleton width={300} /> : `${dummyData.name} (${ticker})`}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: "2rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            backgroundColor: "#f7f7f7",
            padding: "1rem",
            borderRadius: "8px",
          }}
        >
          <h3>Company Info</h3>
          <table style={{ width: "100%", marginTop: "1rem" }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: "bold" }}>Ticker:</td>
                <td>{isLoading ? <Skeleton width={80} /> : ticker}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Price:</td>
                <td>{isLoading ? <Skeleton width={50} /> : `$${dummyData.price}`}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Category:</td>
                <td>{isLoading ? <Skeleton width={100} /> : dummyData.category}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Listed At:</td>
                <td>{isLoading ? <Skeleton width={120} /> : dummyData.listedAt.toLocaleDateString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ backgroundColor: "#e2e6ea", padding: "1rem", borderRadius: "8px" }}>
          <h3>Price Chart</h3>
          {isLoading ? (
            <Skeleton height={200} />
          ) : (
            <div style={{
              height: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666"
            }}>
              (Chart will be here)
            </div>
          )}
        </div>
      </div>
      <div style={{ backgroundColor: "#f7f7f7", padding: "1rem", borderRadius: "8px" }}>
        <h3>About the Company</h3>
        <p style={{ marginTop: "1rem" }}>
          {isLoading ? <Skeleton count={4} /> : dummyData.description}
        </p>
      </div>
    </div>
    </motion.div>
  );
};