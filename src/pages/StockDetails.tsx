import { useParams, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import styles from "./stockDetails.module.css";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store";
import { prioritizeDetailsTicker, selectSeedByTicker } from "../store/stocksSlice";

import { useFinnhubMetrics } from "../components/hooks/useFinnhubMetrics";
import { useFinnhubProfile2 } from "../components/hooks/useFinnhubProfile2";
import { useSecFacts } from "../components/hooks/useSecFacts";

import InfoCard from "../components/stock/InfoCard";
import RawMetricsTable from "../components/stock/RawMetricsTable";
import ChartPlaceholder from "../components/stock/ChartPlaceholder";
import AboutSection from "../components/stock/AboutSection";

function prettyCategory(cat?: string | null) {
  if (!cat) return "—";
  const s = String(cat).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const StockDetails = () => {
  const { t } = useTranslation();
  const { ticker } = useParams<{ ticker: string }>();
  const location = useLocation() as { state?: { seed?: { price?: number | null; category?: any } } };
  const dispatch = useAppDispatch();

  const upper = (ticker || "").toUpperCase();

  // seeds
  const stock = useAppSelector((s) => s.stocks.items.find((it) => it.ticker === upper));
  const seedFromStore = useAppSelector(selectSeedByTicker(upper));
  const seedFromRoute = location.state?.seed;
  const priceSeed = (seedFromRoute?.price ?? seedFromStore?.price ?? stock?.price ?? null) as number | null;
  const categorySeed = (seedFromRoute?.category ?? seedFromStore?.category ?? stock?.category ?? null) as
    | "small"
    | "mid"
    | "large"
    | null;

  // load priority snapshot for details
  useEffect(() => {
    if (upper) void dispatch(prioritizeDetailsTicker({ ticker: upper }));
  }, [upper, dispatch]);

  // data hooks
  const { loading: metricsLoading, error: metricsError, metric } = useFinnhubMetrics(upper);
  const { loading: p2Loading, error: p2Error, profile: p2 } = useFinnhubProfile2(upper);
  const { error: secError, facts: secFacts } = useSecFacts(upper);

  // Display name: prefer Finnhub Profile2 -> stock.name (Finviz seed via store) -> SEC entityName -> placeholder
  const displayName = useMemo(() => {
    const fromFinnhub = (p2?.name ?? "").trim();
    const fromStock = (stock?.name ?? "").trim();
    const fromSec = (secFacts?.entityName ?? "").trim();
    return fromFinnhub || fromStock || fromSec || null;
  }, [p2?.name, stock?.name, secFacts?.entityName]);

  return (
    <motion.div className={styles.wrapper} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className={styles.title}>
        {upper ? `${displayName ?? t("stockDetails.namePlaceholder")} (${upper})` : <Skeleton width={300} />}
      </h1>

      <div className={styles.grid}>
        {/* LEFT: Info + metrics + valuation */}
        <InfoCard
          symbol={upper}
          priceSeed={priceSeed}
          categorySeed={categorySeed}
          metric={metric}
          metricsLoading={metricsLoading}
          metricsError={metricsError}
          p2={p2}
          p2Loading={p2Loading}
          p2Error={p2Error}
          secFacts={secFacts}
          secError={secError}
        />

        {/* RIGHT: Chart */}
        <ChartPlaceholder />
      </div>

      {/* RAW METRICS */}
      <RawMetricsTable metric={metric} loading={metricsLoading} error={metricsError} />

      {/* ABOUT */}
<AboutSection symbol={upper} metric={metric} metricsLoading={metricsLoading} priceSeed={priceSeed} />
    </motion.div>
  );
};

export default StockDetails;
