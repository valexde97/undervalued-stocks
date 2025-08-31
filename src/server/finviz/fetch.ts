// src/server/finviz/fetch.ts
import { parseTable } from "./parse";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const PAGE_SIZE = 20 as const;

// Базовые фильтры — можно переопределить через ?f=...
const DEFAULT_FILTERS = "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex";

function buildUrl(page: number, f: string, v: "121" | "111") {
  const start = 1 + page * PAGE_SIZE; // 1,21,41...
  return `${BASE}?v=${v}&f=${encodeURIComponent(f)}&r=${start}&ft=2`;
}

async function fetchView(f: string, page: number, view: "121" | "111") {
  const res = await fetch(buildUrl(page, f, view), {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finviz.com/screener.ashx",
    } as any,
    // чтобы не кэшировать на edge-уровне
    cache: "no-store" as any,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Finviz ${view} fetch failed: ${res.status} ${res.statusText}\n${txt.slice(0, 200)}`);
  }
  const html = await res.text();
  return parseTable(html);
}

function mergeByTicker(a: any[], b: any[]) {
  const map = new Map<string, any>();
  for (const r of a) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  for (const r of b) map.set(r.ticker, { ...(map.get(r.ticker) || {}), ...r });
  return Array.from(map.values());
}

// «ступени расслабления» фильтров — для доливки первой страницы до 20
const FILTER_STAGES = [
  { name: "strict", f: DEFAULT_FILTERS },
  { name: "no_pe", f: "sh_price_u20,fa_ps_u1,exch_nasd,exch_nyse,exch_amex" },
];

export async function fetchFinvizSet(opts: {
  page: number;
  fOverride?: string;
  minDesired?: number; // желаемый минимум на страницу; best effort
}): Promise<{ items: any[]; debug: { stage: string; count: number }[]; hasMore: boolean }> {
  const page = Math.max(0, opts.page | 0);
  const f = opts.fOverride || DEFAULT_FILTERS;
  const minDesired = Math.max(1, opts.minDesired ?? PAGE_SIZE);

  // грузим 121 (valuation) + 111 (overview) параллельно
  const [v121, v111] = await Promise.all([fetchView(f, page, "121"), fetchView(f, page, "111")]);
  let merged = mergeByTicker(v121, v111);

  const debug: { stage: string; count: number }[] = [{ stage: "base", count: merged.length }];

  // hasMore: если page >=1 и ровно PAGE_SIZE — значит очень вероятно есть следующая
  let hasMore = merged.length === PAGE_SIZE;

  // только для первой страницы пытаемся «долить» до minDesired, расслабляя фильтры
  if (page === 0 && merged.length < minDesired && !opts.fOverride) {
    for (const st of FILTER_STAGES.slice(1)) {
      const [s121, s111] = await Promise.all([fetchView(st.f, page, "121"), fetchView(st.f, page, "111")]);
      const stageMerged = mergeByTicker(s121, s111);
      debug.push({ stage: st.name, count: stageMerged.length });
      // наполняем, но не дублируем тикеры
      const byTicker = new Map<string, any>(merged.map((x) => [x.ticker, x]));
      for (const r of stageMerged) if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
      merged = Array.from(byTicker.values());
      if (merged.length >= minDesired) break;
    }
    hasMore = merged.length >= PAGE_SIZE; // по первой странице — эвристика
  }

  return { items: merged.slice(0, PAGE_SIZE), debug, hasMore };
}
