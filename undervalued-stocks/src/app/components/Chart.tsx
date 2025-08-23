import React from 'react';
import { Line } from 'react-chartjs-2';
import { useFetchStockData } from '../hooks/useFetchStockData';

const Chart = ({ stockSymbol }) => {
  const { data, loading, error } = useFetchStockData(stockSymbol);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error fetching data: {error.message}</div>;

  const chartData = {
    labels: data.map(entry => entry.date),
    datasets: [
      {
        label: `${stockSymbol} Price History`,
        data: data.map(entry => entry.price),
        fill: false,
        backgroundColor: 'rgba(75,192,192,0.4)',
        borderColor: 'rgba(75,192,192,1)',
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'day',
        },
      },
      y: {
        beginAtZero: false,
      },
    },
  };

  return (
    <div>
      <h2>{stockSymbol} Price History</h2>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default Chart;