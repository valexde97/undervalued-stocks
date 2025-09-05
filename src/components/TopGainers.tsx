import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useAppSelector } from "../store/hooks";
import type { Stock } from "../types/stock";
import styles from "./topGainers.module.css";

function pickTop(items: Stock[], n = 3): Stock[] {
  const arr = items
    .filter(s => typeof s.changePct === "number" && Number.isFinite(s.changePct as number))
    .sort((a, b) => (b.changePct! - a.changePct!));
  return arr.slice(0, n);
}

export default function TopGainers() {
  const items = useAppSelector(s => s.stocks.items);
  const top = useMemo(() => pickTop(items, 3), [items]);

  return (
    <div className={styles.wrap} data-layout="vertical">
      <div className={styles.header}>Top gainers</div>
      <div className={styles.list}>
        {top.length === 0 ? (
          <div className={styles.empty}>No intraday leaders yet.</div>
        ) : top.map(s => (
          <article key={s.ticker} className={styles.card}>
            <div className={styles.rowHead}>
              <h4 className={styles.ticker}>{s.ticker}</h4>
              <span className={`${styles.delta} ${s.changePct! >= 0 ? styles.up : styles.down}`}>
                {s.changePct! >= 0 ? "+" : ""}{s.changePct!.toFixed(2)}%
              </span>
            </div>
            <div className={styles.name} title={s.name ?? undefined}>{s.name ?? "—"}</div>

            <div className={styles.kv}>
              <span className={styles.k}>Price</span>
              <span className={styles.v}>{s.price != null ? `$${s.price.toFixed(2)}` : "—"}</span>
            </div>

            <Link to={`/stocks/${s.ticker}`} className={styles.cta}>View Details</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
