// src/server/finviz/fetch.ts
import { parseTable } from "./parse";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const PAGE_SIZE = 20 as const;

// Базовые фильтры — мягкий и строгий
const FILTER_STRICT = "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";
const FILTER_RELAX  = "sh_price_u20,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";

const BASE_DELAY_MS = 450;
let lastHitAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (a = 60, b = 180) => Math.floor(a + Math.random() * (b - a));
async function throttleOnce() {
  const now = Date.now();
  const wait = Math.max(0, BASE_DELAY_MS - (now - lastHitAt));
  if (wait > 0) await sleep(wait);
  lastHitAt = Date.now();
}

function buildUrl(page: number, f: string, v: "121" | "111") {
  const start = 1 + page * PAGE_SIZE; // 1,21,41...
  return `${BASE}?v=${v}&f=${encodeURIComponent(f)}&r=${start}&ft=2`;
}

async function fetchHtml(url: string): Promise<string> {
  await throttleOnce();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finviz.com/screener.ashx",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    } as any,
    redirect: "follow" as any,
    cache: "no-store" as any,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Finviz fetch failed: ${res.status} ${res.statusText} :: ${txt.slice(0, 300)}`);
  }
  return res.text();
}

async function fetchView(f: string, page: number, view: "121" | "111") {
  const html = await fetchHtml(buildUrl(page, f, view));
  return parseTable(html);
}

function mergeByTicker(a: any[], b: any[]) {
  const map = new Map<string, any>();
  for (const r of a) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  for (const r of b) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  return Array.from(map.values());
}

/**
 * ВАЖНО: консистентность страниц
 * - page=0: пытаемся на STRICT; если <20 — выбираем RELAX как эффективный фильтр и ПЕРЕЗАПРАШИВАЕМ page=0 уже на RELAX.
 * - page>0: всегда используем fOverride, если передан, ИНАЧЕ — STRICT (но клиент с этого момента шлёт f=effectiveF).
 */
export async function fetchFinvizSet(opts: {
  page: number;
  fOverride?: string;
  minDesired?: number;
}): Promise<{
  items: any[];
  debug: { stage: string; count: number }[];
  hasMore: boolean;
  effectiveF: string;
}> {
  const page = Math.max(0, opts.page | 0);
  const minDesired = Math.max(1, opts.minDesired ?? PAGE_SIZE);

  // Если клиент явно указал f — используем его без «доливок»
  if (opts.fOverride) {
    const debug: { stage: string; count: number }[] = [];
    const v121 = await fetchView(opts.fOverride, page, "121").catch(() => {
      debug.push({ stage: "base_121_err", count: 0 });
      return [] as any[];
    });
    if (v121.length) debug.push({ stage: "base_121", count: v121.length });
    await sleep(100 + jitter());
    const v111 = await fetchView(opts.fOverride, page, "111").catch(() => {
      debug.push({ stage: "base_111_err", count: 0 });
      return [] as any[];
    });
    if (v111.length) debug.push({ stage: "base_111", count: v111.length });

    const merged = mergeByTicker(v121, v111);
    const hasMore = merged.length >= PAGE_SIZE;
    return {
      items: merged.slice(0, PAGE_SIZE),
      debug,
      hasMore,
      effectiveF: opts.fOverride,
    };
  }

  // Иначе — это «первая страница с автоподбором фильтра»
  if (page === 0) {
    const debug: { stage: string; count: number }[] = [];

    // 1) Пробуем STRICT
    const s121 = await fetchView(FILTER_STRICT, 0, "121").catch(() => {
      debug.push({ stage: "strict_121_err", count: 0 });
      return [] as any[];
    });
    if (s121.length) debug.push({ stage: "strict_121", count: s121.length });
    await sleep(100 + jitter());
    const s111 = await fetchView(FILTER_STRICT, 0, "111").catch(() => {
      debug.push({ stage: "strict_111_err", count: 0 });
      return [] as any[];
    });
    if (s111.length) debug.push({ stage: "strict_111", count: s111.length });

    const strictMerged = mergeByTicker(s121, s111);
    const strictHasPage = strictMerged.length >= PAGE_SIZE;

    if (strictHasPage) {
      // strict хватает — это и есть effectiveF
      return {
        items: strictMerged.slice(0, PAGE_SIZE),
        debug,
        hasMore: true,
        effectiveF: FILTER_STRICT,
      };
    }

    // 2) Иначе — выбираем RELAX как эффективный фильтр и ПОЛНОСТЬЮ тянем page=0 по RELAX
    const r121 = await fetchView(FILTER_RELAX, 0, "121").catch(() => {
      debug.push({ stage: "relax_121_err", count: 0 });
      return [] as any[];
    });
    if (r121.length) debug.push({ stage: "relax_121", count: r121.length });
    await sleep(100 + jitter());
    const r111 = await fetchView(FILTER_RELAX, 0, "111").catch(() => {
      debug.push({ stage: "relax_111_err", count: 0 });
      return [] as any[];
    });
    if (r111.length) debug.push({ stage: "relax_111", count: r111.length });

    const relaxMerged = mergeByTicker(r121, r111);
    const hasMore = relaxMerged.length >= PAGE_SIZE;

    return {
      items: relaxMerged.slice(0, PAGE_SIZE),
      debug,
      hasMore,
      effectiveF: FILTER_RELAX,
    };
  }

  // page > 0 без fOverride — клиент ещё не подхватил effectiveF (маловероятно),
  // идём на STRICT (чтобы не гадать); после первой страницы клиент начнёт присылать f=...
  const debug: { stage: string; count: number }[] = [];
  const v121 = await fetchView(FILTER_STRICT, page, "121").catch(() => {
    debug.push({ stage: "base_121_err", count: 0 });
    return [] as any[];
  });
  if (v121.length) debug.push({ stage: "base_121", count: v121.length });
  await sleep(100 + jitter());
  const v111 = await fetchView(FILTER_STRICT, page, "111").catch(() => {
    debug.push({ stage: "base_111_err", count: 0 });
    return [] as any[];
  });
  if (v111.length) debug.push({ stage: "base_111", count: v111.length });
  const merged = mergeByTicker(v121, v111);

  return {
    items: merged.slice(0, PAGE_SIZE),
    debug,
    hasMore: merged.length >= PAGE_SIZE,
    effectiveF: FILTER_STRICT,
  };
}
