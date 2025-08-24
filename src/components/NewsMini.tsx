// src/components/NewsMini.tsx
import { useEffect, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";
import styles from "./newsMini.module.css";

type RawItem = {
  headline: string;
  source: string;
  datetime: number; // seconds
  url: string;
  image?: string;
};

type Item = {
  title: string;
  source: string;
  time: string;        // "2h ago"
  url: string;
  image?: string;
};

function timeAgo(sec: number) {
  const ms = sec * 1000;
  const diff = Date.now() - ms;
  const m = Math.max(1, Math.round(diff / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function NewsMini() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const fetchNews = async () => {
    try {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      const r = await fetch("/api/fh/news?category=general", {
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const arr = (await r.json()) as RawItem[];
      const top = (arr ?? []).slice(0, 6).map(x => ({
        title: x.headline,
        source: x.source,
        time: timeAgo(x.datetime),
        url: x.url,
        image: x.image && x.image.startsWith("http") ? x.image : undefined,
      }));
      setItems(top);
      setErr(null);
    } catch (e: any) {
      // оставляем последний успешный список, не ломаем UI
      setErr(String(e?.message || e));
    }
  };

  useEffect(() => {
fetchNews();
    const id = setInterval(fetchNews, 5 * 60_000); // каждые 5 минут
    return () => {
      clearInterval(id);
      ctrlRef.current?.abort();
      const u = new URL("/api/fh/news", window.location.origin);
      u.searchParams.set("category", "general");
      u.searchParams.set("ts", String(Date.now())); // анти-кеш
      fetch(u.toString(), { cache: "no-store" });
    };
    // внутри NewsMini useEffect:
  }, []);

  if (items == null) {
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>Latest investing news</div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.item} style={{ pointerEvents: "none" }}>
            <div className={styles.thumb}><Skeleton width={60} height={60} /></div>
            <div className={styles.text}>
              <div className={styles.title}><Skeleton height={16} /></div>
              <div className={styles.meta}><Skeleton width={120} height={12} /></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>Latest investing news</div>
      {items.map((it, i) => (
        <a
          key={i}
          href={it.url}
          target="_blank"
          className={styles.item}
          rel="noopener noreferrer nofollow"
          aria-label={`${it.title} — ${it.source}`}
        >
          <div className={styles.thumb}>
            {it.image ? (
              <img
                src={it.image}
                alt={it.source}
                loading="lazy"
                width={60}
                height={60}
              />
            ) : (
              <span>{it.source?.[0] ?? "•"}</span>
            )}
          </div>
          <div className={styles.text}>
            <div className={styles.title}>{it.title}</div>
            <div className={styles.meta}>
              <span className={styles.badge}>{it.source}</span>
              <span>{it.time}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

export default NewsMini;
