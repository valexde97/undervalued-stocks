import { useEffect, useState } from "react";
import { fetchJSON } from "../../utils/http";

export type MetricsResp = { symbol?: string; serverTs?: number; metric?: Record<string, any> };

export function useFinnhubMetrics(symbol?: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [metric, setMetric] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!symbol) return;
      setLoading(true); setError(null);
      try {
        const data = await fetchJSON<MetricsResp>(`/api/fh/metrics?symbol=${encodeURIComponent(symbol)}`, {
          noStore: true, timeoutMs: 20000
        });
        if (!aborted) setMetric(data?.metric ?? {});
      } catch (e: any) {
        if (!aborted) setError(String(e?.message || e));
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; };
  }, [symbol]);

  return { loading, error, metric };
}
