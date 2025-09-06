import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { fetchJSON } from "../utils/http";
import styles from "./topGainers.module.css";

type Gainer = {
  ticker: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  changePct: number | null;
  marketCapText: string | null;
  pe: number | null;
};

type ApiResp = { mode: "topgainers"; limit: number; count: number; items: Gainer[] };

function fmtPrice(p: number | null | undefined) {
  return p != null && Number.isFinite(p) ? `$${p.toFixed(2)}` : "—";
}
function fmtCap(s: string | null | undefined) {
  return s && s !== "-" ? s : "—";
}
function rankLabel(i: number) {
  return i === 0 ? "#1" : i === 1 ? "#2" : "#3";
}

export default function TopGainers() {
  const [data, setData] = useState<Gainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJSON<ApiResp>(`/api/finviz.ts?mode=topgainers&limit=3`, { timeoutMs: 12000 })
      .then(r => { if (alive) setData(r.items || []); })
      .catch(err => { if (alive) setError(String(err?.message || err)); });
    return () => { alive = false; };
  }, []);

  const top = useMemo(() => (data ?? []).slice(0, 3), [data]);

  return (
    <div className={styles.wrap} data-layout="vertical">
      <div className={styles.header}>Top gainers</div>

      {error && <div className={styles.empty}>Failed to load: {error}</div>}
      {!error && data === null && (
        <div className={styles.skelList}>
          <div className={styles.skelCard} />
          <div className={styles.skelCard} />
          <div className={styles.skelCard} />
        </div>
      )}

      {!error && data && top.length === 0 && (
        <div className={styles.empty}>No intraday leaders yet.</div>
      )}

      {!error && top.length > 0 && (
        <div className={styles.list}>
          {top.map((s, i) => (
            <article key={s.ticker} className={`${styles.card} ${i === 0 ? styles.first : ""}`}>
              <div className={styles.rowHead}>
                <span className={styles.rank}>{rankLabel(i)}</span>
                <h4 className={styles.ticker}>{s.ticker}</h4>
                <span className={`${styles.delta} ${Number(s.changePct ?? 0) >= 0 ? styles.up : styles.down}`}>
                  {Number(s.changePct ?? 0) >= 0 ? "+" : ""}{(s.changePct ?? 0).toFixed(2)}%
                </span>
              </div>

              <div className={styles.name} title={s.company ?? undefined}>{s.company ?? "—"}</div>

              <div className={styles.meta}>
                <span className={styles.chip}>{fmtPrice(s.price)}</span>
                <span className={styles.dot} />
                <span className={styles.kvItem} title={s.sector ?? undefined}>{s.sector ?? "—"}</span>
                <span className={styles.sep}>•</span>
                <span className={styles.kvItem} title={s.industry ?? undefined}>{s.industry ?? "—"}</span>
              </div>

              <div className={styles.badges}>
                <span className={styles.badge}>Mkt Cap: {fmtCap(s.marketCapText)}</span>
                {s.pe != null && Number.isFinite(s.pe) && <span className={styles.badge}>P/E: {s.pe.toFixed(2)}</span>}
              </div>

              <Link to={`/stocks/${s.ticker}`} className={styles.cta}>View Details</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
