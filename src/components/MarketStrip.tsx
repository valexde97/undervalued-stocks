// src/components/MarketStrip.tsx
import { useEffect, useMemo, useRef, useState } from "react";

type Quote = { c?: number; pc?: number; t?: number; serverTs?: number };
type Status = { isOpen?: boolean; exchange?: string; timezone?: string } | null;

async function fetchJSON<T>(url: string, noStore = true): Promise<T> {
  const u = new URL(url, window.location.origin);
  if (noStore) u.searchParams.set("ts", String(Date.now()));
  const r = await fetch(u.toString(), { cache: noStore ? "no-store" : undefined });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function useQuote(symbol: string, intervalMs = 30_000) {
  const [q, setQ] = useState<Quote | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const fetchOnce = async () => {
    try {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const data = await fetchJSON<Quote>(`/api/fh/quote?symbol=${encodeURIComponent(symbol)}`);
      setQ(data);
    } catch {/* silent */}
  };

  useEffect(() => {
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => { clearInterval(id); ctrlRef.current?.abort(); };
  }, [symbol, intervalMs]);

  const pct = useMemo(() => {
    if (!q?.c || q.pc == null) return null;
    return ((q.c - q.pc) / (q.pc || 1)) * 100;
  }, [q]);

  const ageMs = useMemo(() => {
    const tSec = q?.t ? q.t * 1000 : undefined;
    const ts = tSec ?? q?.serverTs ?? undefined;
    return ts ? Date.now() - ts : null;
  }, [q]);

  const stale = ageMs != null ? ageMs > 15 * 60 * 1000 : false; // >15 мин
  return { price: q?.c ?? null, pct, stale, ageMs };
}

function useMarketStatus() {
  const [st, setSt] = useState<Status>(null);
  useEffect(() => {
    const tick = async () => {
      try {
        const s = await fetchJSON<Status>("/api/fh/marketStatus");
        setSt(s);
      } catch {/* ignore */}
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return st;
}

export function MarketStrip() {
  const status = useMarketStatus(); // isOpen?: boolean
  const spy = useQuote("SPY");
  const qqq = useQuote("QQQ");
  const iwm = useQuote("IWM");
  // Живой «маяк» 24/7:
  const btc = useQuote("BINANCE:BTCUSDT", 20_000);

  const Badge = ({ text }: { text: string }) => (
    <span style={{
      marginLeft: 8, fontSize: 12, padding: "2px 6px",
      border: "1px solid var(--border)", borderRadius: 9999,
      opacity: .85
    }}>{text}</span>
  );

  const Box = ({ label, p, pct, stale }: {
    label: string; p: number | null; pct: number | null; stale?: boolean;
  }) => (
    <div
      role="group"
      aria-label={label}
      style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "rgba(255,255,255,.04)",
        display: "flex",
        gap: 8,
        minWidth: 120,
        justifyContent: "space-between",
      }}
      title={
        pct != null
          ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%${stale ? " • stale" : ""}`
          : stale ? "stale" : ""
      }
    >
      <strong style={{ opacity: 0.85 }}>{label}</strong>
      <span style={{ opacity: 0.85 }}>{p != null ? p.toFixed(2) : "—"}</span>
      <span
        style={{
          fontWeight: 600,
          color: pct != null ? (pct >= 0 ? "#22c55e" : "#ef4444") : "inherit",
          opacity: stale ? 0.6 : 1,
        }}
      >
        {pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : ""}
      </span>
    </div>
  );

  const closed = status && status.isOpen === false;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 12px", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Box label="SPY" p={spy.price} pct={spy.pct} stale={spy.stale || !!closed} />
        <Box label="QQQ" p={qqq.price} pct={qqq.pct} stale={qqq.stale || !!closed} />
        <Box label="IWM" p={iwm.price} pct={iwm.pct} stale={iwm.stale || !!closed} />
        <Box label="BTC" p={btc.price} pct={btc.pct} stale={btc.stale} />
      </div>
      {closed ? <Badge text="US market closed" /> : null}
    </div>
  );
}

export default MarketStrip;
