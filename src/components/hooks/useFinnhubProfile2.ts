import { useEffect, useState } from "react";
import { fetchJSON } from "../../utils/http";

export type FHProfile2 = {
  country?: string; currency?: string; exchange?: string; finnhubIndustry?: string;
  ipo?: string; logo?: string; marketCapitalization?: number; name?: string;
  phone?: string; shareOutstanding?: number; ticker?: string; weburl?: string;
};
export type FHProfile2Resp = { symbol: string; serverTs: number; profile: FHProfile2 | null };

export function useFinnhubProfile2(symbol?: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<FHProfile2 | null>(null);

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!symbol) return;
      setLoading(true); setError(null);
      try {
        const data = await fetchJSON<FHProfile2Resp>(`/api/fh/profile2?symbol=${encodeURIComponent(symbol)}`, {
          noStore: true, timeoutMs: 15000
        });
        if (!aborted) setProfile(data?.profile ?? null);
      } catch (e: any) {
        if (!aborted) setError(String(e?.message || e));
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; };
  }, [symbol]);

  return { loading, error, profile };
}
