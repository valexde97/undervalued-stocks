// /api/sec/company-facts.ts
// Maps TICKER -> CIK, then fetches companyfacts and returns a compact, UI-friendly shape.
// ENV: SEC_USER_AGENT="undervalued-stocks/1.0 (contact: you@example.com)"
export const runtime = "nodejs";

let tickersCache:
  | { ts: number; byTicker: Record<string, { cik: string; title: string }> }
  | null = null;

async function getTickerMap(userAgent: string) {
  const FRESH_MS = 24 * 3600 * 1000; // 24h
  if (tickersCache && Date.now() - tickersCache.ts < FRESH_MS) {
    return tickersCache.byTicker;
  }
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "user-agent": userAgent, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers ${r.status}`);
  const data = await r.json();
  const byTicker: Record<string, { cik: string; title: string }> = {};
  for (const key of Object.keys(data || {})) {
    const row = data[key];
    if (!row?.ticker || !row?.cik_str) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    byTicker[String(row.ticker).toUpperCase()] = { cik, title: row.title || "" };
  }
  tickersCache = { ts: Date.now(), byTicker };
  return byTicker;
}

type Picked = { value?: number; period?: string | null; unit?: string | null } | null;

function pickLatestNumeric(fact: any): Picked {
  if (!fact?.units) return null;
  const unitsKeys = Object.keys(fact.units);
  // Prefer USD/shares if available
  const pref = ["USD", "shares", "pure"].filter((u) => unitsKeys.includes(u));
  const tryUnits = pref.length ? pref : unitsKeys;

  let best: Picked = null;
  for (const u of tryUnits) {
    const arr = fact.units[u];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const val = typeof row?.val === "number" ? row.val : Number(row?.val);
      if (!Number.isFinite(val)) continue;
      const end = row?.end ? String(row.end) : null;
      const cand: Picked = { value: val, period: end, unit: u };
      if (!best) best = cand;
      else if (end && best?.period && end > best.period) best = cand;
    }
  }
  return best;
}

// helper to normalize {value,period,unit} -> {v,asOf,unit}
function norm(x: Picked) {
  return x && typeof x.value === "number"
    ? { v: x.value, asOf: x.period || null, unit: x.unit || null }
    : null;
}

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      res.statusCode = 400;
      return res.end('{"error":"symbol required"}');
    }

    const agent =
      process.env.SEC_USER_AGENT ||
      "undervalued-stocks/1.0 (contact: you@example.com)";
    const map = await getTickerMap(agent);
    const item = map[symbol];
    if (!item?.cik) {
      res.statusCode = 404;
      return res.end(
        JSON.stringify({
          symbol,
          serverTs: Date.now(),
          error: "CIK not found for symbol",
        })
      );
    }

    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${item.cik}.json`;
    const r = await fetch(url, {
      headers: { "user-agent": agent, accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      res.statusCode = r.status;
      return res.end(
        JSON.stringify({
          symbol,
          serverTs: Date.now(),
          cik: item.cik,
          error: `SEC ${r.status}`,
        })
      );
    }
    const json = await r.json();

    // US-GAAP facts
    const gaap = json?.facts?.["us-gaap"] || {};

    // Try common aliases
    const revenue =
      pickLatestNumeric(gaap?.Revenues) ||
      pickLatestNumeric(gaap?.SalesRevenueNet) ||
      pickLatestNumeric(
        gaap?.RevenueFromContractWithCustomerExcludingAssessedTax
      );

    const netIncome = pickLatestNumeric(gaap?.NetIncomeLoss);
    const assets = pickLatestNumeric(gaap?.Assets);
    const liabilities = pickLatestNumeric(gaap?.Liabilities);

    // For shares, prefer outstanding instant; fall back to weighted average basic
    const shares =
      pickLatestNumeric(gaap?.CommonStockSharesOutstanding) ||
      pickLatestNumeric(
        gaap?.WeightedAverageNumberOfSharesOutstandingBasic
      );

    const out = {
      symbol,
      serverTs: Date.now(),
      cik: item.cik,
      entityName: json?.entityName || null,
      sic: json?.sic || null,
      // UI-friendly fields the page already expects:
      revenueUsd: norm(revenue),
      netIncomeUsd: norm(netIncome),
      assetsUsd: norm(assets),
      liabilitiesUsd: norm(liabilities),
      shares: norm(shares), // unit should be "shares"
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=3600");
    return res.end(JSON.stringify(out));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
