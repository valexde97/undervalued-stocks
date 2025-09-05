// src/utils/marketSession.ts
export type MarketSession = "Pre-market" | "Regular" | "After-hours" | "Closed";
const TZ = "America/New_York";

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

function partsET(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, weekday: "short",
    hour: "2-digit", minute: "2-digit",
  });
  const map = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const wdNum = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[map.weekday as string] ?? 0;
  return {
    hh: Number(map.hour), mm: Number(map.minute), wdNum,
    timeText: `${pad2(Number(map.hour))}:${pad2(Number(map.minute))} ET`,
  };
}

function debugOverride(): MarketSession | null {
  if (typeof window === "undefined") return null;
  const qs = new URLSearchParams(window.location.search);
  const raw = (qs.get("debugMarket") || localStorage.getItem("invapp.debugMarket") || "").toLowerCase();
  switch (raw) {
    case "regular":
    case "open":
    case "opened":
      return "Regular";
    case "pre":
    case "pre-market":
    case "premarket":
      return "Pre-market";
    case "after":
    case "after-hours":
    case "afterhours":
      return "After-hours";
    case "closed":
    case "close":
      return "Closed";
    default:
      return null;
  }
}

export function getMarketSession(now = new Date()) {
  // 1) debug override (для симуляции)
  const dbg = debugOverride();
  if (dbg) {
    return { session: dbg, isOpen: dbg === "Regular", nowEtText: partsET(now).timeText };
  }

  // 2) обычная логика по ET
  const et = partsET(now);
  const minutes = et.hh * 60 + et.mm;
  const weekend = et.wdNum === 0 || et.wdNum === 6;

  const PRE = 4 * 60;        // 04:00
  const REG_S = 9 * 60 + 30; // 09:30
  const REG_E = 16 * 60;     // 16:00
  const AFT_E = 20 * 60;     // 20:00

  let session: MarketSession = "Closed";
  if (!weekend) {
    if (minutes >= REG_S && minutes < REG_E) session = "Regular";
    else if (minutes >= PRE && minutes < REG_S) session = "Pre-market";
    else if (minutes >= REG_E && minutes < AFT_E) session = "After-hours";
  }

  return { session, isOpen: session === "Regular", nowEtText: et.timeText };
}
