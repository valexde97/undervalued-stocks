// src/utils/autoAnalysis.ts
function pick(m: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = m?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
function fmt(n: number) {
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function generateAutoAnalysis(m: Record<string, any>) {
  const strengths: string[] = [];
  const risks: string[] = [];
  const notes: string[] = [];

  const pe = pick(m, ["peTTM","peInclExtraTTM","peExclExtraTTM","peBasicExclExtraTTM"]);
  if (isNum(pe) && pe > 0 && pe < 10) strengths.push(`Low P/E ${fmt(pe)} — potential undervaluation.`);
  const ps = pick(m, ["psTTM","psAnnual"]);
  if (isNum(ps) && ps < 1) strengths.push(`P/S ${fmt(ps)} < 1 — inexpensive sales.`);
  const pb = pick(m, ["pb","priceToBookAnnual"]);
  if (isNum(pb) && pb < 1) strengths.push(`P/B ${fmt(pb)} < 1 — trades below book value.`);

  const gm = pick(m, ["grossMarginTTM","grossMarginAnnual"]);
  if (isNum(gm)) strengths.push(`Gross margin ${fmt(gm)}% — indicative of pricing power.`);

  const cr = pick(m, ["currentRatioTTM","currentRatioAnnual"]);
  if (isNum(cr) && cr >= 1.5) strengths.push(`Current ratio ${fmt(cr)} — comfortable liquidity.`);

  const nm = pick(m, ["netProfitMarginTTM","netMarginAnnual"]);
  if (isNum(nm) && nm < 0) risks.push(`Net margin ${fmt(nm)}% — loss-making on a TTM basis.`);

  const de = pick(m, ["debtToEquityTTM","debtToEquityAnnual"]);
  if (isNum(de) && de > 1) risks.push(`Debt/Equity ${fmt(de)} — elevated leverage.`);

  if (!strengths.length && !risks.length) notes.push("Not enough metrics for a definitive view.");

  return { strengths, risks, notes };
}
