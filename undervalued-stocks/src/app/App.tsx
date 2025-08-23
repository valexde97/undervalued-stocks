import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { Home } from './pages/Home';
import { StockDetailsPage } from './pages/StockDetailsPage';
import { Header } from './components/Header';
import './styles/App.css';

const App = () => {
  return (
    <Router>
      <Header />
      <Switch>
        <Route path="/" exact component={Home} />
        <Route path="/stock/:ticker" component={StockDetailsPage} />
      </Switch>
    </Router>
  );
};

export default App;