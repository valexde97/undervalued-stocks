import { useState } from 'react';
import { PrimaryButton } from '../components/PrimaryButton';
import { StockList } from '../components/StockList';

type Stock = {
  ticker: string;
  name: string;
  price: number;
};

export const Home = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);

  const handleSearch = () => {
    // Temporary fake data
    const fakeStocks = [
      { ticker: 'AAPL', name: 'Apple Inc.', price: 155 },
      { ticker: 'TSLA', name: 'Tesla Inc.', price: 720 },
      { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 130 },
    ];
    setStocks(fakeStocks);
  };

  return (
    <>
      <h2>Welcome!</h2>
      <p>Click the button below to search for undervalued stocks.</p>
      <PrimaryButton text="Find Undervalued Stocks" onClick={handleSearch} />
      {stocks.length > 0 && <StockList stocks={stocks} />}
    </>
  );
};
