export type IndicatorSnapshot = {
  symbol: string;
  asOf: string;            // ISO
  // Trend/Momentum
  sma50?: number; sma150?: number; sma200?: number; ema21?: number;
  rsi14?: number; macd?: { macd: number; signal: number; hist: number };
  atr14?: number; bb?: { width: number; upper: number; lower: number };
  rsVsSpy?: number;        // 0–100 percentile vs SPY
  proximity52wHigh?: number; // %, + вверх плохо/хорошо использовать сознательно
  // Liquidity
  avgVol20?: number; avgVol50?: number; avgDollarVol50?: number;
  freeFloat?: number | null; slippageEst?: number | null;
  // Quality/Risk
  piotroskiF?: number | null; altmanZ?: number | null; beneishM?: number | null;
  accruals?: number | null; interestCoverage?: number | null;
  qualityScore?: number | null; riskScore?: number | null; // 0–100
  // Flags
  microcapMode: boolean;
  canaries: Array<"Split"|"Consolidation"|"RegisteredDirect"|"ATM"|"NasdaqNotice"|"DelistingRisk">;
};
