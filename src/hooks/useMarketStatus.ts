// src/hooks/useMarketStatus.ts
import { useEffect, useMemo, useState } from "react";

type StatusRaw = {
  isOpen?: boolean;
  exchange?: string;
  timezone?: string;
  // у Finnhub ещё бывают поля preMarket/afterHours/holiday — не полагаемся на них
} | null;

async function fetchJSON<T>(url: string): Promise<T> {
  const u = new URL(url, window.location.origin);
  u.searchParams.set("ts", String(Date.now()));
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function useMarketStatus() {
  const [raw, setRaw] = useState<StatusRaw>(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const x = await fetchJSON<StatusRaw>("/api/fh/marketStatus");
        setRaw(x);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const info = useMemo(() => {
    const isOpen = raw?.isOpen ?? false;
    const dow = new Date().getUTCDay(); // 0 Sun .. 6 Sat (UTC, но нам ок для бейджа)
    const weekend = dow === 0 || dow === 6;
    const reason = isOpen ? null : weekend ? "Weekend" : "Market closed";
    return { isOpen, reason };
  }, [raw]);

  return info; // { isOpen: boolean, reason: string|null }
}
