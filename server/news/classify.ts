// server/news/classify.ts
import { ClassifiedItem, RawNewsItem } from "./types";

const TAGS = {
  Debt: [
    "debt","bond","bonds","refinanc","refinance","refinancing","leverage","covenant","credit facility","term loan","interest expense","maturity","notes offering"
  ],
  Mgmt: [
    "ceo","cfo","coo","cto","chairman","board","director","resigns","steps down","appoint","appointed","retire","succession"
  ],
  Guidance: [
    "guidance","outlook","forecast","eps","revenue","top line","bottom line","beat","miss","raises","cuts","lower","increase","decrease"
  ],
  Legal: [
    "sec","subpoena","probe","investigation","lawsuit","settlement","fine","penalty","class action","fda","ema","approval","complete response","crl"
  ],
  Capital: [
    "buyback","repurchase","dividend","distribution","offering","dilution","at-the-market","atm program","split","reverse split","spinoff","spin-off"
  ],
} as const;

const POS = ["beat","raise","approval","contract","record","buyback","repurchase","increase","initiated buy","upgrade"] as const;
const NEG = ["miss","cut","downgrade","halt","bankruptcy","layoff","probe","investigation","lawsuit","dilution","warning","delay","recall","crl"] as const;

function containsAny(s: string, words: ReadonlyArray<string>) {
  const x = s.toLowerCase();
  return words.some(w => x.includes(w));
}

export function classify(items: RawNewsItem[]): ClassifiedItem[] {
  return items.map(it => {
    const base = `${it.title} ${it.summary ?? ""}`.toLowerCase();

    const tags: ClassifiedItem["tags"] = [];
    for (const [tag, words] of Object.entries(TAGS)) {
      if (containsAny(base, words)) tags.push(tag as ClassifiedItem["tags"][number]);
    }

    let score = 0;
    let sentiment: ClassifiedItem["sentiment"] = "neutral";
    const posHits = POS.filter(w => base.includes(w)).length;
    const negHits = NEG.filter(w => base.includes(w)).length;

    score += posHits * 2 - negHits * 2;
    if (posHits > negHits && posHits > 0) sentiment = "positive";
    else if (negHits > posHits && negHits > 0) sentiment = "negative";

    score += tags.length;

    return { ...it, tags, sentiment, score };
  });
}
