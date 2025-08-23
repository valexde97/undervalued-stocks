import { useEffect, useState } from "react";

type Q = { c:number; pc:number }; // current / prev close

function useQuote(symbol: string) {
  const [q, setQ] = useState<Q | null>(null);
  useEffect(() => {
  fetch(`/api/fh/quote?symbol=${symbol}`)
    .then(r => r.json())
    .then(setQ)
    .catch(() => {});
}, [symbol]);

  const pct = q ? ((q.c - q.pc) / (q.pc || 1)) * 100 : null;
  return { price: q?.c ?? null, pct };
}

export function MarketStrip() {
  const spy = useQuote("SPY");
  const qqq = useQuote("QQQ");
  const iwm = useQuote("IWM");

  const Box = ({ label, p, pct }:{label:string; p:number|null; pct:number|null}) => (
    <div style={{
      padding:"6px 10px",
      border:"1px solid var(--border)",
      borderRadius:8,
      background:"rgba(255,255,255,.04)",
      display:"flex", gap:8
    }}>
      <strong style={{opacity:.85}}>{label}</strong>
      <span style={{opacity:.85}}>{p ? p.toFixed(2) : "—"}</span>
      <span style={{fontWeight:600, color: pct!=null ? (pct>=0?"#22c55e":"#ef4444") : "inherit"}}>
        {pct!=null ? (pct>=0?"+":"") + pct.toFixed(2) + "%" : ""}
      </span>
    </div>
  );

  return (
    <div style={{display:"flex", gap:8, flexWrap:"wrap", margin:"8px 0 12px"}}>
      <Box label="SPY" p={spy.price} pct={spy.pct} />
      <Box label="QQQ" p={qqq.price} pct={qqq.pct} />
      <Box label="IWM" p={iwm.price} pct={iwm.pct} />
    </div>
  );
}
