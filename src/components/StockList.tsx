import { StockCard } from "./StockCard";

type Stock = {
  ticker: string;
  name: string;
  price: number;
};

type Props = {
  stocks: Stock[];
};

export const StockList = ({ stocks }: Props) => (
  <div>
    {stocks.map((stock) => (
     <StockCard key={stock.ticker} stock={stock} />
    ))}
 </div>
);
