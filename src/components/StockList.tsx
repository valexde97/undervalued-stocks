import React from "react";
import type { Stock } from "../types/stock";
import { StockCard } from "./StockCard";
import styles from "./stockList.module.css";

type Props = { stocks: Stock[] };

export const StockList: React.FC<Props> = ({ stocks }) => (
  <div className={styles.grid}>
    {stocks.map((s) => <StockCard key={s.ticker} stock={s} />)}
  </div>
);
