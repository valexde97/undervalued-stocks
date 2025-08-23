import React from 'react';
import StockList from '../components/StockList';
import Header from '../components/Header';
import './Home.css';

const Home: React.FC = () => {
  return (
    <div className="home-container">
      <Header />
      <h1>Undervalued Stocks</h1>
      <p>Discover the best undervalued stocks in the market.</p>
      <StockList />
    </div>
  );
};

export default Home;