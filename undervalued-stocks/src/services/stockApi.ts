import axios from 'axios';

const API_URL = 'https://api.example.com/stocks'; // Replace with the actual stock API URL

export const fetchStockList = async () => {
    try {
        const response = await axios.get(`${API_URL}/list`);
        return response.data;
    } catch (error) {
        console.error('Error fetching stock list:', error);
        throw error;
    }
};

export const fetchStockDetails = async (ticker) => {
    try {
        const response = await axios.get(`${API_URL}/details/${ticker}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching details for stock ${ticker}:`, error);
        throw error;
    }
};

export const fetchStockPriceHistory = async (ticker) => {
    try {
        const response = await axios.get(`${API_URL}/history/${ticker}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching price history for stock ${ticker}:`, error);
        throw error;
    }
};