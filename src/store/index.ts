import { configureStore } from "@reduxjs/toolkit";
import stocksReducer from "./stocksSlice";
import newsReducer from "./newsSlice";
import searchReducer from "./searchSlice";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";

export const store = configureStore({
  reducer: {
    stocks: stocksReducer,
    news: newsReducer,
    search: searchReducer,
  },
});

// Типы
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Тайпизированные хуки
export const useAppDispatch: () => AppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
