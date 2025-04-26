import { useEffect, useState } from 'react';
import { StockList } from '../components/StockList';

type Stock = {
  ticker: string;
  name: string;
  price: number;
};

export const Home = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [IsLoading, setIsLoading] = useState<boolean>(true);

  
useEffect(() => {
  const fetchStocks = async () => {
    try {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const fakeData: Stock[] = [
        { ticker: 'AAPL', name: 'Apple Inc.', price: 155 },
          { ticker: 'TSLA', name: 'Tesla Inc.', price: 720 },
          { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 130 },
      ];
      
    setStocks(fakeData);
    }catch(error){
      console.error('Failed to load stocks:', error);
    }finally{
      setIsLoading(false);
    }
    };
    
  fetchStocks();
},[]);

  return (
    <>
      <h2>Welcome, to Demo version of my InvApp!</h2>
      <p>Here you can see in live-time how i will be developing my new project.</p>
      {IsLoading ? (
  <p>Loading...</p>
) : (
  <StockList stocks={stocks} />
)}
      {/*<PrimaryButton text="Find Undervalued Stocks" onClick={handleSearch} />*/}
      {stocks.length > 0 && <StockList stocks={stocks} />}
    </>
  );
};
