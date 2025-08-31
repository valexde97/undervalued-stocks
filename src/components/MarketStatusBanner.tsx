import { useMarketStatus } from "../hooks/useMarketStatus";

type Row = { exchange: string; status: "Open" | "Closed" };

export default function MarketStatusBanner() {
  const market = useMarketStatus(); // { isOpen: boolean, reason: string|null }

  const rows: Row[] = [
    { exchange: "NYSE", status: market.isOpen ? "Open" : "Closed" },
    { exchange: "NASDAQ", status: market.isOpen ? "Open" : "Closed" },
  ];

  return (
    <div
      role="region"
      aria-label="US market status"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "rgba(255,255,255,.04)",
        margin: "8px 0 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14, opacity: 0.9 }}>US Market</strong>
        {!market.isOpen && (
          <span
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              opacity: 0.85,
            }}
          >
            {market.reason ?? "Closed"}
          </span>
        )}
      </div>
      <div style={{ textAlign: "right", fontSize: 12, opacity: 0.75 }}>Snapshot: Finviz</div>

      <div style={{ gridColumn: "1 / -1" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Exchange</th>
              <th style={{ textAlign: "right", padding: "8px 6px", opacity: 0.7 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exchange}>
                <td style={{ padding: "6px 6px", borderTop: "1px solid var(--border)" }}>{r.exchange}</td>
                <td
                  style={{
                    padding: "6px 6px",
                    borderTop: "1px solid var(--border)",
                    textAlign: "right",
                    fontWeight: 600,
                    color: r.status === "Open" ? "#22c55e" : "#ef4444",
                  }}
                >
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
