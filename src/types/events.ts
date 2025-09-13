export type CatalystEvent = {
  symbol: string;
  type: "EARNINGS"|"FDA"|"MEETING"|"NASDAQ_HEARING"|"COURT"|"SPLIT";
  date: string; certainty: "confirmed"|"estimated";
  title: string; source: "Finviz"|"Finnhub"|"SEC"|"Yahoo"|"Manual";
  tags?: string[]; // "Legal","Capital"
};


