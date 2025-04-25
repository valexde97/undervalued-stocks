type Stock = {
  ticker: string;
  name: string;
  price: number;
};

type Props = {
  stocks: Stock[];
};

export const StockList = ({ stocks }: Props) => (
  <ul>
    {stocks.map((stock) => (
      <li key={stock.ticker}>
        <strong>{stock.ticker}</strong>: {stock.name} — ${stock.price}
      </li>
    ))}
  </ul>
);
