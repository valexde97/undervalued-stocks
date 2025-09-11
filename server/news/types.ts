export type RawNewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  summary?: string | null;
};

export type ClassifiedItem = RawNewsItem & {
  tags: ("Debt" | "Mgmt" | "Guidance" | "Legal" | "Capital")[];
  sentiment: "positive" | "negative" | "neutral";
  score: number; // для сортировки
};

export type AggregateInput = {
  symbol: string;
  lookbackDays: number;
  limit: number;
};

export type AggregateOutput = {
  insights: string[];
  items: ClassifiedItem[];
  meta?: {
    symbol: string;
    lookbackDays: number;
    sources: string[];
    generatedAt: string;
    llm?: "on" | "off";
  };
};
