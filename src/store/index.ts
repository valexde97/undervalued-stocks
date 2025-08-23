import { configureStore } from "@reduxjs/toolkit";
import stocksReducer from "./stocksSlice";

export const store = configureStore({
  reducer: {
    stocks: stocksReducer,
  },
});

// Типы для использования в компонентах
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
