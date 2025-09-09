// src/components/stock/AboutSection.tsx
import React from "react";
import styles from "../../pages/stockDetails.module.css";
import { generateAutoAnalysis } from "../../utils/autoAnalysis";
import FairValuePanel from "../valuation/FairValuePanel";

type Props = {
  symbol: string;
  metric: Record<string, any> | null;
  metricsLoading?: boolean;
  priceSeed?: number | null;
};

const AboutSection: React.FC<Props> = ({ symbol, metric, metricsLoading, priceSeed }) => {
  const auto = metric ? generateAutoAnalysis(metric) : null;

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

      {/* Fair Value + кнопка ChatGPT живут в отдельной панели */}
      <FairValuePanel symbol={symbol} metric={metric} metricsLoading={metricsLoading} priceSeed={priceSeed} />
    </div>
  );
};

export default AboutSection;
