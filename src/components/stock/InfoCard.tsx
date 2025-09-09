import React, { useMemo } from "react";
import Skeleton from "react-loading-skeleton";
import styles from "../../pages/stockDetails.module.css";
import { useTranslation } from "react-i18next";
import type { FHProfile2 } from "../hooks/useFinnhubProfile2";
import type { SecFacts } from "../hooks/useSecFacts";

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

type Props = {
  symbol: string;
  priceSeed: number | null;
  categorySeed: "small" | "mid" | "large" | null;

  metric: Record<string, any> | null;
  metricsLoading: boolean;
  metricsError: string | null;

  p2: FHProfile2 | null;
  p2Loading: boolean;
  p2Error: string | null;

  secFacts: SecFacts;
  secError: string | null;
};

const InfoCard: React.FC<Props> = ({
  symbol, priceSeed, categorySeed,
  metric, metricsLoading, metricsError,
  p2, p2Loading, p2Error,
  secFacts, secError
}) => {
  const { t } = useTranslation();

  // ключевые
  const key = useMemo(() => {
    const m = metric || {};
    const pe = getFirst(m, ["peTTM","peInclExtraTTM","peExclExtraTTM","peAnnual","peBasicExclExtraTTM"]);
    const ps = getFirst(m, ["psTTM","psAnnual"]);
    const pb = getFirst(m, ["pb","priceToBookAnnual"]);
    const peg = getFirst(m, ["pegAnnual","pegRatio"]);
    const evEbitda = getFirst(m, ["enterpriseValueOverEBITDA","evebitdaAnnual"]);
    const roe = getFirst(m, ["roeTTM","roeAnnual"]);
    const roic = getFirst(m, ["roicTTM","roicAnnual"]);
    const grossMargin = getFirst(m, ["grossMarginTTM","grossMarginAnnual"]);
    const netMargin = getFirst(m, ["netProfitMarginTTM","netMarginAnnual"]);
    const dToE = getFirst(m, ["debtToEquityAnnual","debtToEquityTTM"]);
    const currentRatio = getFirst(m, ["currentRatioAnnual","currentRatioTTM"]);
    const marketCap = getFirst(m, ["marketCapitalization"]);
    const shares = getFirst(m, ["sharesBasic"]);
    return { pe, ps, pb, peg, evEbitda, roe, roic, grossMargin, netMargin, dToE, currentRatio, marketCap, shares };
  }, [metric]);

  // valuation helpers с фоллбэками
  const helpers = useMemo(() => {
    const m = metric || {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);

    const mcap = n(m.marketCapitalization ?? key.marketCap);
    const evRaw = n(m.enterpriseValue);

    const totalDebt = n(m.totalDebt);
    const totalCash = n(m.totalCash ?? m.totalCashAndEquivalents ?? (m as any)?.cashAndEq);

    const ocf = n(m.operatingCashFlowTTM ?? (m as any)?.operatingCfTTM);
    const capex = n(m.capitalExpenditureTTM ?? (m as any)?.capexTTM);

    const pfcf = n((m as any)?.pfcfShareTTM ?? (m as any)?.pfcfShareAnnual);
    const price = typeof priceSeed === "number" && Number.isFinite(priceSeed) ? priceSeed : null;
    const shares =
      n(key.shares) ??
      n(p2?.shareOutstanding);

    // NetDebt/EV
    let netDebt: number | null = null;
    let ev: number | null = null;

    if (totalDebt != null && totalCash != null) {
      netDebt = totalDebt - totalCash;
      if (mcap != null) ev = mcap + netDebt;
    } else if (evRaw != null && mcap != null) {
      ev = evRaw;
      netDebt = ev - mcap;
    }

    // FCF
    let fcf: number | null = null;
    if (ocf != null && capex != null) {
      fcf = ocf - capex;
    } else if (price != null && pfcf != null && pfcf > 0 && shares != null && shares > 0) {
      const fcfPerShare = price / pfcf;
      fcf = fcfPerShare * shares;
    }

    const fcfYield = fcf != null && mcap != null && mcap > 0 ? fcf / mcap : null;
    const evPerFcf = fcf != null && fcf !== 0 && ev != null ? ev / fcf : null;

    return { netDebt, ev, fcf, fcfYield, evPerFcf };
  }, [metric, key.marketCap, key.shares, p2?.shareOutstanding, priceSeed]);

  // Fallback для имени, если Finnhub недоступен — берём из SEC
  const fallbackName = secFacts?.entityName || null;

  return (
    <div className={styles.infoCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {p2?.logo ? <img src={p2.logo} alt="logo" style={{ width: 36, height: 36, objectFit: "contain" }} /> : null}
        <h3 style={{ margin: 0 }}>{t("stockDetails.info")}</h3>
      </div>

      <table className={styles.table}>
        <tbody>
          <tr><td><strong>{t("stockDetails.ticker")}:</strong></td><td>{symbol}</td></tr>
          {/* Если Finnhub ещё не дал name — покажем из SEC */}
          {!p2Loading && !p2 && fallbackName ? (
            <tr><td><strong>Name:</strong></td><td>{fallbackName}</td></tr>
          ) : null}
          <tr><td><strong>{t("stockDetails.price")}:</strong></td><td>{priceSeed != null ? `$${fmtNum(priceSeed)}` : "—"}</td></tr>
          <tr><td><strong>{t("stockDetails.category")}:</strong></td><td>{categorySeed ? prettyCategory(categorySeed) : "—"}</td></tr>

          {/* Finnhub Profile2 */}
          {p2Loading ? (
            <>
              <tr><td colSpan={2}><Skeleton height={12} /></td></tr>
              <tr><td colSpan={2}><Skeleton height={12} /></td></tr>
            </>
          ) : p2Error ? (
            <tr><td colSpan={2} className={styles.errorText}>FH Profile2 error: {p2Error}</td></tr>
          ) : p2 ? (
            <>
              {p2.name && (<tr><td><strong>Name:</strong></td><td>{p2.name}</td></tr>)}
              {p2.finnhubIndustry && (<tr><td><strong>Industry:</strong></td><td>{p2.finnhubIndustry}</td></tr>)}
              {(p2.exchange || p2.country) && (<tr><td><strong>Listing:</strong></td><td>{[p2.exchange, p2.country].filter(Boolean).join(", ")}</td></tr>)}
              {p2.ipo && (<tr><td><strong>IPO:</strong></td><td>{p2.ipo}</td></tr>)}
              {typeof p2.marketCapitalization === "number" && (<tr><td><strong>Market Cap (FH):</strong></td><td>${toUSD(p2.marketCapitalization)}</td></tr>)}
              {typeof p2.shareOutstanding === "number" && (<tr><td><strong>Shares Out:</strong></td><td>{toUSD(p2.shareOutstanding)}</td></tr>)}
              {p2.weburl && (<tr><td><strong>Website:</strong></td><td><a href={p2.weburl} target="_blank" rel="noreferrer noopener">{p2.weburl}</a></td></tr>)}
            </>
          ) : null}

          {/* SEC snapshot */}
          {secError ? (
            <tr><td colSpan={2} className={styles.errorText}>SEC error: {secError}</td></tr>
          ) : secFacts ? (
            <>
              {(secFacts.entityName || secFacts.cik) && (
                <tr>
                  <td><strong>SEC Entity:</strong></td>
                  <td>{[secFacts.entityName, secFacts.cik ? `CIK ${secFacts.cik}` : ""].filter(Boolean).join(" — ")}</td>
                </tr>
              )}
              {secFacts.revenueUsd?.v != null && (
                <tr><td><strong>Revenue (US-GAAP):</strong></td>
                  <td>${toUSD(secFacts.revenueUsd.v)}{secFacts.revenueUsd.asOf ? ` (as of ${secFacts.revenueUsd.asOf})` : ""} [USD]</td>
                </tr>
              )}
              {secFacts.netIncomeUsd?.v != null && (
                <tr><td><strong>Net Income (US-GAAP):</strong></td>
                  <td>${toUSD(secFacts.netIncomeUsd.v)}{secFacts.netIncomeUsd.asOf ? ` (as of ${secFacts.netIncomeUsd.asOf})` : ""} [USD]</td>
                </tr>
              )}
              {secFacts.assetsUsd?.v != null && (
                <tr><td><strong>Assets (US-GAAP):</strong></td>
                  <td>${toUSD(secFacts.assetsUsd.v)}{secFacts.assetsUsd.asOf ? ` (as of ${secFacts.assetsUsd.asOf})` : ""} [USD]</td>
                </tr>
              )}
              {secFacts.liabilitiesUsd?.v != null && (
                <tr><td><strong>Liabilities (US-GAAP):</strong></td>
                  <td>${toUSD(secFacts.liabilitiesUsd.v)}{secFacts.liabilitiesUsd.asOf ? ` (as of ${secFacts.liabilitiesUsd.asOf})` : ""} [USD]</td>
                </tr>
              )}
              {secFacts.shares?.v != null && (
                <tr><td><strong>Shares (US-GAAP):</strong></td>
                  <td>${toUSD(secFacts.shares.v)}{secFacts.shares.asOf ? ` (as of ${secFacts.shares.asOf})` : ""} [{secFacts.shares.unit || "shares"}]</td>
                </tr>
              )}
            </>
          ) : null}

          <tr><td colSpan={2} className={styles.subhead}>Key metrics (Finnhub)</td></tr>

          {metricsLoading ? (
            <>
              <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
              <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
              <tr><td colSpan={2}><Skeleton height={14} /></td></tr>
            </>
          ) : metricsError ? (
            <tr><td colSpan={2} className={styles.errorText}>Finnhub error: {metricsError}</td></tr>
          ) : (
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

              <tr><td colSpan={2} className={styles.subhead}>Valuation helpers</td></tr>
              <tr><td>Net Debt:</td><td>{helpers.netDebt != null ? "$" + toUSD(helpers.netDebt) : "—"}</td></tr>
              <tr><td>Enterprise Value (EV):</td><td>{helpers.ev != null ? "$" + toUSD(helpers.ev) : "—"}</td></tr>
              <tr><td>FCF (TTM):</td><td>{helpers.fcf != null ? "$" + toUSD(helpers.fcf) : "—"}</td></tr>
              <tr><td>FCF Yield (TTM):</td><td>{helpers.fcfYield != null ? (helpers.fcfYield * 100).toFixed(2) + "%" : "—"}</td></tr>
              <tr><td>EV / FCF (TTM):</td><td>{helpers.evPerFcf != null ? fmtNum(helpers.evPerFcf) : "—"}</td></tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default InfoCard;
