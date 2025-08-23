import { useEffect, useState } from "react";

type Item = { headline: string; source: string; datetime: number; url: string };

export function NewsMini() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const token = import.meta.env.VITE_FINNHUB_TOKEN;
fetch(`/api/fh/news?category=general`)
      .then(r => r.json())
      .then((arr: any[]) => {
        const top = (arr ?? []).slice(0, 5).map(x => ({
          headline: x.headline,
          source: x.source,
          datetime: x.datetime,
          url: x.url,
        }));
        setItems(top);
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      display: "grid", gap: 6, maxWidth: 560,
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 12
    }}>
      <div style={{opacity:.85, fontWeight:600, marginBottom:4}}>Latest investing news</div>
      {items.map((it, i) => (
        <a
          key={i}
          href={it.url}
          target="_blank"
          rel="noreferrer"
          style={{textDecoration: "none", color: "var(--text-light)", fontSize: 14}}
        >
          • {it.headline}
          <span style={{opacity:.7}}> — {it.source}</span>
        </a>
      ))}
    </div>
  );
}
