// src/components/news/NewsPanel.tsx
import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../../store";
import { fetchNewsForSymbol, selectNewsFor } from "../../store/newsSlice";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

type Props = { symbol: string };

export default function NewsPanel({ symbol }: Props) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectNewsFor(symbol));

  const onRefresh = useCallback(() => {
    void dispatch(fetchNewsForSymbol({ symbol, lookbackDays: 14, limit: 20 }));
  }, [dispatch, symbol]);

  return (
    <div style={{ background: "var(--card-bg, #fff)", borderRadius: 12, boxShadow: "var(--shadow, 0 2px 12px rgba(0,0,0,.08))", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Key Insights (last 14 days)</h3>
        <button
          onClick={onRefresh}
          disabled={data.status === "loading"}
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border, #ddd)", background: "transparent", cursor: data.status === "loading" ? "not-allowed" : "pointer" }}
          aria-busy={data.status === "loading"}
        >
          {data.status === "loading" ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Insights */}
      <div style={{ marginTop: 8 }}>
        {data.status === "loading" && (!data.items?.length) ? (
          <Skeleton count={3} height={14} style={{ marginBottom: 6 }} />
        ) : data?.insights?.length ? (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {data.insights.slice(0, 7).map((s, i) => (
              <li key={i} style={{ marginBottom: 6 }}>{s}</li>
            ))}
          </ul>
        ) : (
          <div style={{ color: "var(--muted, #666)", fontSize: 14 }}>No key insights available.</div>
        )}
      </div>

      {/* Headlines */}
      <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: 16, fontWeight: 600 }}>Headlines</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.status === "loading" && !data.items?.length ? (
          <>
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
          </>
        ) : data.items?.length ? (
          data.items.slice(0, 20).map((it) => (
            <a key={it.id} href={it.url} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "none", border: "1px solid var(--border, #eee)", borderRadius: 10, padding: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    textTransform: "capitalize",
                  }}
                >
                    {it.sentiment}
                </span>
                {it.tags?.length ? (
                  <span style={{ fontSize: 12, color: "var(--muted, #666)" }}>{it.tags.join(" · ")}</span>
                ) : null}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted, #666)" }}>
                  {new Date(it.publishedAt).toLocaleString()}
                </span>
              </div>
              <div style={{ marginTop: 6, fontWeight: 600 }}>{it.title}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted, #666)" }}>{it.source}</div>
            </a>
          ))
        ) : (
          <div style={{ color: "var(--muted, #666)", fontSize: 14 }}>No recent headlines.</div>
        )}
      </div>

      {data.status === "failed" && data.error ? (
        <div style={{ marginTop: 10, color: "#b00020" }}>Error: {data.error}</div>
      ) : null}
    </div>
  );
}
