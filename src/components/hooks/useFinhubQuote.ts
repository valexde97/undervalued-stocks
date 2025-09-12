import { useEffect, useState } from "react";
import { getQuote, type ApiQuote } from "../../api/finhub";

type State = {
  loading: boolean;
  error: string | null;
  quote: ApiQuote | null;
};

export function useFinnhubQuote(symbol?: string | null): State {
  const [state, setState] = useState<State>({ loading: !!symbol, error: null, quote: null });

  useEffect(() => {
    let alive = true;
    if (!symbol) {
      setState({ loading: false, error: null, quote: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const q = await getQuote(symbol);
        if (!alive) return;
        setState({ loading: false, error: null, quote: q });
      } catch (e: any) {
        if (!alive) return;
        setState({ loading: false, error: String(e?.message ?? e), quote: null });
      }
    })();

    return () => {
      alive = false;
    };
  }, [symbol]);

  return state;
}
