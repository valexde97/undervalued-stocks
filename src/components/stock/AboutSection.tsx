// src/components/stock/AboutSection.tsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import styles from "../../pages/stockDetails.module.css";
import { generateAutoAnalysis } from "../../utils/autoAnalysis";
import { useAppSelector } from "../../store";
import { selectSeedByTicker } from "../../store/stocksSlice";
import { computeValuation, type ValuationResult } from "../../lib/valuation";
import { fetchJSON } from "../../utils/http";

type Props = {
  symbol: string;                               // UPPER в родителе
  metric: Record<string, any> | null;
  metricsLoading?: boolean;
  priceSeed?: number | null;                     // 🔹 добавили
};

function fmt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

type SnapItem = { price?: number | null; prevClose?: number | null; open?: number | null; high?: number | null; low?: number | null; };
type SnapResp = { items?: SnapItem[] };

const AboutSection: React.FC<Props> = ({ symbol, metric, metricsLoading, priceSeed }) => {
  const upper = (symbol || "").toUpperCase();
  const stock = useAppSelector((s) => s.stocks.items.find((it) => it.ticker === upper));
  const seed = useAppSelector(selectSeedByTicker(upper));

  const auto = metric ? generateAutoAnalysis(metric) : null;

  // локальный фоллбэк цены (если ничего нет в сторе/сиде)
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Собираем кандидатов на цену
  const priceNow = useMemo(() => {
    const candidates = [
      fallbackPrice,
      priceSeed,
      seed?.price,
      stock?.price,
      (stock as any)?.prevClose,
      (stock as any)?.open,
      (stock as any)?.high,
      (stock as any)?.low,
    ];
    for (const x of candidates) {
      if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
    }
    return null;
  }, [
    fallbackPrice,
    priceSeed,
    seed?.price,
    stock?.price,
    (stock as any)?.prevClose,
    (stock as any)?.open,
    (stock as any)?.high,
    (stock as any)?.low,
  ]);

  // если цены нет — один раз подтянем быстрый снапшот с бэка
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (priceNow != null || fetchingPrice || !upper) return;
      try {
        setFetchingPrice(true);
        const r = await fetchJSON<SnapResp>(`/api/fh/snapshot-batch?symbols=${encodeURIComponent(upper)}`, {
          noStore: true, timeoutMs: 12000,
        });
        const it = r?.items?.[0] || {};
        const cand = [it.price, it.prevClose, it.open, it.high, it.low].find(
          (v) => typeof v === "number" && Number.isFinite(v) && (v as number) > 0
        ) as number | undefined;
        if (!ignore && typeof cand === "number") setFallbackPrice(cand);
      } catch {
        // тихо игнорим — кнопка останется неактивной до появления цены из стора
      } finally {
        if (!ignore) setFetchingPrice(false);
      }
    })();
    return () => { ignore = true; };
  }, [priceNow, fetchingPrice, upper]);

  // категория для таргетов
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
    setBusy(true);
    setErr(null);
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

  return (
    <div className={styles.aboutCard}>
      <h3>About the Company</h3>
      <p style={{ opacity: 0.8 }}>No long description available.</p>

      {auto ? (
        <div style={{ marginTop: "0.5rem" }}>
          {!!auto.strengths.length && (
            <ul style={{ margin: "0.25rem 0" }}>
              {auto.strengths.map((s, i) => <li key={"s"+i}>✅ {s}</li>)}
            </ul>
          )}
          {!!auto.risks.length && (
            <ul style={{ margin: "0.25rem 0" }}>
              {auto.risks.map((r, i) => <li key={"r"+i}>⚠️ {r}</li>)}
            </ul>
          )}
          {!!auto.notes.length && <p style={{ marginTop: 6 }}>{auto.notes.join(" ")}</p>}
        </div>
      ) : null}

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

        {!canCompute && (
          <p className={styles.muted} style={{ marginTop: 4 }}>
            {disabledReason}
          </p>
        )}

        {!vr && !err && canCompute && (
          <p className={styles.muted}>
            Uses current multiples (P/E, P/FCF, P/S, P/B) → target ranges by size band with risk downshifts & sanity caps.
          </p>
        )}

        {err ? <p className={styles.errorText}>Valuation error: {err}</p> : null}

        {vr ? (
          <>
            <p className={styles.muted} style={{ marginTop: 4 }}>
              <strong>Source:</strong> Price × (TargetMultiple / CurrentMultiple), blended across available
              multiples; targets depend on market-cap band; risk downshifts (neg. margin, low ROE, neg. growth)
              and a high-risk sanity cap.
            </p>

            <div className={styles.fvGrid}>
              <div className={styles.kpi}>
                <div className={styles.kpiTitle}>Price (now)</div>
                <div className={styles.kpiValue}>{fmt(priceNow)}</div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiTitle}>Fair Value (base)</div>
                <div className={styles.kpiValue}>{fmt(vr.blended?.base ?? null)}</div>
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
                        <td className={styles.valCell}>{fmt(c.base ?? null)}</td>
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
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AboutSection;
