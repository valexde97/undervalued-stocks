import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import type { Stock } from "../types/stock";
import StockCard from "./StockCard";
import styles from "./stockList.module.css";

type Props = {
  stocks: Stock[];
  itemHeight?: number; // px
  overscan?: number;
  height?: number | string; // контейнерная высота
};

export default function StockListVirtual({
  stocks,
  itemHeight = 220,
  overscan = 5,
  height = "70vh",
}: Props) {
  const Row = ({ index, style }: ListChildComponentProps) => {
    const s = stocks[index];
    // перенос стиля позиционирования обязательно
    return (
      <div style={style} className={styles.virtualRow}>
        <StockCard stock={s} />
      </div>
    );
  };

  if (!stocks?.length) return <div className={styles.empty}>No stocks to show</div>;

  return (
    <div style={{ height }}>
      <AutoSizer>
        {({ width, height }) => (
          <List
            height={height}
            width={width}
            itemCount={stocks.length}
            itemSize={itemHeight}
            overscanCount={overscan}
          >
            {Row}
          </List>
        )}
      </AutoSizer>
    </div>
  );
}
