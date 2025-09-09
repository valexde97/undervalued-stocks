import { useMemo } from "react";

export type AlphaOverview = null;

/**
 * Alpha Vantage Overview is disabled.
 * This hook is a no-op to keep existing components compiling without showing the "Load" button.
 */
export function useAlphaOverview(_symbol?: string | null) {
  return useMemo(() => ({
    loading: false,
    error: null as string | null,
    data: null as AlphaOverview,
    load: () => {},
    loadedOnce: true,      // считаем, что уже загружено → кнопка "Load ..." не появится
    disabled: true as const,
  }), []);
}
