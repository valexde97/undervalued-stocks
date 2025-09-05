import { getMarketSession } from "../utils/marketSession";
import styles from "./marketClosedCard.module.css";

export default function MarketClosedCard() {
  const m = getMarketSession();
  const rows = [
    { exchange: "NYSE",   status: m.isOpen ? "Open" : "Closed" },
    { exchange: "NASDAQ", status: m.isOpen ? "Open" : "Closed" },
  ];

  return (
    <div role="region" aria-label="US market status" className={styles.wrap}>
      <div className={styles.header}>
        <strong className={styles.title}>US Market</strong>
        <span className={styles.pill}>{m.session}</span>
        <span className={styles.time}>{m.nowEtText}</span>
      </div>
      <div className={styles.meta}>Snapshot: Finviz</div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Exchange</th>
            <th className={`${styles.th} ${styles.thRight}`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.exchange}>
              <td className={styles.td}>{r.exchange}</td>
              <td className={`${styles.td} ${styles.tdRight} ${r.status === "Open" ? styles.open : styles.closed}`}>
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.closedPane}>Market closed</div>
    </div>
  );
}
