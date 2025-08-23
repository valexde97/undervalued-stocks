import { withTokenBase } from "./utilToken";

export type FinnhubSymbol = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;     // "Common Stock"
  currency: string; // "USD"
  mic?: string;     // "XNAS","XNYS","ARCX","BATS","XASE","IEXG"... (исключим OTC)
};

const SYMBOLS_KEY = "symbols_cache_v1";
const SYMBOLS_TS_KEY = "symbols_cache_ts_v1";

async function fetchSymbolsRaw(): Promise<FinnhubSymbol[]> {
  const url = withTokenBase("/stock/symbol", { exchange: "US" });
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch symbols");
  return res.json();
}

function acceptMic(mic?: string) {
  const m = (mic || "").toUpperCase();
  // приемлемые биржи (без OTC/PINK)
  return ["XNAS", "XNYS", "ARCX", "BATS", "XASE", "IEXG"].includes(m);
}

function acceptType(type: string) {
  return type.toLowerCase().includes("common");
}

export async function getCachedSymbols(maxAgeDays = 7): Promise<FinnhubSymbol[]> {
  const cached = localStorage.getItem(SYMBOLS_KEY);
  const ts = Number(localStorage.getItem(SYMBOLS_TS_KEY) || 0);
  const ageDays = (Date.now() - ts) / 86_400_000;

  if (cached && ageDays < maxAgeDays) {
    return JSON.parse(cached) as FinnhubSymbol[];
  }

  const all = await fetchSymbolsRaw();
  const filtered = all
    .filter(s => s.currency === "USD")
    .filter(s => acceptType(s.type))
    .filter(s => acceptMic(s.mic))
    // детерминированный порядок — по symbol
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  localStorage.setItem(SYMBOLS_KEY, JSON.stringify(filtered));
  localStorage.setItem(SYMBOLS_TS_KEY, String(Date.now()));
  return filtered;
}
