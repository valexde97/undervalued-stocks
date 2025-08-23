import React from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { RootState } from '../../store';
import Chart from './Chart';

const StockDetails: React.FC = () => {
  const { ticker } = useParams<{ ticker: string }>();
  const stock = useSelector((state: RootState) => state.stocks.find(stock => stock.ticker === ticker));

  if (!stock) {
    return <div>Loading...</div>;
  }

  return (
    <div className="stock-details">
      <h2>{stock.companyName} ({stock.ticker})</h2>
      <p>Current Price: ${stock.currentPrice}</p>
      <p>Market Cap: ${stock.marketCap}</p>
      <p>52 Week High: ${stock.high52Week}</p>
      <p>52 Week Low: ${stock.low52Week}</p>
      <Chart ticker={ticker} />
    </div>
  );
};

export default StockDetails;