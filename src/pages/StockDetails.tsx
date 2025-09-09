import { useParams, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import styles from "./stockDetails.module.css";
import { useAppDispatch, useAppSelector } from "../store";
import { prioritizeDetailsTicker, selectSeedByTicker } from "../store/stocksSlice";
import { fetchJSON } from "../utils/http";
import { generateAutoAnalysis } from "../utils/autoAnalysis";

type MetricsResp = { symbol?: string; serverTs?: number; metric?: Record<string, any> };

type FHProfile2 = {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  phone?: string;
  shareOutstanding?: number;
  ticker?: string;
  weburl?: string;
};
type FHProfile2Resp = { symbol: string; serverTs: number; profile: FHProfile2 | null };

type AlphaOverview = {
  Symbol?: string;
  Name?: string;
  Description?: string;
  Exchange?: string;
  Currency?: string;
  Country?: string;
  Sector?: string;
  Industry?: string;
  Address?: string;
  FullTimeEmployees?: string;
  MarketCapitalization?: string;
  SharesOutstanding?: string;
  DividendYield?: string;
  PERatio?: string;
  EBITDA?: string;
  AnalystTargetPrice?: string;
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

  // seeds из списка
  const stock = useAppSelector((s) => s.stocks.items.find((it) => it.ticker === upper));
  const seedFromStore = useAppSelector(selectSeedByTicker(upper));
  const seedFromRoute = location.state?.seed;
  const priceSeed = (seedFromRoute?.price ?? seedFromStore?.price ?? stock?.price ?? null) as number | null;
  const categorySeed = (seedFromRoute?.category ?? seedFromStore?.category ?? stock?.category ?? null) as
    | "small"
    | "mid"
    | "large"
    | null;

  // Finnhub metrics (все метрики)
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Record<string, any> | null>(null);

  // Finnhub Profile 2 (free)
  const [p2Loading, setP2Loading] = useState(true);
  const [p2Error, setP2Error] = useState<string | null>(null);
  const [p2, setP2] = useState<FHProfile2 | null>(null);

  // SEC company facts (через наш backend)
  const [secFacts, setSecFacts] = useState<null | {
    cik?: string;
    entityName?: string;
    revenueUsd?: { v?: number; asOf?: string };
    netIncomeUsd?: { v?: number; asOf?: string };
    assetsUsd?: { v?: number; asOf?: string };
    liabilitiesUsd?: { v?: number; asOf?: string };
    shares?: { v?: number; asOf?: string; unit?: string };
  }>(null);
  const [secError, setSecError] = useState<string | null>(null);

  // Alpha Vantage OVERVIEW (по кнопке)
  const [avLoading, setAvLoading] = useState(false);
  const [avError, setAvError] = useState<string | null>(null);
  const [av, setAv] = useState<AlphaOverview | null>(null);

  useEffect(() => {
    if (upper) void dispatch(prioritizeDetailsTicker({ ticker: upper }));
  }, [upper, dispatch]);

  // Finnhub metrics
  useEffect(() => {
    let aborted = false;
    async function loadMetrics() {
      if (!upper) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const data = await fetchJSON<MetricsResp>(`/api/fh/metrics?symbol=${encodeURIComponent(upper)}`, {
          noStore: true,
          timeoutMs: 20000,
        });
        if (!aborted) setMetric(data?.metric ?? {});
      } catch (e: any) {
        if (!aborted) setMetricsError(String(e?.message || e));
      } finally {
        if (!aborted) setMetricsLoading(false);
      }
    }
    loadMetrics();
    return () => {
      aborted = true;
    };
  }, [upper]);

  // Finnhub Profile2
  useEffect(() => {
    let aborted = false;
    async function loadP2() {
      if (!upper) return;
      setP2Loading(true);
      setP2Error(null);
      try {
        const data = await fetchJSON<FHProfile2Resp>(`/api/fh/profile2?symbol=${encodeURIComponent(upper)}`, {
          noStore: true,
          timeoutMs: 15000,
        });
        if (!aborted) setP2(data?.profile ?? null);
      } catch (e: any) {
        if (!aborted) setP2Error(String(e?.message || e));
      } finally {
        if (!aborted) setP2Loading(false);
      }
    }
    loadP2();
    return () => {
      aborted = true;
    };
  }, [upper]);

  // SEC facts
  useEffect(() => {
    let aborted = false;
    async function loadSec() {
      if (!upper) return;
      setSecError(null);
      try {
        const d = await fetchJSON<any>(`/api/sec/company-facts?symbol=${encodeURIComponent(upper)}`, {
          noStore: true,
          timeoutMs: 20000,
        });
        if (!aborted && d) setSecFacts(d);
      } catch (e: any) {
        if (!aborted) setSecError(String(e?.message || e));
      }
    }
    try {
      loadSec();
    } catch {}
    return () => {
      aborted = true;
    };
  }, [upper]);

  // ключевые метрики из Finnhub
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
    return {
      pe,
      ps,
      pb,
      peg,
      evEbitda,
      roe,
      roic,
      grossMargin,
      netMargin,
      dToE,
      currentRatio,
      marketCap,
      shares,
    };
  }, [metric]);

  // Вспомогательные оценки (с фоллбэками, чтобы не были пустыми)
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
      n(p2?.shareOutstanding); // если Finnhub profile2 знает количество акций

    // Net Debt / EV
    let netDebt: number | null = null;
    let ev: number | null = null;

    if (totalDebt != null && totalCash != null) {
      netDebt = totalDebt - totalCash;
      if (mcap != null) ev = mcap + netDebt;
    } else if (evRaw != null && mcap != null) {
      ev = evRaw;
      netDebt = ev - mcap; // обратный расчёт
    }

    // FCF: сначала OCF - Capex; если нет, строим от P/FCF
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

  // Авто-анализ (англ.)
  const auto = useMemo(() => (metric ? generateAutoAnalysis(metric) : null), [metric]);

  // Загрузка Alpha Vantage OVERVIEW по кнопке
  const [loadedOnce, setLoadedOnce] = useState(false);
  const loadAlphaOverview = useCallback(async () => {
    if (!upper || avLoading) return;
    setAvLoading(true);
    setAvError(null);
    try {
      // ожидаем { serverTs, overview } от /api/av/overview
      const data = await fetchJSON<{ serverTs: number; overview: AlphaOverview | null }>(
        `/api/av/overview?symbol=${encodeURIComponent(upper)}`,
        { noStore: true, timeoutMs: 15000 }
      );
      setAv(data?.overview ?? null);
      setLoadedOnce(true);
    } catch (e: any) {
      setAvError(String(e?.message || e));
    } finally {
      setAvLoading(false);
    }
  }, [upper, avLoading]);

  return (
    <motion.div className={styles.wrapper} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className={styles.title}>
        {upper ? `${t("stockDetails.namePlaceholder")} (${upper})` : <Skeleton width={300} />}
      </h1>

      <div className={styles.grid}>
        {/* LEFT: Company Info + Key Metrics */}
        <div className={styles.infoCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            {p2?.logo ? <img src={p2.logo} alt="logo" style={{ width: 36, height: 36, objectFit: "contain" }} /> : null}
            <h3 style={{ margin: 0 }}>{t("stockDetails.info")}</h3>
          </div>

          <table className={styles.table}>
            <tbody>
              <tr>
                <td>
                  <strong>{t("stockDetails.ticker")}:</strong>
                </td>
                <td>{upper || <Skeleton width={80} />}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t("stockDetails.price")}:</strong>
                </td>
                <td>{priceSeed != null ? `$${fmtNum(priceSeed)}` : <Skeleton width={60} />}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t("stockDetails.category")}:</strong>
                </td>
                <td>{categorySeed ? prettyCategory(categorySeed) : <Skeleton width={90} />}</td>
              </tr>

              {/* Finnhub Profile2: базовые сведения */}
              {p2Loading ? (
                <>
                  <tr>
                    <td colSpan={2}>
                      <Skeleton height={12} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      <Skeleton height={12} />
                    </td>
                  </tr>
                </>
              ) : p2Error ? (
                <tr>
                  <td colSpan={2} className={styles.errorText}>
                    FH Profile2 error: {p2Error}
                  </td>
                </tr>
              ) : p2 ? (
                <>
                  {p2.name && (
                    <tr>
                      <td>
                        <strong>Name:</strong>
                      </td>
                      <td>{p2.name}</td>
                    </tr>
                  )}
                  {p2.finnhubIndustry && (
                    <tr>
                      <td>
                        <strong>Industry:</strong>
                      </td>
                      <td>{p2.finnhubIndustry}</td>
                    </tr>
                  )}
                  {(p2.exchange || p2.country) && (
                    <tr>
                      <td>
                        <strong>Listing:</strong>
                      </td>
                      <td>{[p2.exchange, p2.country].filter(Boolean).join(", ")}</td>
                    </tr>
                  )}
                  {p2.ipo && (
                    <tr>
                      <td>
                        <strong>IPO:</strong>
                      </td>
                      <td>{p2.ipo}</td>
                    </tr>
                  )}
                  {typeof p2.marketCapitalization === "number" && (
                    <tr>
                      <td>
                        <strong>Market Cap (FH):</strong>
                      </td>
                      <td>${toUSD(p2.marketCapitalization)}</td>
                    </tr>
                  )}
                  {typeof p2.shareOutstanding === "number" && (
                    <tr>
                      <td>
                        <strong>Shares Out:</strong>
                      </td>
                      <td>{toUSD(p2.shareOutstanding)}</td>
                    </tr>
                  )}
                  {p2.weburl && (
                    <tr>
                      <td>
                        <strong>Website:</strong>
                      </td>
                      <td>
                        <a href={p2.weburl} target="_blank" rel="noreferrer noopener">
                          {p2.weburl}
                        </a>
                      </td>
                    </tr>
                  )}
                </>
              ) : null}

              {/* SEC snapshot */}
              {secError ? (
                <tr>
                  <td colSpan={2} className={styles.errorText}>
                    SEC error: {secError}
                  </td>
                </tr>
              ) : secFacts ? (
                <>
                  {(secFacts.entityName || secFacts.cik) && (
                    <tr>
                      <td>
                        <strong>SEC Entity:</strong>
                      </td>
                      <td>
                        {[secFacts.entityName, secFacts.cik ? `CIK ${secFacts.cik}` : ""]
                          .filter(Boolean)
                          .join(" — ")}
                      </td>
                    </tr>
                  )}
                  {secFacts.revenueUsd?.v != null && (
                    <tr>
                      <td>
                        <strong>Revenue (US-GAAP):</strong>
                      </td>
                      <td>
                        ${toUSD(secFacts.revenueUsd.v)}
                        {secFacts.revenueUsd.asOf ? ` (as of ${secFacts.revenueUsd.asOf})` : ""} [USD]
                      </td>
                    </tr>
                  )}
                  {secFacts.netIncomeUsd?.v != null && (
                    <tr>
                      <td>
                        <strong>Net Income (US-GAAP):</strong>
                      </td>
                      <td>
                        ${toUSD(secFacts.netIncomeUsd.v)}
                        {secFacts.netIncomeUsd.asOf ? ` (as of ${secFacts.netIncomeUsd.asOf})` : ""} [USD]
                      </td>
                    </tr>
                  )}
                  {secFacts.assetsUsd?.v != null && (
                    <tr>
                      <td>
                        <strong>Assets (US-GAAP):</strong>
                      </td>
                      <td>
                        ${toUSD(secFacts.assetsUsd.v)}
                        {secFacts.assetsUsd.asOf ? ` (as of ${secFacts.assetsUsd.asOf})` : ""} [USD]
                      </td>
                    </tr>
                  )}
                  {secFacts.liabilitiesUsd?.v != null && (
                    <tr>
                      <td>
                        <strong>Liabilities (US-GAAP):</strong>
                      </td>
                      <td>
                        ${toUSD(secFacts.liabilitiesUsd.v)}
                        {secFacts.liabilitiesUsd.asOf ? ` (as of ${secFacts.liabilitiesUsd.asOf})` : ""} [USD]
                      </td>
                    </tr>
                  )}
                  {secFacts.shares?.v != null && (
                    <tr>
                      <td>
                        <strong>Shares (US-GAAP):</strong>
                      </td>
                      <td>
                        ${toUSD(secFacts.shares.v)}
                        {secFacts.shares.asOf ? ` (as of ${secFacts.shares.asOf})` : ""} [{secFacts.shares.unit || "shares"}]
                      </td>
                    </tr>
                  )}
                </>
              ) : null}

              <tr>
                <td colSpan={2} className={styles.subhead}>
                  Key metrics (Finnhub)
                </td>
              </tr>

              {metricsLoading && (
                <>
                  <tr>
                    <td colSpan={2}>
                      <Skeleton height={14} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      <Skeleton height={14} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      <Skeleton height={14} />
                    </td>
                  </tr>
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
                  <tr>
                    <td>P/E (TTM):</td>
                    <td>{key.pe != null ? fmtNum(key.pe) : "—"}</td>
                  </tr>
                  <tr>
                    <td>P/S (TTM):</td>
                    <td>{key.ps != null ? fmtNum(key.ps) : "—"}</td>
                  </tr>
                  <tr>
                    <td>P/B:</td>
                    <td>{key.pb != null ? fmtNum(key.pb) : "—"}</td>
                  </tr>
                  <tr>
                    <td>PEG:</td>
                    <td>{key.peg != null ? fmtNum(key.peg) : "—"}</td>
                  </tr>
                  <tr>
                    <td>EV/EBITDA:</td>
                    <td>{key.evEbitda != null ? fmtNum(key.evEbitda) : "—"}</td>
                  </tr>
                  <tr>
                    <td>ROE (TTM):</td>
                    <td>{key.roe != null ? fmtNum(key.roe) : "—"}</td>
                  </tr>
                  <tr>
                    <td>ROIC (TTM):</td>
                    <td>{key.roic != null ? fmtNum(key.roic) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Gross Margin (TTM):</td>
                    <td>{key.grossMargin != null ? fmtNum(key.grossMargin) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Net Margin (TTM):</td>
                    <td>{key.netMargin != null ? fmtNum(key.netMargin) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Debt / Equity:</td>
                    <td>{key.dToE != null ? fmtNum(key.dToE) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Current Ratio:</td>
                    <td>{key.currentRatio != null ? fmtNum(key.currentRatio) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Market Cap:</td>
                    <td>{key.marketCap != null ? "$" + toUSD(key.marketCap) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Shares (Basic):</td>
                    <td>{key.shares != null ? toUSD(key.shares) : "—"}</td>
                  </tr>

                  {/* Valuation helpers (computed with fallbacks) */}
                  <tr>
                    <td colSpan={2} className={styles.subhead}>
                      Valuation helpers
                    </td>
                  </tr>
                  <tr>
                    <td>Net Debt:</td>
                    <td>{helpers.netDebt != null ? "$" + toUSD(helpers.netDebt) : "—"}</td>
                  </tr>
                  <tr>
                    <td>Enterprise Value (EV):</td>
                    <td>{helpers.ev != null ? "$" + toUSD(helpers.ev) : "—"}</td>
                  </tr>
                  <tr>
                    <td>FCF (TTM):</td>
                    <td>{helpers.fcf != null ? "$" + toUSD(helpers.fcf) : "—"}</td>
                  </tr>
                  <tr>
                    <td>FCF Yield (TTM):</td>
                    <td>{helpers.fcfYield != null ? (helpers.fcfYield * 100).toFixed(2) + "%" : "—"}</td>
                  </tr>
                  <tr>
                    <td>EV / FCF (TTM):</td>
                    <td>{helpers.evPerFcf != null ? fmtNum(helpers.evPerFcf) : "—"}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* Raw metrics */}
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
                          <td className={styles.valCell}>{typeof v === "number" ? fmtNum(v) : String(v)}</td>
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
            <div className={styles.chartPlaceholder}>({t("stockDetails.chartPlaceholder")})</div>
          )}
        </div>
      </div>

      {/* ABOUT: Auto + SEC + FH Profile + Alpha Vantage button at bottom */}
      <div className={styles.aboutCard}>
        <h3>About the Company</h3>

        {/* Текст: если уже загрузили AV — берём длинное описание */}
        {avLoading ? (
          <Skeleton count={3} />
        ) : avError ? (
          <p className={styles.errorText}>Alpha Vantage error: {avError}</p>
        ) : av?.Description ? (
          <p>{av.Description.length > 900 ? av.Description.slice(0, 900).trim() + "…" : av.Description}</p>
        ) : (
          <p style={{ opacity: 0.8 }}>{loadedOnce ? "No long description available." : "No long description loaded yet."}</p>
        )}

        {/* Авто-анализ */}
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

        {/* Нижняя панель: кнопка AV + лимит */}
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={loadAlphaOverview}
            disabled={avLoading}
            className={styles.viewButton}
            style={{ padding: "0.5rem 0.9rem" }}
            title="Load Alpha Vantage OVERVIEW (limited calls on free plan)"
          >
            {avLoading ? "Loading…" : "Load Alpha Vantage overview"}
          </button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Free plan limit ~25 calls/day. Use sparingly; data is cached by our backend.
          </span>
        </div>
      </div>
    </motion.div>
  );
};
