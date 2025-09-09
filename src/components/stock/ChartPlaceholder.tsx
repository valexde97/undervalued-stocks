import React from "react";
import styles from "../../pages/stockDetails.module.css";
import { useTranslation } from "react-i18next";

const ChartPlaceholder: React.FC<{ loading?: boolean }> = ({ loading }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.chartCard}>
      <h3>{t("stockDetails.chart")}</h3>
      <div className={styles.chartPlaceholder}>
        ({t("stockDetails.chartPlaceholder")})
      </div>
    </div>
  );
};

export default ChartPlaceholder;
