// src/api/valuation.ts
// Тянем котировку и метрики, считаем базовые мультипликаторы.

export type Metrics = {
  marketCap?: number;
  operatingCfTTM?: number;
  capexTTM?: number;
  epsTTM?: number;
  ebitdaTTM?: number;
  totalDebt?: number;
  cashAndEq?: number;
  revenueGrowthTTMYoy?: number; // доля (0.15 = 15%)
};

export type Valuation = {
  price: number | null;
  pe: number | null;
  pFcf: number | null;
  fcfYield: number | null;  // доля (0.08 = 8%)
  evEbitda: number | null;
  peg: number | null;
};

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export async function loadValuation(symbol: string): Promise<Valuation> {
  const [quote, metrics] = await Promise.all([
    fetchJSON<any>(`/api/fh/quote?symbol=${encodeURIComponent(symbol)}`),
    fetchJSON<Metrics>(`/api/fh/metrics?symbol=${encodeURIComponent(symbol)}`),
  ]);

  const price = typeof quote?.c === "number" ? quote.c : null;

  const marketCap = metrics.marketCap ?? 0;
  const ocf = metrics.operatingCfTTM ?? 0;
  const capex = metrics.capexTTM ?? 0;
  const fcf = ocf - capex;
  const ev = marketCap + (metrics.totalDebt ?? 0) - (metrics.cashAndEq ?? 0);

  const eps = metrics.epsTTM ?? null;
  const ebitda = metrics.ebitdaTTM ?? null;
  const growth = metrics.revenueGrowthTTMYoy ?? null; // доля

  const pe =
    price != null && eps && eps !== 0 ? price / eps : null;

  const pFcf =
    marketCap && fcf && fcf !== 0 ? marketCap / fcf : null;

  const fcfYield =
    marketCap && fcf ? fcf / marketCap : null; // доля (0.08 = 8%)

  const evEbitda =
    ev && ebitda && ebitda !== 0 ? ev / ebitda : null;

  const peg =
    pe != null && growth && growth > 0 ? pe / (growth * 100) : null; // growth -> %

  return { price, pe, pFcf, fcfYield, evEbitda, peg };
}
