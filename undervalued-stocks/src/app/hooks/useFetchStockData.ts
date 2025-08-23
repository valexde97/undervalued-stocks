import { useEffect, useState } from 'react';
import { fetchStockData } from '../../services/stockApi';

const useFetchStockData = (ticker) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const getStockData = async () => {
      try {
        setLoading(true);
        const result = await fetchStockData(ticker);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (ticker) {
      getStockData();
    }
  }, [ticker]);

  return { data, loading, error };
};

export default useFetchStockData;