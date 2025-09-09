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

function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h

const GptCommentary: React.FC<Props> = ({ symbol, priceNow, category, metric, valuation }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  function prettifyError(msg: string) {
    if (msg.includes("OPENAI_API_KEY not set")) {
      return "ChatGPT не настроен: добавьте OPENAI_API_KEY в переменные окружения сервера и перезапустите.";
    }
    if (/429/.test(msg) && /quota/i.test(msg)) {
      return "ChatGPT: исчерпана квота аккаунта OpenAI (нужна оплата/кредиты в Billing).";
    }
    if (/429/.test(msg)) {
      return "ChatGPT: слишком часто. Запрос ограничен со стороны сервера.";
    }
    return msg;
  }

  async function askLLM() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
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

      // sessionStorage cache (ключ совпадает по логике с сервером)
      const key = `LLM:${symbol}:${hashString(JSON.stringify({ s: symbol, p: priceNow, c: category, m: compact, v: body.valuation }))}`;
      const ss = window.sessionStorage;
      const hit = ss.getItem(key);
      if (hit) {
        const parsed = JSON.parse(hit);
        if (parsed.exp > Date.now() && parsed.text) {
          setText(parsed.text);
          setOpen(true);
          setBusy(false);
          return;
        } else {
          ss.removeItem(key);
        }
      }

      const r = await fetch("/api/llm/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const txt = await r.text().catch(() => "");
      if (!r.ok) {
        throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ""}`);
      }

      const { commentary } = JSON.parse(txt);
      const finalText = commentary || "No commentary received.";
      setText(finalText);
      ss.setItem(key, JSON.stringify({ text: finalText, exp: Date.now() + TTL_MS }));
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
