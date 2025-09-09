import React from "react";
import Skeleton from "react-loading-skeleton";
import styles from "../../pages/stockDetails.module.css";

function fmtNum(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return String(n ?? "—");
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

type Props = {
  metric: Record<string, any> | null;
  loading: boolean;
  error: string | null;
};

const RawMetricsTable: React.FC<Props> = ({ metric, loading, error }) => {
  return (
    <details className={styles.rawBlock} open>
      <summary className={styles.rawSummary}>All metrics (raw)</summary>
      <div className={styles.rawTableWrap}>
        {loading ? (
          <Skeleton count={6} />
        ) : error ? (
          <div className={styles.errorText}>Failed to load metrics.</div>
        ) : (
          <table className={styles.metricsTable}>
            <thead><tr><th>Field</th><th>Value</th></tr></thead>
            <tbody>
              {Object.entries(metric || {})
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, v]) => (
                  <tr key={k}>
                    <td className={styles.keyCell}>{k}</td>
                    <td className={styles.valCell}>{typeof v === "number" ? fmtNum(v) : String(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
};

export default RawMetricsTable;
