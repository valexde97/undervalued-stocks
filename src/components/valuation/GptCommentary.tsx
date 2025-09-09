// src/components/valuation/GptCommentary.tsx
import React, { useState } from "react";
import styles from "../../pages/stockDetails.module.css";

type Props = {
  symbol: string;
  priceNow: number;
  category: "small" | "mid" | "large" | null;
  metric: Record<string, any>;
  valuation: {
    blended: { low: number | null; base: number | null; high: number | null } | null;
    altCalcs: Array<{ label: string; low?: number | null; base?: number | null; high?: number | null }>;
    warnings: string[];
    compositeAverage: number | null;
  };
};

const GptCommentary: React.FC<Props> = ({ symbol, priceNow, category, metric, valuation }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  function prettifyError(msg: string) {
  if (msg.includes("OPENAI_API_KEY not set")) {
    return "ChatGPT не настроен: добавьте OPENAI_API_KEY в переменные окружения сервера и перезапустите.";
  }
  return msg;
}


  async function askLLM() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      // Компактные метрики, чтобы не слать гигабайты
      const m = metric || {};
      const compact = {
        pe: m.peTTM ?? m.peInclExtraTTM ?? m.peExclExtraTTM ?? null,
        pfcf: m.pfcfShareTTM ?? m.pfcfShareAnnual ?? null,
        ps: m.psTTM ?? m.psAnnual ?? null,
        pb: m.pb ?? m.ptbvQuarterly ?? m.ptbvAnnual ?? null,
        grossMargin: m.grossMarginTTM ?? null,
        netMargin: m.netProfitMarginTTM ?? null,
        roe: m.roeTTM ?? null,
        roic: m.roicTTM ?? null,
        revGyoy: m.revenueGrowthTTMYoy ?? null,
        beta: m.beta ?? null,
        debtToEquity: m.debtToEquityTTM ?? m.debtToEquityAnnual ?? null,
        currentRatio: m.currentRatioTTM ?? m.currentRatioAnnual ?? null,
      };

      const body = {
        symbol,
        priceNow,
        category,
        metric: compact,
        valuation: {
          blended: valuation.blended,
          compositeAverage: valuation.compositeAverage,
          altCalcs: valuation.altCalcs.map(a => ({
            label: a.label,
            low: a.low ?? null,
            base: a.base ?? null,
            high: a.high ?? null,
          })),
          warnings: valuation.warnings,
        },
      };

      const r = await fetch("/api/llm/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}`);
      }

      const { commentary } = await r.json();
      setText(commentary || "No commentary received.");
      setOpen(true);
    } catch (e: any) {
      setError(prettifyError(String(e?.message || e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        className={styles.viewButton}
        style={{ padding: "0.45rem 0.9rem" }}
        onClick={askLLM}
        disabled={busy}
        title="Отправить текущие метрики и оценки в ChatGPT для комментария"
      >
        {busy ? "Asking ChatGPT…" : "Show ChatGPT commentary"}
      </button>

      {error ? (
        <p className={styles.errorText} style={{ marginTop: 8 }}>
          ChatGPT error: {error}
        </p>
      ) : null}

      {open && text ? (
        <div className={styles.rawTableWrap} style={{ marginTop: 8, padding: 12 }}>
          <div className={styles.muted} style={{ marginBottom: 6 }}>
            AI commentary (not investment advice):
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{text}</div>
        </div>
      ) : null}
    </div>
  );
};

export default GptCommentary;
