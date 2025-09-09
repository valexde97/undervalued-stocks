import React from "react";
import Skeleton from "react-loading-skeleton";
import styles from "../../pages/stockDetails.module.css";
import { generateAutoAnalysis } from "../../utils/autoAnalysis";
import { useAlphaOverview } from "../hooks/useAlphaOverview";

type Props = {
  symbol: string;
  metric: Record<string, any> | null;
};

type AlphaOverviewData = {
  Description?: string;
  // add other fields if needed
};

const AboutSection: React.FC<Props> = ({ symbol, metric }) => {
  const { loading, error, data, load, loadedOnce } = useAlphaOverview(symbol) as {
    loading: boolean;
    error: string | null;
    data: AlphaOverviewData | null;
    load: () => void;
    loadedOnce: boolean;
  };
  const auto = metric ? generateAutoAnalysis(metric) : null;

  return (
    <div className={styles.aboutCard}>
      <h3>About the Company</h3>

      {/* Description from Alpha Vantage (on demand) */}
      {loading ? (
        <Skeleton count={3} />
      ) : error ? (
        <p className={styles.errorText}>Alpha Vantage error: {error}</p>
      ) : data?.Description ? (
        <p>{data.Description.length > 900 ? data.Description.slice(0, 900).trim() + "…" : data.Description}</p>
      ) : (
        <p style={{ opacity: 0.8 }}>{loadedOnce ? "No long description available." : "No long description loaded yet."}</p>
      )}

      {/* Auto analysis from Finnhub metrics */}
      {auto ? (
        <div style={{ marginTop: "0.5rem" }}>
          {!!auto.strengths.length && (
            <ul style={{ margin: "0.25rem 0" }}>
              {auto.strengths.map((s, i) => (
                <li key={"s" + i}>✅ {s}</li>
              ))}
            </ul>
          )}
          {!!auto.risks.length && (
            <ul style={{ margin: "0.25rem 0" }}>
              {auto.risks.map((r, i) => (
                <li key={"r" + i}>⚠️ {r}</li>
              ))}
            </ul>
          )}
          {!!auto.notes.length && <p style={{ marginTop: 6 }}>{auto.notes.join(" ")}</p>}
        </div>
      ) : null}

      {/* Bottom controls */}
      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={load}
          disabled={loading}
          className={styles.viewButton}
          style={{ padding: "0.5rem 0.9rem" }}
          title="Load Alpha Vantage OVERVIEW (limited calls on free plan)"
        >
          {loading ? "Loading…" : "Load Alpha Vantage overview"}
        </button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Free plan limit ~25 calls/day. Use sparingly; data is cached by our backend.
        </span>
      </div>
    </div>
  );
};

export default AboutSection;
