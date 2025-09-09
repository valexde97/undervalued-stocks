import { useEffect, useState } from "react";
import { fetchJSON } from "../../utils/http";

export type SecFacts = {
  cik?: string; entityName?: string;
  revenueUsd?: { v?: number; asOf?: string };
  netIncomeUsd?: { v?: number; asOf?: string };
  assetsUsd?: { v?: number; asOf?: string };
  liabilitiesUsd?: { v?: number; asOf?: string };
  shares?: { v?: number; asOf?: string; unit?: string };
} | null;

export function useSecFacts(symbol?: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [facts, setFacts]     = useState<SecFacts>(null);

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!symbol) return;
      setLoading(true); setError(null);
      try {
        const d = await fetchJSON<any>(`/api/sec/company-facts?symbol=${encodeURIComponent(symbol)}`, {
          noStore: true, timeoutMs: 20000
        });
        if (!aborted) setFacts(d ?? null);
      } catch (e: any) {
        if (!aborted) setError(String(e?.message || e));
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; };
  }, [symbol]);

  return { loading, error, facts };
}
