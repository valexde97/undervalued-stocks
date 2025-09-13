export type DataConfidence = {
  symbol: string; asOf: string; score: number; // 0–100
  checks: Array<{key:string; pass:boolean; note?:string}>;
};
