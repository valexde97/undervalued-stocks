// src/components/StocksPager.tsx
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectVisibleStocks, selectStocksState } from "../store/stocks.slice";
import { fetchFinvizPageWithPrefetch } from "../store/stocks.thunks";
import { nextSymbolsPage } from "../store/stocks.slice";
import StockList from "./StockList";

export default function StocksPager() {
  const dispatch = useDispatch<any>();
  const visible = useSelector(selectVisibleStocks);
  const { symbolPage, hasMore, status } = useSelector(selectStocksState);

  const onShowNext = async () => {
    const nextPage = symbolPage + 1;
    // 1) догружаем/доделываем следующую двадцатку и тут же префетчим следующую
    await dispatch(fetchFinvizPageWithPrefetch({ page: nextPage })).unwrap().catch(() => void 0);
    // 2) раскрываем её на экране
    dispatch(nextSymbolsPage());
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
