export type RuleCondition = {
  feature: string; op: ">"|">="|"<"|"<="|"=="|"crossesAbove"|"crossesBelow";
  value?: number | string; lookbackDays?: number;
};
export type Rule = { id: string; name: string; conditions: RuleCondition[]; all?: boolean }; // all=true → AND, иначе OR
export type Ruleset = { id: string; version: string; rules: Rule[]; };
export type Signal = {
  id: string; symbol: string; ruleId: string; at: string;
  pass: boolean; confidence: number; // 0–100
  facts: Record<string, number|string>; // объясняющие цифры
};
