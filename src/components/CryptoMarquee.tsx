// src/components/CryptoMarquee.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./cryptoMarquee.module.css";

type Quote = { c?: number; pc?: number; t?: number; serverTs?: number };

const SYMBOLS: { key: string; label: string; symbol: string }[] = [
  { key: "BTC",  label: "BTC",  symbol: "BINANCE:BTCUSDT" },
  { key: "ETH",  label: "ETH",  symbol: "BINANCE:ETHUSDT" },
  { key: "SOL",  label: "SOL",  symbol: "BINANCE:SOLUSDT" },
  { key: "BNB",  label: "BNB",  symbol: "BINANCE:BNBUSDT" },
  { key: "XRP",  label: "XRP",  symbol: "BINANCE:XRPUSDT" },
  { key: "ADA",  label: "ADA",  symbol: "BINANCE:ADAUSDT" },
  { key: "DOGE", label: "DOGE", symbol: "BINANCE:DOGEUSDT" },
  { key: "AVAX", label: "AVAX", symbol: "BINANCE:AVAXUSDT" },
  { key: "TON",  label: "TON",  symbol: "BINANCE:TONUSDT" },
  { key: "LINK", label: "LINK", symbol: "BINANCE:LINKUSDT" },
  { key: "DOT",  label: "DOT",  symbol: "BINANCE:DOTUSDT" },
  { key: "MATIC",label: "MATIC",symbol: "BINANCE:MATICUSDT" },
  { key: "LTC",  label: "LTC",  symbol: "BINANCE:LTCUSDT" },
];

async function fetchJSON<T>(url: string): Promise<T> {
  const u = new URL(url, window.location.origin);
  u.searchParams.set("ts", String(Date.now()));
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function useQuote(symbol: string, intervalMs = 20_000) {
  const [q, setQ] = useState<Quote | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const fetchOnce = async () => {
    try {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const data = await fetchJSON<Quote>(`/api/fh/quote?symbol=${encodeURIComponent(symbol)}`);
      setQ(data);
    } catch { /* silent */ }
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

  return { price: q?.c ?? null, pct };
}

function fmtPrice(p: number | null): string {
  if (p == null) return "—";
  if (p >= 100) return p.toFixed(0);
  if (p >= 10)  return p.toFixed(2);
  if (p >= 1)   return p.toFixed(3);
  return p.toFixed(5);
}

function Chip({ label, symbol }: { label: string; symbol: string }) {
  const { price, pct } = useQuote(symbol);
  const color = pct == null ? "inherit" : pct >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div className={styles.chip} title={pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""}>
      <strong className={styles.label}>{label}</strong>
      <span className={styles.price}>{fmtPrice(price)}</span>
      <span className={styles.pct} style={{ color }}>
        {pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : ""}
      </span>
    </div>
  );
}

/** Непрерывная лента: дублируем контент 2 раза для бесшовного зацикливания */
export default function CryptoMarquee() {
  return (
    <div className={styles.viewport} aria-label="Live crypto ticker">
      <div className={styles.track} role="list">
        {SYMBOLS.map(({ key, label, symbol }) => (
          <div key={key} role="listitem"><Chip label={label} symbol={symbol} /></div>
        ))}
      </div>
      <div className={`${styles.track} ${styles.clone}`} aria-hidden="true">
        {SYMBOLS.map(({ key, label, symbol }) => (
          <div key={`${key}-clone`}><Chip label={label} symbol={symbol} /></div>
        ))}
      </div>
    </div>
  );
}
