// src/components/valuation/FairValuePanel.tsx
import React, { useCallback, useMemo, useState } from "react";
import styles from "../../pages/stockDetails.module.css";
import { computeValuation, type ValuationResult } from "../../lib/valuation";
import { usePriceNow } from "../hooks/usePriceNow";
import GptCommentary from "./GptCommentary";

type Props = {
  symbol: string;
  metric: Record<string, any> | null;
  metricsLoading?: boolean;
  priceSeed?: number | null;
};

function fmt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

const FairValuePanel: React.FC<Props> = ({ symbol, metric, metricsLoading, priceSeed }) => {
  const { priceNow, fetchingPrice, stock, seed } = usePriceNow(symbol, priceSeed);
  const category = (seed?.category ?? stock?.category ?? null) as "small" | "mid" | "large" | null;

  const [busy, setBusy] = useState(false);
  const [vr, setVr] = useState<ValuationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const disabledReason = useMemo(() => {
    if (metricsLoading) return "Metrics are still loading…";
    if (!metric) return "Metrics not loaded yet";
    if (priceNow == null) return fetchingPrice ? "Fetching price snapshot…" : "No price/OHLC snapshot yet";
    return null;
  }, [metricsLoading, metric, priceNow, fetchingPrice]);

  const canCompute = !disabledReason;
  const onCompute = useCallback(() => {
    if (!canCompute || busy) return;
    setBusy(true); setErr(null);
    try {
      const result = computeValuation({
        price: priceNow!,
        category,
        metric: metric!,
        options: { marginOfSafety: 0.30, riskCapMultiple: 5 },
      });
      setVr(result);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setVr(null);
    } finally {
      setBusy(false);
    }
  }, [canCompute, busy, priceNow, category, metric]);

  const discountText = useMemo(() => {
    if (!vr?.blended?.base || !priceNow) return "—";
    const diff = (vr.blended.base - priceNow) / priceNow;
    const pct = Math.abs(diff * 100).toFixed(2) + "%";
    return diff >= 0 ? `Discount ${pct}` : `Premium ${pct}`;
  }, [vr?.blended?.base, priceNow]);

  const avgDiscountText = useMemo(() => {
    if (!vr?.compositeAverage || !priceNow) return "—";
    const diff = (vr.compositeAverage - priceNow) / priceNow;
    const pct = Math.abs(diff * 100).toFixed(2) + "%";
    return diff >= 0 ? `Discount ${pct}` : `Premium ${pct}`;
  }, [vr?.compositeAverage, priceNow]);

  const capLevel = priceNow ? priceNow * 5 : null;
  const isCapped = (v?: number | null) => (capLevel != null && typeof v === "number" && Math.abs(v - capLevel) < 0.005);

  return (
    <div className={styles.fvCard}>
      <div className={styles.fvHeader}>
        <h4 className={styles.fvTitle}>Fair Value (ratio-based)</h4>
        <button
          onClick={onCompute}
          disabled={!canCompute || busy}
          className={styles.viewButton}
          style={{ padding: "0.45rem 0.9rem" }}
          title={canCompute ? "Compare Fair Value with current price" : (disabledReason ?? "")}
        >
          {busy ? "Computing…" : "Compare Fair Value"}
        </button>
      </div>

      {!canCompute && <p className={styles.muted} style={{ marginTop: 4 }}>{disabledReason}</p>}

      {!vr && !err && canCompute && (
        <p className={styles.muted}>
          Uses current multiples (P/E, P/FCF, P/S, P/B) → target ranges by size band with risk downshifts & sanity caps.
        </p>
      )}

      {err ? <p className={styles.errorText}>Valuation error: {err}</p> : null}

      {vr ? (
        <>
          <p className={styles.muted} style={{ marginTop: 4 }}>
            <strong>Source:</strong> Price × (TargetMultiple / CurrentMultiple), blended across available multiples;
            targets depend on market-cap band; risk downshifts (neg. margin, low ROE, neg. growth) and a high-risk sanity cap.
          </p>

          <div className={styles.fvGrid}>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>Price (now)</div>
              <div className={styles.kpiValue}>{fmt(priceNow)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>Fair Value (base)</div>
              <div className={styles.kpiValue}>
                {fmt(vr.blended?.base ?? null)}{isCapped(vr.blended?.base) ? " (capped ×5)" : ""}
              </div>
              {vr.blended?.low != null && vr.blended?.high != null ? (
                <div className={styles.kpiSub}>
                  Low {fmt(vr.blended.low)} · High {fmt(vr.blended.high)}
                </div>
              ) : null}
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>Discount / Premium</div>
              <div className={styles.kpiValue}>{discountText}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>MoS (30%) Pass</div>
              <div className={styles.kpiValue}>
                {vr.mos?.pass == null ? "—" : vr.mos.pass ? "YES" : "NO"}
              </div>
              {vr.mos?.threshold != null && vr.blended?.base != null ? (
                <div className={styles.kpiSub}>
                  Threshold: {fmt(vr.blended.base * (1 - vr.mos.threshold))}
                </div>
              ) : null}
            </div>
          </div>

          <details className={styles.rawBlock} open>
            <summary className={styles.rawSummary}>Calculators (side-by-side)</summary>
            <div className={styles.rawTableWrap}>
              <table className={styles.metricsTable}>
                <thead>
                  <tr><th>Calculator</th><th>Low</th><th>Base</th><th>High</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {vr.altCalcs.map((c, i) => (
                    <tr key={i}>
                      <td className={styles.keyCell}>{c.label}</td>
                      <td className={styles.valCell}>{fmt(c.low ?? null)}</td>
                      <td className={styles.valCell}>
                        {fmt(c.base ?? null)}{isCapped(c.base ?? null) ? " (capped ×5)" : ""}
                      </td>
                      <td className={styles.valCell}>{fmt(c.high ?? null)}</td>
                      <td className={styles.valCell}><span className={styles.muted}>{c.source}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className={styles.fvGrid} style={{ marginTop: 8 }}>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>Composite Average (across calculators)</div>
              <div className={styles.kpiValue}>{fmt(vr.compositeAverage)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiTitle}>Discount / Premium vs Average</div>
              <div className={styles.kpiValue}>{avgDiscountText}</div>
            </div>
          </div>

          {vr.warnings?.length ? (
            <details className={styles.rawBlock} open>
              <summary className={styles.rawSummary}>Warnings & assumptions</summary>
              <ul style={{ margin: "0.25rem 0 0 1rem" }}>
                {vr.warnings.map((w, i) => <li key={i} className={styles.muted}>• {w}</li>)}
              </ul>
            </details>
          ) : null}

          {/* 🔹 Кнопка «посмотреть комментарии в ChatGPT» появляется после расчёта */}
          <GptCommentary
            symbol={symbol}
            priceNow={priceNow!}
            category={category}
            metric={metric!}
            valuation={vr}
          />
        </>
      ) : null}
    </div>
  );
};

export default FairValuePanel;
