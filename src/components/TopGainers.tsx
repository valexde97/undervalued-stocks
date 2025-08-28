import { Link } from "react-router-dom";
import { useAppSelector } from "../store/hooks";
import type { Stock } from "../types/stock";
import styles from "./topGainers.module.css";

type Props = { layout?: "vertical" };

function pickTop(items: Stock[], n = 3): Stock[] {
  const withChange = items.filter(s => typeof s.changePct === "number");
  if (withChange.length >= n) {
    return [...withChange].sort((a, b) => (b.changePct! - a.changePct!)).slice(0, n);
  }
  // фейковые, чтобы визуал жил, пока данные не пришли
  return [
    { ticker: "APT",  name: "Alpha Pro Tech", category: "small", price: 1.19,  changePct: 208.39 },
    { ticker: "LGPS", name: "Light Leap",     category: "small", price: 0.67,  changePct: 107.11 },
    { ticker: "CMT",  name: "Core Mfg Tech",  category: "small", price: 19.16, changePct: 33.76 },
  ];
}

export default function TopGainers({ layout = "vertical" }: Props) {
  const items = useAppSelector(s => s.stocks.items);
  const top = pickTop(items, 3);

  return (
    <div className={styles.wrap} data-layout={layout}>
      <div className={styles.header}>Top gainers (24h)</div>
      <div className={styles.list}>
        {top.map(s => (
          <article key={s.ticker} className={styles.card}>
            <div className={styles.rowHead}>
              <h4 className={styles.ticker}>{s.ticker}</h4>
              <span className={`${styles.delta} ${s.changePct! >= 0 ? styles.up : styles.down}`}>
                {s.changePct! >= 0 ? "+" : ""}{s.changePct?.toFixed(2)}%
              </span>
            </div>
            <div className={styles.name} title={s.name}>{s.name ?? "—"}</div>

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
