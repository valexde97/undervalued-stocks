// src/components/StockList.tsx
import type { Stock } from "../types/stock";
import StockCard from "./StockCard";
import styles from "./stockList.module.css";

type Props = {
  stocks: Stock[] | null | undefined;
  marketClosed?: boolean;
};

export default function StockList({ stocks, marketClosed }: Props) {
  const data = Array.isArray(stocks) ? stocks : [];

  if (data.length === 0) {
    return <div className={styles.empty}>No stocks to show</div>;
  }

  return (
    <div className={styles.grid}>
      {data.map((s) => (
        <StockCard key={s.ticker} stock={s} marketClosed={marketClosed} />
      ))}
    </div>
  );
}
