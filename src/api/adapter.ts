import type { Stock, MarketCapBand } from "../types/stock";

export type ApiProfile = {
  marketCapitalization?: number; // в миллионах/миллиардах? (мы трактуем как миллионы/миллиарды — не критично для бэнда)
  name?: string;
  ipo?: string;
};

export type ApiQuote = { c?: number };

function capToBand(capBillion?: number): MarketCapBand {
  const cap = capBillion ?? 0;
  if (cap >= 10_000) return "large";
  if (cap >= 2_000) return "mid";
  return "small";
}

export function toStock(ticker: string, profile: ApiProfile, quote: ApiQuote): Stock {
  const band = capToBand(profile.marketCapitalization);
  const listedAt = profile.ipo ? new Date(profile.ipo) : new Date();
  return {
    ticker,
    name: profile.name ?? ticker,
    price: quote.c ?? 0,
    category: band,
    listedAt,
  };
}
