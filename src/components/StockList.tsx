import type { Stock } from "../types/stock";
import StockCard from "./StockCard";
import styles from "./stockList.module.css";

type Props = {
  stocks: Stock[] | null | undefined;
  marketClosed?: boolean; // можно оставить здесь, если нужно куда-то ещё
};

export default function StockList({ stocks /*, marketClosed*/ }: Props) {
  const data = Array.isArray(stocks) ? stocks : [];

  if (data.length === 0) {
    return <div className={styles.empty}>No stocks to show</div>;
  }

  return (
    <div className={styles.grid}>
      {data.map((s) => (
        // убрали marketClosed, т.к. StockCard его не принимает
        <StockCard key={s.ticker} stock={s} />
      ))}
    </div>
  );
}
