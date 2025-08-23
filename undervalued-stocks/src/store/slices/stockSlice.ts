import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { fetchStockData } from '../../services/stockApi';

export const fetchStocks = createAsyncThunk('stocks/fetchStocks', async () => {
  const response = await fetchStockData();
  return response;
});

const stockSlice = createSlice({
  name: 'stocks',
  initialState: {
    stocks: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearStocks: (state) => {
      state.stocks = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStocks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStocks.fulfilled, (state, action) => {
        state.loading = false;
        state.stocks = action.payload;
      })
      .addCase(fetchStocks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export const { clearStocks } = stockSlice.actions;

export default stockSlice.reducer;