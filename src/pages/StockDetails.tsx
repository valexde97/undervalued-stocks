import { useParams, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import styles from "./stockDetails.module.css";
import { useAppDispatch, useAppSelector } from "../store/index";
import { prioritizeDetailsTicker, selectSeedByTicker } from "../store/stocksSlice";
import { fetchJSON } from "../utils/http";

type MetricsResp = {
  symbol?: string;
  serverTs?: number;
  metric?: Record<string, any>;
  metricType?: string | null;
};

function toUSD(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

function fmtNum(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return String(n ?? "—");
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}
function getFirst(obj: Record<string, any> | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
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

  // карточка из текущего списка
  const stock = useAppSelector((s) => s.stocks.items.find((it) => it.ticker === upper));
  // семя из redux (если было кликнуто View Details)
  const seedFromStore = useAppSelector(selectSeedByTicker(upper));
  // семя из router state (моментальная передача)
  const seedFromRoute = location.state?.seed;

  // итоговые значения price/category -> сначала route, потом redux, потом store items
  const priceSeed = (seedFromRoute?.price ?? seedFromStore?.price ?? stock?.price ?? null) as number | null;
  const categorySeed = (seedFromRoute?.category ?? seedFromStore?.category ?? stock?.category ?? null) as
    | "small"
    | "mid"
    | "large"
    | null;

  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (upper) {
      // приоритетная загрузка котировок/снэпшота
      void dispatch(prioritizeDetailsTicker({ ticker: upper }));
    }
  }, [upper, dispatch]);

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!upper) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const data = await fetchJSON<MetricsResp>(
          `/api/fh/metrics?symbol=${encodeURIComponent(upper)}`,
          { noStore: true, timeoutMs: 20000 }
        );
        if (!aborted) setMetric(data?.metric ?? {});
      } catch (e: any) {
        if (!aborted) setMetricsError(String(e?.message || e));
      } finally {
        if (!aborted) setMetricsLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [upper]);

  const key = useMemo(() => {
    const m = metric || {};
    const pe = getFirst(m, ["peTTM", "peInclExtraTTM", "peExclExtraTTM", "peAnnual", "peBasicExclExtraTTM"]);
    const ps = getFirst(m, ["psTTM", "psAnnual"]);
    const pb = getFirst(m, ["pb", "priceToBookAnnual"]);
    const peg = getFirst(m, ["pegAnnual", "pegRatio"]);
    const evEbitda = getFirst(m, ["enterpriseValueOverEBITDA", "evebitdaAnnual"]);
    const roe = getFirst(m, ["roeTTM", "roeAnnual"]);
    const roic = getFirst(m, ["roicTTM", "roicAnnual"]);
    const grossMargin = getFirst(m, ["grossMarginTTM", "grossMarginAnnual"]);
    const netMargin = getFirst(m, ["netProfitMarginTTM", "netMarginAnnual"]);
    const dToE = getFirst(m, ["debtToEquityAnnual", "debtToEquityTTM"]);
    const currentRatio = getFirst(m, ["currentRatioAnnual", "currentRatioTTM"]);
    const marketCap = getFirst(m, ["marketCapitalization"]);
    const shares = getFirst(m, ["sharesBasic"]);
    return { pe, ps, pb, peg, evEbitda, roe, roic, grossMargin, netMargin, dToE, currentRatio, marketCap, shares };
  }, [metric]);

  return (
    <motion.div
      className={styles.wrapper}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h1 className={styles.title}>
        {upper ? `${t("stockDetails.namePlaceholder")} (${upper})` : <Skeleton width={300} />}
      </h1>

      <div className={styles.grid}>
        {/* LEFT: Company Info + Key Metrics */}
        <div className={styles.infoCard}>
          <h3>{t("stockDetails.info")}</h3>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td><strong>{t("stockDetails.ticker")}:</strong></td>
                <td>{upper || <Skeleton width={80} />}</td>
              </tr>
              <tr>
                <td><strong>{t("stockDetails.price")}:</strong></td>
                <td>
                  {priceSeed != null ? `$${fmtNum(priceSeed)}` : <Skeleton width={60} />}
                </td>
              </tr>
              <tr>
                <td><strong>{t("stockDetails.category")}:</strong></td>
                <td>{categorySeed ? prettyCategory(categorySeed) : <Skeleton width={90} />}</td>
              </tr>

              <tr>
                <td colSpan={2} className={styles.subhead}>Key metrics (Finnhub)</td>
              </tr>

              {metricsLoading && (
                <>
                  <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
                  <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
                  <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
                </>
              )}

              {metricsError && (
                <tr>
                  <td colSpan={2} className={styles.errorText}>
                    Finnhub error: {metricsError}
                  </td>
                </tr>
              )}

              {!metricsLoading && !metricsError && (
                <>
                  <tr><td>P/E (TTM):</td><td>{key.pe != null ? fmtNum(key.pe) : "—"}</td></tr>
                  <tr><td>P/S (TTM):</td><td>{key.ps != null ? fmtNum(key.ps) : "—"}</td></tr>
                  <tr><td>P/B:</td><td>{key.pb != null ? fmtNum(key.pb) : "—"}</td></tr>
                  <tr><td>PEG:</td><td>{key.peg != null ? fmtNum(key.peg) : "—"}</td></tr>
                  <tr><td>EV/EBITDA:</td><td>{key.evEbitda != null ? fmtNum(key.evEbitda) : "—"}</td></tr>
                  <tr><td>ROE (TTM):</td><td>{key.roe != null ? fmtNum(key.roe) : "—"}</td></tr>
                  <tr><td>ROIC (TTM):</td><td>{key.roic != null ? fmtNum(key.roic) : "—"}</td></tr>
                  <tr><td>Gross Margin (TTM):</td><td>{key.grossMargin != null ? fmtNum(key.grossMargin) : "—"}</td></tr>
                  <tr><td>Net Margin (TTM):</td><td>{key.netMargin != null ? fmtNum(key.netMargin) : "—"}</td></tr>
                  <tr><td>Debt / Equity:</td><td>{key.dToE != null ? fmtNum(key.dToE) : "—"}</td></tr>
                  <tr><td>Current Ratio:</td><td>{key.currentRatio != null ? fmtNum(key.currentRatio) : "—"}</td></tr>
                  <tr><td>Market Cap:</td><td>{key.marketCap != null ? "$" + toUSD(key.marketCap) : "—"}</td></tr>
                  <tr><td>Shares (Basic):</td><td>{key.shares != null ? toUSD(key.shares) : "—"}</td></tr>
                </>
              )}
            </tbody>
          </table>

          {/* All raw metrics */}
          <details className={styles.rawBlock} open>
            <summary className={styles.rawSummary}>All metrics (raw)</summary>
            <div className={styles.rawTableWrap}>
              {metricsLoading ? (
                <Skeleton count={6} />
              ) : metricsError ? (
                <div className={styles.errorText}>Failed to load metrics.</div>
              ) : (
                <table className={styles.metricsTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metric || {})
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td className={styles.keyCell}>{k}</td>
                          <td className={styles.valCell}>
                            {typeof v === "number" ? fmtNum(v) : String(v)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </details>
        </div>

        {/* RIGHT: Chart placeholder */}
        <div className={styles.chartCard}>
          <h3>{t("stockDetails.chart")}</h3>
          {metricsLoading ? (
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
        <p>{t("stockDetails.description")}</p>
      </div>
    </motion.div>
  );
};
