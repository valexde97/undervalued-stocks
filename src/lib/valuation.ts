// src/lib/valuation.ts
export type MarketCapBand = "small" | "mid" | "large";

export type ValuationInputs = {
  price: number | null | undefined;               // текущая цена
  category: MarketCapBand | null | undefined;     // small/mid/large
  metric: Record<string, any> | null | undefined; // Finnhub metrics blob
  options?: {
    marginOfSafety?: number;   // default 0.30
    riskCapMultiple?: number;  // default 5 (макс. множитель к текущей цене в high-risk)
  };
};

export type MethodKey = "pe" | "pfcf" | "ps" | "pb";

export type MethodResult = {
  key: MethodKey;
  available: boolean;
  low?: number;
  base?: number;
  high?: number;
};

export type AltCalc = {
  key: "blend" | "equal_weight" | "downside" | "pb_only" | "ps_only";
  label: string;
  source: string; // краткое описание формулы/подхода
  available: boolean;
  low?: number | null;
  base?: number | null;
  high?: number | null;
};

export type ValuationResult = {
  blended: { low: number | null; base: number | null; high: number | null } | null;
  methods: MethodResult[];
  mos: { threshold: number; pass: boolean | null } | null;
  warnings: string[];
  altCalcs: AltCalc[];                // доп. калькуляторы (включая "blend" как первый)
  compositeAverage: number | null;    // среднее по доступным вариантам (base)
};

const toNum = (v: any): number | null => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};

function pick(m: Record<string, any> | null | undefined, keys: string[]): number | null {
  if (!m) return null;
  for (const k of keys) {
    const v = toNum(m[k]);
    if (v !== null) return v;
  }
  return null;
}

function targets(cat: MarketCapBand | null | undefined) {
  if (cat === "large") {
    return {
      pe:   { low: 12, base: 16, high: 22 },
      pfcf: { low: 12, base: 16, high: 22 },
      ps:   { low: 1.0, base: 1.5, high: 2.0 },
      pb:   { low: 1.0, base: 1.4, high: 1.9 },
    };
  }
  if (cat === "mid") {
    return {
      pe:   { low: 10, base: 14, high: 18 },
      pfcf: { low: 10, base: 14, high: 18 },
      ps:   { low: 0.8, base: 1.2, high: 1.6 },
      pb:   { low: 0.8, base: 1.2, high: 1.6 },
    };
  }
  return { // small/micro
    pe:   { low: 8, base: 12, high: 16 },
    pfcf: { low: 8, base: 12, high: 16 },
    ps:   { low: 0.5, base: 1.0, high: 1.5 },
    pb:   { low: 0.7, base: 1.0, high: 1.3 },
  };
}

function round2(v: number | null): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}

export function computeValuation(input: ValuationInputs): ValuationResult {
  const warnings: string[] = [];
  const m = input.metric ?? {};
  const price = toNum(input.price);
  const mos = Math.max(0, Math.min(0.9, input.options?.marginOfSafety ?? 0.30));
  const riskCap = Math.max(1, Math.min(20, input.options?.riskCapMultiple ?? 5));

  if (price == null || price <= 0) {
    return {
      blended: null,
      methods: [],
      mos: { threshold: mos, pass: null },
      warnings: ["Price is missing — cannot compute valuation."],
      altCalcs: [],
      compositeAverage: null,
    };
  }

  const cat = (input.category ?? null) as MarketCapBand | null;
  const t0 = targets(cat);

  // Текущие мультипликаторы (из Finnhub)
  const pe   = pick(m, ["peTTM", "peInclExtraTTM", "peExclExtraTTM", "peBasicExclExtraTTM"]);
  const ps   = pick(m, ["psTTM", "psAnnual"]);
  const pb   = pick(m, ["pb", "priceToBookAnnual", "ptbvQuarterly", "ptbvAnnual"]);
  const pfcf = pick(m, ["pfcfShareTTM", "pfcfShareAnnual"]);

  // Рисковая корректировка таргетов
  const netMargin = pick(m, ["netProfitMarginTTM", "netMarginAnnual", "netProfitMargin5Y"]);
  const roe       = pick(m, ["roeTTM", "roeAnnual"]);
  const revGyoy   = pick(m, ["revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy"]);
  const r52w      = pick(m, ["52WeekPriceReturnDaily", "yearToDatePriceReturnDaily"]);
  const beta      = pick(m, ["beta"]);

  let highRisk = false;

  // аккуратная «копия» таргетов
  const mult = {
    pe:   { ...t0.pe },
    pfcf: { ...t0.pfcf },
    ps:   { ...t0.ps },
    pb:   { ...t0.pb },
  };

  if (netMargin != null && netMargin < 0) {
    const f = 0.5;
    mult.pe.low *= f;  mult.pe.base *= f;  mult.pe.high *= f;
    mult.pfcf.low *= f; mult.pfcf.base *= f; mult.pfcf.high *= f;
    warnings.push("Negative net margin — downshifted PE/PFCF targets.");
  }
  if (roe != null && roe < 5) {
    const f = 0.7;
    mult.pb.low *= f; mult.pb.base *= f; mult.pb.high *= f;
    warnings.push("Low ROE — downshifted PB targets.");
  }
  if (revGyoy != null && revGyoy < 0) {
    const f = 0.75;
    mult.ps.low *= f; mult.ps.base *= f; mult.ps.high *= f;
    warnings.push("Negative revenue growth — downshifted PS targets.");
  }
  if ((r52w != null && r52w <= -90) || (beta != null && beta > 2.2)) {
    highRisk = true;
    warnings.push("High-risk profile (52w drawdown or high beta).");
  }

  // Модели: fair = price * (target / current)
  const priceFromRatio = (current: number | null, target: number): number | null => {
    if (current == null || !Number.isFinite(current) || current <= 0) return null;
    return round2(price * (target / current));
  };

  const methods: MethodResult[] = [
    pe   != null ? { key: "pe",   available: true,
      low: priceFromRatio(pe, mult.pe.low)!,   base: priceFromRatio(pe, mult.pe.base)!,   high: priceFromRatio(pe, mult.pe.high)! } : { key: "pe", available: false },
    pfcf != null ? { key: "pfcf", available: true,
      low: priceFromRatio(pfcf, mult.pfcf.low)!, base: priceFromRatio(pfcf, mult.pfcf.base)!, high: priceFromRatio(pfcf, mult.pfcf.high)! } : { key: "pfcf", available: false },
    ps   != null ? { key: "ps",   available: true,
      low: priceFromRatio(ps, mult.ps.low)!,   base: priceFromRatio(ps, mult.ps.base)!,   high: priceFromRatio(ps, mult.ps.high)! } : { key: "ps", available: false },
    pb   != null ? { key: "pb",   available: true,
      low: priceFromRatio(pb, mult.pb.low)!,   base: priceFromRatio(pb, mult.pb.base)!,   high: priceFromRatio(pb, mult.pb.high)! } : { key: "pb", available: false },
  ];

  const avail = Object.fromEntries(methods.map(x => [x.key, x.available])) as Record<MethodKey, boolean>;

  // Веса для базового blend
  let weights: Partial<Record<MethodKey, number>> = {};
  if (avail.pfcf && avail.pe) {
    weights = { pfcf: 0.45, pe: 0.30, pb: 0.15, ps: 0.10 };
  } else if (avail.pfcf && !avail.pe) {
    weights = { pfcf: 0.60, ps: 0.25, pb: 0.15 };
  } else if (!avail.pfcf && avail.pe) {
    weights = { pe: 0.55, pb: 0.30, ps: 0.15 };
  } else if (avail.ps || avail.pb) {
    weights = { ps: 0.60, pb: 0.40 };
  }

  // нормализация весов, выкинуть недоступные
  let ws = 0;
  for (const k of Object.keys(weights) as MethodKey[]) {
    if (!avail[k]) delete weights[k];
    else ws += weights[k]!;
  }
  for (const k of Object.keys(weights) as (keyof typeof weights)[]) {
    (weights as any)[k] = (weights as any)[k]! / ws;
  }

  const combineWeighted = (slot: "low" | "base" | "high"): number | null => {
    if (!ws) return null;
    let sum = 0;
    for (const mth of methods) {
      if (!mth.available || mth[slot] == null) continue;
      const w = (weights as any)[mth.key] ?? 0;
      sum += (mth[slot]! * w);
    }
    return round2(sum);
  };

  let blended = {
    low:  combineWeighted("low"),
    base: combineWeighted("base"),
    high: combineWeighted("high"),
  };

  // Доп. калькуляции
  const combineEqual = (slot: "low" | "base" | "high"): number | null => {
    const vals = methods.filter(m => m.available && m[slot] != null).map(m => m[slot]!) as number[];
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return round2(avg);
  };
  const combineDownside = (): number | null => combineEqual("low");

  const peOnly = methods.find(m => m.key === "pe");
  const psOnly = methods.find(m => m.key === "ps");
  const pbOnly = methods.find(m => m.key === "pb");

  const alt: AltCalc[] = [];

  // 0) базовый blend
  alt.push({
    key: "blend",
    label: "Multiples Blend (cap-size targets)",
    source:
      "Price × (TargetMultiple / CurrentMultiple) blended across P/FCF, P/E, P/S, P/B; targets by market-cap band with risk downshifts and sanity cap.",
    available: blended.base != null,
    low: blended.low, base: blended.base, high: blended.high,
  });

  // 1) Equal-weight
  alt.push({
    key: "equal_weight",
    label: "Equal-Weight Multiples",
    source: "Average of Price × (Target/Current) across available multiples (PE, PFCF, PS, PB).",
    available: combineEqual("base") != null,
    low: combineEqual("low"), base: combineEqual("base"), high: combineEqual("high"),
  });

  // 2) Downside (low targets only)
  const downside = combineDownside();
  alt.push({
    key: "downside",
    label: "Downside (Low Targets)",
    source: "Average of *low* target prices across available multiples; conservative case.",
    available: downside != null,
    low: downside, base: downside, high: downside,
  });

  // 3) PB-only (ROE-tuned)
  alt.push({
    key: "pb_only",
    label: "PB-only (ROE-tuned)",
    source: "Price × (TargetPB / CurrentPB), with TargetPB reduced when ROE < 5%.",
    available: !!(pbOnly?.available && pbOnly.base != null),
    low: pbOnly?.low ?? null, base: pbOnly?.base ?? null, high: pbOnly?.high ?? null,
  });

  // 4) PS-only (Margin-tuned)
  alt.push({
    key: "ps_only",
    label: "PS-only (Margin-tuned)",
    source: "Price × (TargetPS / CurrentPS), with TargetPS reduced when margins/growth are weak.",
    available: !!(psOnly?.available && psOnly.base != null),
    low: psOnly?.low ?? null, base: psOnly?.base ?? null, high: psOnly?.high ?? null,
  });

  // Sanity-cap для high-risk — применяем ко всем вариантам
  if (highRisk) {
    const applyCap = (v: number | null | undefined) => {
      if (v == null) return null;
      const cap = price * riskCap;
      return v > cap ? round2(cap) : v;
    };

    const capBlended = (b: { low: number | null; base: number | null; high: number | null }) => ({
      low:  applyCap(b.low),
      base: applyCap(b.base),
      high: applyCap(b.high),
    });

    blended = capBlended(blended);
    for (const a of alt) {
      a.low  = applyCap(a.low);
      a.base = applyCap(a.base);
      a.high = applyCap(a.high);
    }
    warnings.push(`High-risk sanity cap applied at ×${riskCap} of current price.`);
  }

  const mosPass = blended.base != null ? price <= blended.base * (1 - mos) : null;

  // Композитное среднее по всем доступным base-оценкам
  const bases = alt.filter(a => a.available && a.base != null).map(a => a.base!) as number[];
  const compositeAverage = bases.length ? round2(bases.reduce((a,b)=>a+b,0)/bases.length) : null;

  return {
    blended,
    methods,
    mos: { threshold: mos, pass: mosPass },
    warnings,
    altCalcs: alt,
    compositeAverage,
  };
}
