// src/utils/marketCap.ts

/** "49.06M" | "12.83B" | "1.2T" -> число в МЛН $ (или null) */
export function parseCapTextToMillions(txt?: string | null): number | null {
  if (!txt) return null;
  const s = String(txt).trim().replace(/[, ]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)([MBT])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toUpperCase();
  if (u === "B") return Math.round(n * 1000 * 100) / 100;       // млрд → млн
  if (u === "T") return Math.round(n * 1_000_000 * 100) / 100;  // трлн → млн
  return Math.round(n * 100) / 100;                             // млн
}

export type MarketCapBand = "small" | "mid" | "large";

/** Классификация по капе (в млн $): <2B small, 2–10B mid, ≥10B large */
export function capToBandMillions(mcM?: number | null): MarketCapBand | null {
  if (mcM == null) return null;
  const mcB = mcM / 1000;
  if (mcB >= 10) return "large";
  if (mcB >= 2) return "mid";
  return "small";
}
