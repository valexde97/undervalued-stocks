// src/components/CryptoMarquee.tsx
import { useEffect, useMemo, useRef, useState } from "react";

type Quote = { c?: number; pc?: number; t?: number };
type Item = { symbol: string; quote: Quote | null; cached?: boolean };
type Resp = {
  quotes?: Record<string, Quote | null>;
  items?: Item[];
  serverTs?: number;
  backoffUntil?: number;
};

const SYMBOLS = [
  "BINANCE:BTCUSDT",
  "BINANCE:ETHUSDT",
  "BINANCE:BNBUSDT",
  "BINANCE:XRPUSDT",
  "BINANCE:SOLUSDT",
  "BINANCE:ADAUSDT",
];

function short(sym: string) {
  const m = sym.match(/:([A-Z]+)USDT$/);
  return m ? m[1] : sym;
}

async function fetchBatch(symbols: string[]): Promise<Resp> {
  const u = new URL("/api/fh/quotes-batch", window.location.origin);
  u.searchParams.set("symbols", symbols.join(","));
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function CryptoMarquee() {
  const [data, setData] = useState<Item[]>([]);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const poll = async () => {
    if (pausedUntil && Date.now() < pausedUntil) return;
    try {
      const res = await fetchBatch(SYMBOLS);

      // Нормализуем ответ: и quotes-мапа, и items-массив поддерживаются
      const next: Item[] = SYMBOLS.map((sym) => {
        const fromItems = res.items?.find((i) => i.symbol === sym) || null;
        const fromMap = res.quotes ? { symbol: sym, quote: res.quotes[sym] ?? null } : null;
        return fromItems || (fromMap as Item) || { symbol: sym, quote: null };
      });

      setData(next);
      if (res.backoffUntil && res.backoffUntil > Date.now()) {
        setPausedUntil(res.backoffUntil);
      } else {
        setPausedUntil(null);
      }
    } catch {
      /* попробуем позже */
    }
  };

  useEffect(() => {
    void poll(); // первый запрос сразу
    const id = window.setInterval(poll, 45_000); // обновляем каждые ~45с
    tickRef.current = id;
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
    };
  }, []);

  const rows = useMemo(() => {
    return SYMBOLS.map((sym) => {
      const it = data.find((x) => x.symbol === sym);
      const c = it?.quote?.c ?? null;
      const pc = it?.quote?.pc ?? null;
      const pct = c != null && pc != null && pc !== 0 ? ((c - pc) / pc) * 100 : null;
      return { sym, label: short(sym), c, pct, cached: !!it?.cached };
    });
  }, [data]);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "4px 2px",
        alignItems: "center",
      }}
    >
      {rows.map((r) => (
        <div
          key={r.sym}
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            whiteSpace: "nowrap",
            background: "var(--card-bg)",
            boxShadow: "var(--shadow)",
            opacity: r.cached ? 0.9 : 1,
            flex: "0 0 auto",
            minWidth: 130,
          }}
          title={r.pct != null ? `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%` : ""}
        >
          <strong style={{ opacity: 0.9 }}>{r.label}</strong>
          <span style={{ opacity: 0.9 }}>{r.c != null ? r.c.toFixed(2) : "—"}</span>
          <span
            style={{
              fontWeight: 700,
              color: r.pct != null ? (r.pct >= 0 ? "#22c55e" : "#ef4444") : "inherit",
            }}
          >
            {r.pct != null ? (r.pct >= 0 ? "+" : "") + r.pct.toFixed(2) + "%" : ""}
          </span>
        </div>
      ))}
      {pausedUntil && Date.now() < pausedUntil && (
        <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
          rate-limited… retry {Math.ceil((pausedUntil - Date.now()) / 1000)}s
        </span>
      )}
    </div>
  );
}
