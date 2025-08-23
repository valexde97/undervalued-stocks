import React from 'react';
import { useParams } from 'react-router-dom';
import { useFetchStockData } from '../hooks/useFetchStockData';
import StockDetails from '../components/StockDetails';
import Chart from '../components/Chart';

const StockDetailsPage = () => {
  const { ticker } = useParams();
  const { stockData, loading, error } = useFetchStockData(ticker);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error fetching stock data: {error.message}</div>;

  return (
    <div>
      <h1>{stockData.companyName} ({stockData.ticker})</h1>
      <StockDetails stockData={stockData} />
      <Chart stockData={stockData.priceHistory} />
    </div>
  );
};

export default StockDetailsPage;