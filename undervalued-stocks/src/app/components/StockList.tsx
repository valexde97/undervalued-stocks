import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStocks } from '../../store/slices/stockSlice';
import './StockList.css';

const StockList = () => {
  const dispatch = useDispatch();
  const stocks = useSelector((state) => state.stocks.items);
  const loading = useSelector((state) => state.stocks.loading);
  const error = useSelector((state) => state.stocks.error);

  useEffect(() => {
    dispatch(fetchStocks());
  }, [dispatch]);

  if (loading) {
    return <div className="loading">Loading stocks...</div>;
  }

  if (error) {
    return <div className="error">Error fetching stocks: {error}</div>;
  }

  return (
    <div className="stock-list">
      <h2>Stock List</h2>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company Name</th>
            <th>Live Price</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.ticker}>
              <td>{stock.ticker}</td>
              <td>{stock.companyName}</td>
              <td>${stock.livePrice.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StockList;