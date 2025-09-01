// src/components/StocksPager.tsx
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchFinvizPageWithPrefetch,
  nextSymbolsPage,
  selectStocksState,
  selectVisibleStocks,
} from "../store/stocksSlice";
import StockList from "./StockList";

export default function StocksPager() {
  const dispatch = useDispatch<any>();
  const visible = useSelector(selectVisibleStocks);
  const { symbolPage, hasMore, status } = useSelector(selectStocksState);

  const onShowNext = async () => {
    const nextPage = symbolPage + 1;
    try {
      const { stocks } = await dispatch(fetchFinvizPageWithPrefetch({ page: nextPage })).unwrap();
      if (stocks.length > 0) {
        dispatch(nextSymbolsPage());
      }
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <StockList stocks={visible} />
      <div className="flex items-center justify-center py-2">
        {hasMore ? (
          <button
            onClick={onShowNext}
            disabled={status === "loading"}
            className="px-4 py-2 rounded-lg border shadow-sm hover:shadow-md disabled:opacity-50"
          >
            Show Next 20
          </button>
        ) : (
          <div className="text-sm opacity-60">No more results</div>
        )}
      </div>
    </div>
  );
}
