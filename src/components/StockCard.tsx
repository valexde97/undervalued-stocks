type Stock = {
  ticker: string;
  name: string;
  price: number;
};

type Props = {
  stock: Stock;
};

export const StockCard = ({ stock }: Props) => (
  <div style={{ padding: '1rem', margin: '1rem 0', border: '1px solid #ccc', borderRadius: '8px' }}>
    <h3>{stock.ticker} — {stock.name}</h3>
    <p>Price: ${stock.price}</p>
  </div>
);