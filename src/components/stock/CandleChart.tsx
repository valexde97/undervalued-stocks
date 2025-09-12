// src/components/stock/CandleChart.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "../../pages/stockDetails.module.css";
import { useTranslation } from "react-i18next";
import { CandlesResponse, getCandles, extentY } from "../../lib/candles";

type Props = {
  symbol: string;
  fromISO?: string; // опционально, по умолчанию now-20y
  toISO?: string;   // опционально, по умолчанию now
};

function useResize(elRef: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setRect({ w: Math.max(100, Math.floor(cr.width)), h: Math.max(180, Math.floor(cr.height)) });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [elRef]);
  return rect;
}

function formatMoney(v: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: v < 1 ? 4 : 2 }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}
function fmtDate(sec: number) {
  const d = new Date(sec * 1000);
  return d.toISOString().slice(0, 10);
}

export default function CandleChart({ symbol, fromISO, toISO }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ data: CandlesResponse | null; error?: string; loading: boolean }>({
    data: null, loading: true,
  });

  useEffect(() => {
    let mounted = true;
    const now = new Date();
    const from = fromISO ?? new Date(new Date(now).setFullYear(now.getFullYear() - 20)).toISOString().slice(0, 10);
    const to = toISO ?? now.toISOString().slice(0, 10);

    (async () => {
      try {
        const resp = await getCandles({ symbol, fromISO: from, toISO: to, res: "D", adjusted: true, provider: "both" });
        if (!mounted) return;
        setState({ data: resp, loading: false });
      } catch (err: any) {
        if (!mounted) return;
        setState({ data: null, error: String(err?.message || err), loading: false });
      }
    })();

    return () => { mounted = false; };
  }, [symbol, fromISO, toISO]);

  // Контейнер и канва
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useResize(hostRef);

  const items = state.data?.items ?? [];
  const consensus = state.data?.consensus ?? [];

  // Подготовка шкал
  const xMin = items.length ? items[0].t : 0;
  const xMax = items.length ? items[items.length - 1].t : 1;
  const { minY, maxY } = extentY(items, true);

  const xScale = (t: number) => {
    if (xMax === xMin) return 0;
    return ((t - xMin) / (xMax - xMin)) * (w - 40) + 30; // паддинги
  };
  const yScale = (v: number) => {
    if (maxY === minY) return 0;
    // инверсия (сверху — max)
    return (1 - (v - minY) / (maxY - minY)) * (h - 60) + 20;
  };

  // Рисуем основной слой
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !w || !h) return;
    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.floor(w * dpr);
    cvs.height = Math.floor(h * dpr);
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // фон карточки
    ctx.clearRect(0, 0, w, h);
    // сетка по Y
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const yy = 20 + (i * (h - 60)) / 4;
      ctx.moveTo(30, yy);
      ctx.lineTo(w - 10, yy);
    }
    ctx.stroke();

    if (!items.length) return;

    // high-low "усы"
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const xx = xScale(it.t);
      const yH = yScale(it.h);
      const yL = yScale(it.l);
      ctx.moveTo(xx, yH);
      ctx.lineTo(xx, yL);
    }
    ctx.stroke();

    // линия close
    ctx.beginPath();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const xx = xScale(it.t);
      const yy = yScale(it.c);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.stroke();

    // заливка под линией close
    const grad = ctx.createLinearGradient(0, 20, 0, h - 40);
    grad.addColorStop(0, "rgba(0,0,0,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0.00)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const xx = xScale(it.t);
      const yy = yScale(it.c);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.lineTo(xScale(items[items.length - 1].t), h - 40);
    ctx.lineTo(xScale(items[0].t), h - 40);
    ctx.closePath();
    ctx.fill();

    // consensus линия (если есть пересечение провайдеров)
    if (consensus.length >= 5) {
      ctx.beginPath();
      for (let i = 0; i < consensus.length; i++) {
        const p = consensus[i];
        const xx = xScale(p.t);
        const yy = yScale(p.c);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [items, consensus, w, h, minY, maxY]); // eslint-disable-line

  // Overlay: курсор + тултип
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const cvs = overlayRef.current;
    if (!cvs || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.floor(w * dpr);
    cvs.height = Math.floor(h * dpr);
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!hover || !items.length) return;
    const i = hover.idx;
    const it = items[i];
    const xx = xScale(it.t);
    const yy = yScale(it.c);

    // crosshair
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, 15);
    ctx.lineTo(xx, h - 45);
    ctx.moveTo(25, yy);
    ctx.lineTo(w - 10, yy);
    ctx.stroke();

    // point
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.beginPath();
    ctx.arc(xx, yy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // tooltip
    const text = `${fmtDate(it.t)}  O:${formatMoney(it.o)}  H:${formatMoney(it.h)}  L:${formatMoney(it.l)}  C:${formatMoney(it.c)}`;
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    const tw = Math.min(w - 40, ctx.measureText(text).width + 16);
    const tx = Math.min(Math.max(xx + 8, 30), w - tw - 10);
    const ty = Math.max(22, yy - 36);

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, 28, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText(text, tx + 8, ty + 18);
  }, [hover, items, w, h, minY, maxY]); // eslint-disable-line

  // Наведение мыши
  const onMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    if (!items.length) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    // инвертируем xScale приблизительно
    const t = xMin + ((px - 30) / Math.max(1, (w - 40))) * (xMax - xMin);
    // бинарный поиск ближайшего индекса по времени
    let lo = 0, hi = items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(0, Math.min(items.length - 1, lo));
    setHover({ idx, x: px, y: 0 });
  };

  const onMouseLeave = () => setHover(null);

  return (
    <div className={styles.chartCard}>
      <h3>{t("stockDetails.chart")}</h3>

      <div ref={hostRef} style={{ position: "relative", width: "100%", height: 320 }}>
        {state.loading && (
          <div className={styles.chartPlaceholder}>({t("stockDetails.chartPlaceholder")})</div>
        )}
        {state.error && (
          <div className={styles.chartPlaceholder} style={{ color: "crimson" }}>
            {state.error}
          </div>
        )}
        {!state.loading && !state.error && !items.length && (
          <div className={styles.chartPlaceholder}>{t("common.noData") || "No data"}</div>
        )}

        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
        <canvas ref={overlayRef} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} style={{ position: "absolute", inset: 0 }} />

        {/* Нижняя подпись диапазона */}
        {!state.loading && items.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 30,
              right: 10,
              bottom: 6,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            <span>{state.data?.meta?.fromISO}</span>
            <span>{state.data?.meta?.toISO}</span>
          </div>
        )}
      </div>

      {/* Подвал: статистика покрытия провайдеров */}
      {!!state.data?.stats && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          {t("stockDetails.coverage") || "Coverage"}: overlap {state.data.stats.overlap ?? 0}
        </div>
      )}
    </div>
  );
}
