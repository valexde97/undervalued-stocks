import { useEffect, useRef, useState } from "react";
import styles from "./newsMini.module.css";

type RawItem = { headline: string; source: string; datetime: number; url: string; image?: string; };
type Item = { title: string; source: string; time: string; url: string; image?: string; };

const LS_KEY = "newsMiniCacheV1";
const LS_TTL_MS = 120_000; // 2 минуты

function timeAgo(sec: number) {
  const m = Math.max(1, Math.round((Date.now() - sec * 1000) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function NewsMini() {
  const [items, setItems] = useState<Item[] | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Пытаемся мгновенно показать кэш, если он свежий
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw) as { ts: number; data: Item[] };
        if (Date.now() - ts < LS_TTL_MS && Array.isArray(data) && data.length) {
          setItems(data);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const fetchNews = async () => {
    try {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const r = await fetch("/api/fh/news?category=general", { signal: ctrl.signal, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const arr = (await r.json()) as RawItem[];
      const top: Item[] = (arr ?? []).slice(0, 6).map(x => ({
        title: x.headline,
        source: x.source,
        time: timeAgo(x.datetime),
        url: x.url,
        image: x.image && x.image.startsWith("http") ? x.image : undefined,
      }));
      setItems(top);
      // кладём в кэш
      try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data: top })); } catch { /* ignore localStorage errors */ }
    } catch { /* тихо, оставляем прошлое содержимое */ }
  };

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 5 * 60_000);
    return () => { clearInterval(id); ctrlRef.current?.abort(); };
  }, []);

  if (!items) {
    // лёгкий скелетон через CSS (без зависимости от lib)
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>Latest investing news</div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.item} style={{ pointerEvents: "none" }}>
            <div className={styles.thumb}/>
            <div className={styles.text}>
              <div className={styles.title}/>
              <div className={styles.meta}/>
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
        <a key={i} href={it.url} target="_blank" className={styles.item} rel="noopener noreferrer nofollow"
           aria-label={`${it.title} — ${it.source}`}>
          <div className={styles.thumb}>
            {it.image ? <img src={it.image} alt={it.source} loading="lazy" width={60} height={60}/> : <span>{it.source?.[0] ?? "•"}</span>}
          </div>
          <div className={styles.text}>
            <div className={styles.title}>{it.title}</div>
            <div className={styles.meta}><span className={styles.badge}>{it.source}</span><span>{it.time}</span></div>
          </div>
        </a>
      ))}
    </div>
  );
}
