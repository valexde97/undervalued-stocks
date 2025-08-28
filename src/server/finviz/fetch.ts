// src/server/finviz/fetch.ts
import { parseTable } from "./parse";

const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const PAGE_SIZE = 20 as const;

function buildUrl(page: number, f: string, v: "121" | "111") {
  const start = 1 + page * PAGE_SIZE; // 1,21,41...
  return `${BASE}?v=${v}&f=${encodeURIComponent(f)}&r=${start}&ft=2`;
}

async function fetchView(f: string, page: number, view: "121" | "111") {
  const res = await fetch(buildUrl(page, f, view), {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finviz.com/screener.ashx",
    },
  });
  const html = await res.text();
  return parseTable(html);
}

async function fetchSet(f: string, page: number) {
  const [v121, v111] = await Promise.all([fetchView(f, page, "121"), fetchView(f, page, "111")]);
  const by = new Map<string, any>();
  for (const r of v121) by.set(r.ticker, { ...(by.get(r.ticker) || {}), ...r });
  for (const r of v111) by.set(r.ticker, { ...(by.get(r.ticker) || {}), ...r });
  return Array.from(by.values());
}

// «Ступени расслабления» фильтров:
const FILTER_STAGES = [
  { name: "strict", f: "sh_price_u20,fa_pe_u15,fa_ps_u1,exch_nasd,exch_nyse,exch_amex" },
  { name: "no_pe",  f: "sh_price_u20,fa_ps_u1,exch_nasd,exch_nyse,exch_amex" },
];

export async function fetchFinvizSet({
  page,
  fOverride,
  minDesired = PAGE_SIZE,
}: {
  page: number;
  fOverride?: string;
  minDesired?: number;
}) {
  const relaxTopUp = page === 0; // доливаем только первую страницу
  const stages = fOverride
    ? [{ name: "override", f: fOverride }]
    : relaxTopUp
    ? FILTER_STAGES
    : [FILTER_STAGES[0]];

  const debug: Array<{ stage: string; count: number }> = [];
  const byTicker = new Map<string, any>();

  for (const st of stages) {
    const rows = await fetchSet(st.f, page);
    debug.push({ stage: st.name, count: rows.length });

    for (const r of rows) {
      if (byTicker.size >= minDesired) break;
      if (!byTicker.has(r.ticker)) {
        byTicker.set(r.ticker, { ...r, __stage: st.name });
      }
    }
    if (byTicker.size >= minDesired) break;
  }

  const items = Array.from(byTicker.values());
  const stageRank = new Map(stages.map((s, i) => [s.name, i]));
  items.sort((a: any, b: any) => {
    const ra = stageRank.get(a.__stage) ?? 999;
    const rb = stageRank.get(b.__stage) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.ticker.localeCompare(b.ticker);
  });

  return {
    page,
    pageSize: PAGE_SIZE,
    items: items.map(({ __stage, ...x }) => x),
    debug,
  };
}
