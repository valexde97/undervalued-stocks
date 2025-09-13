import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import styles from "./about.module.css";

const version =
  (import.meta as any)?.env?.VITE_APP_VERSION ||
  ""; // опционально: можешь завести VITE_APP_VERSION, иначе бейдж версии просто не покажем

export const About = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      className={styles.aboutWrapper}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={styles.container}>
        {/* Hero */}
        <header className={styles.hero}>
          <h1 className={styles.title}>
            {t("aboutPage.title", "About Undervalued Stocks App")}
          </h1>
          <p className={styles.lead}>
            {t(
              "aboutPage.lead",
              "A research-first frontend to surface potentially undervalued stocks. We use open/public APIs only and respect their terms."
            )}
          </p>
          <div className={styles.metaRow}>
            <span className={styles.badge}>
              {t("aboutPage.meta.frontendOnly", "Frontend-only build")}
            </span>
            {version ? (
              <>
                <span className={styles.dot}>•</span>
                <span className={styles.badge}>
                  {t("aboutPage.meta.version", "Version")} {version}
                </span>
              </>
            ) : null}
          </div>
        </header>

        {/* Что уже умеет */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("aboutPage.features.title", "What’s included now")}
          </h2>
          <div className={styles.grid}>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.finvizTitle", "Finviz-first cards")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.finvizText",
                  "Home shows stocks from Finviz screening. Cards render instantly with lightweight fields."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.prefetchTitle", "Background prefetch (up to 200)")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.prefetchText",
                  "After a page loads, we progressively prefetch next pages in the background until ~200 tickers are ready."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.detailsTitle", "On-demand details")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.detailsText",
                  "“View Details” pulls live quotes and a lightweight profile on demand."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.newsTitle", "News & Market context")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.newsText",
                  "Compact news column plus a side panel: Top Gainers when the market is open, a market-closed card otherwise."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.favTitle", "Favorites")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.favText",
                  "Star tickers to keep them handy while browsing multiple pages."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.features.uiTitle", "Clean UI & performance")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.features.uiText",
                  "Modern grid, skeletons for instant feedback, memoized cards, and gentle animations."
                )}
              </p>
            </article>
          </div>
        </section>

        {/* Источники и API */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("aboutPage.sources.title", "APIs & Data Sources")}
          </h2>

          <div className={styles.sources}>
            <div className={styles.sourceItem}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceName}>Finviz</span>
                <span className={styles.sourceType}>
                  {t("aboutPage.sources.finviz.type", "Screener / listings")}
                </span>
              </div>
              <p className={styles.sourceText}>
                {t(
                  "aboutPage.sources.finviz.text",
                  "Primary source for the home-page universe and initial card fields (tickers, names, basic attributes)."
                )}
              </p>
            </div>

            <div className={styles.sourceItem}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceName}>Finnhub</span>
                <span className={styles.sourceType}>
                  {t("aboutPage.sources.finnhub.type", "Profiles, quotes, search")}
                </span>
              </div>
              <p className={styles.sourceText}>
                {t(
                  "aboutPage.sources.finnhub.text",
                  "Used for live quotes, lightweight profiles, and universal search by ticker/company."
                )}
              </p>
            </div>

            <div className={styles.sourceItem}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceName}>SEC EDGAR</span>
                <span className={styles.sourceType}>
                  {t("aboutPage.sources.sec.type", "Public filings")}
                </span>
              </div>
              <p className={styles.sourceText}>
                {t(
                  "aboutPage.sources.sec.text",
                  "Public US filings accessed programmatically for factual checkpoints where applicable."
                )}
              </p>
            </div>

            <div className={styles.sourceItem}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceName}>
                  {t("aboutPage.sources.candles.name", "Price candles (fallback chain)")}
                </span>
                <span className={styles.sourceType}>
                  {t(
                    "aboutPage.sources.candles.type",
                    "Finnhub → Alpha Vantage → Yahoo → Stooq"
                  )}
                </span>
              </div>
              <p className={styles.sourceText}>
                {t(
                  "aboutPage.sources.candles.text",
                  "Historical OHLC retrieval uses a resilient chain to avoid hard failures; falls back safely."
                )}
              </p>
            </div>
          </div>

          <div className={styles.note}>
            {t(
              "aboutPage.sources.note",
              "We use only open/public endpoints and do not redistribute proprietary content. All trademarks belong to their owners."
            )}
          </div>
        </section>

        {/* Legal / Compliance */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("aboutPage.legal.title", "Legal & Compliance")}
          </h2>
          <ul className={styles.list}>
            <li>
              <strong>{t("aboutPage.legal.openStrong", "Open sources only.")}</strong>{" "}
              {t(
                "aboutPage.legal.openText",
                "We fetch data from publicly available APIs and respect each provider’s terms and fair-use limits."
              )}
            </li>
            <li>
              <strong>
                {t("aboutPage.legal.copyrightStrong", "No copyrighted redistribution.")}
              </strong>{" "}
              {t(
                "aboutPage.legal.copyrightText",
                "We don’t mirror, sell, or republish proprietary data; caches are transient and UX-bound."
              )}
            </li>
            <li>
              <strong>{t("aboutPage.legal.naStrong", "Not investment advice.")}</strong>{" "}
              {t(
                "aboutPage.legal.naText",
                "The app is for research/education only and does not constitute financial advice."
              )}
            </li>
            <li>
              <strong>{t("aboutPage.legal.attrStrong", "Attribution.")}</strong>{" "}
              {t(
                "aboutPage.legal.attrText",
                "Company names, tickers, logos, and marks are used nominatively to identify securities and sources."
              )}
            </li>
            <li>
              <strong>{t("aboutPage.legal.privacyStrong", "Privacy.")}</strong>{" "}
              {t(
                "aboutPage.legal.privacyText",
                "We don’t collect personal financial data. API keys live in environment variables."
              )}
            </li>
          </ul>
        </section>

        {/* Roadmap */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("aboutPage.roadmap.title", "Roadmap snapshot")}
          </h2>
          <div className={styles.grid}>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.roadmap.filtersTitle", "Filter panel & search UX")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.roadmap.filtersText",
                  "Advanced filters, saved views, and richer symbol suggestions."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.roadmap.detailsTitle", "Details page expansions")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.roadmap.detailsText",
                  "More fundamentals, risk flags, blended fair-value heuristics."
                )}
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>
                {t("aboutPage.roadmap.perfTitle", "Performance & caching")}
              </h3>
              <p className={styles.cardText}>
                {t(
                  "aboutPage.roadmap.perfText",
                  "Prefetch tuning, smarter concurrency, and graceful back-offs."
                )}
              </p>
            </article>
          </div>
        </section>

        {/* Tech stack */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("aboutPage.stack.title", "Tech stack")}
          </h2>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>React + TypeScript</span>
            <span className={styles.badge}>Vite</span>
            <span className={styles.badge}>Redux Toolkit</span>
            <span className={styles.badge}>CSS Modules</span>
            <span className={styles.badge}>Framer Motion</span>
            <span className={styles.badge}>Vercel</span>
          </div>
        </section>

        {/* Footer note */}
        <footer className={styles.footer}>
          <span>
            {t(
              "aboutPage.footer",
              "Have ideas or found an issue? We’d love your feedback."
            )}
          </span>
        </footer>
      </div>
    </motion.div>
  );
};

export default About;
