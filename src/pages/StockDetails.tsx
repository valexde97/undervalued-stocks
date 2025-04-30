import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import styles from './StockDetails.module.css';

export const StockDetails = () => {
  const { t } = useTranslation();
  const { ticker } = useParams<{ ticker: string }>();
  const [isLoading, setIsLoading] = useState(true);

  const dummyData = {
    name: "Company Name Placeholder",
    price: 150,
    category: "large",
    listedAt: new Date("2010-06-29"),
    description: t("stockDetails.description")
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      className={styles.wrapper}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h2 className={styles.title}>
        {isLoading ? <Skeleton width={300} /> : `${dummyData.name} (${ticker})`}
      </h2>

      <div className={styles.grid}>
        <div className={styles.infoCard}>
          <h3>{t("stockDetails.info")}</h3>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td><strong>{t("stockDetails.ticker")}:</strong></td>
                <td>{isLoading ? <Skeleton width={80} /> : ticker}</td>
              </tr>
              <tr>
                <td><strong>{t("stockDetails.price")}:</strong></td>
                <td>{isLoading ? <Skeleton width={50} /> : `$${dummyData.price}`}</td>
              </tr>
              <tr>
                <td><strong>{t("stockDetails.category")}:</strong></td>
                <td>{isLoading ? <Skeleton width={100} /> : dummyData.category}</td>
              </tr>
              <tr>
                <td><strong>{t("stockDetails.listedAt")}:</strong></td>
                <td>{isLoading ? <Skeleton width={120} /> : dummyData.listedAt.toLocaleDateString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.chartCard}>
          <h3>{t("stockDetails.chart")}</h3>
          {isLoading ? (
            <Skeleton height={200} />
          ) : (
            <div className={styles.chartPlaceholder}>
              ({t("stockDetails.chartPlaceholder")})
            </div>
          )}
        </div>
      </div>

      <div className={styles.aboutCard}>
        <h3>{t("stockDetails.about")}</h3>
        <p>
          {isLoading ? <Skeleton count={4} /> : dummyData.description}
        </p>
      </div>
    </motion.div>
  );
};
