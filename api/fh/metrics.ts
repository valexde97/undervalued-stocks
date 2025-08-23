// api/fh/metrics.ts
// Вытягиваем фундаментальные метрики Finnhub и отдаем компактный JSON.
// Работает на том же домене (Vercel Functions), поэтому без CORS.

export const runtime = "nodejs";

type Json = Record<string, any>;

export default async function handler(req: any, res: any) {
  try {
    const q = new URL(req.url, "http://localhost").searchParams;
    const symbol = (q.get("symbol") || "").trim();

    if (!symbol) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "symbol required" }));
    }

    const token = process.env.VITE_FINNHUB_TOKEN || process.env.FINNHUB_TOKEN;
    if (!token) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "FINNHUB token not set" }));
    }

    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(
      symbol
    )}&metric=all&token=${token}`;

    const r = await fetch(url);
    const data: Json = await r.json();

    // Finnhub кладет метрики внутрь поля `metric`
    const m: Json = data?.metric ?? {};

    // Оставляем только то, что реально пригодится для андервалюации
    const trimmed = {
      marketCap: m.marketCapitalization,       // капа (USD)
      shares: m.sharesBasic,                    // базовые акции
      netIncomeTTM: m.netIncomeTTM,            // чистая прибыль (TTM)
      epsTTM: m.epsBasicTTM ?? m.epsDilutedTTM,
      revenueTTM: m.revenueTTM,
      ebitdaTTM: m.ebitdaTTM,
      operatingCfTTM: m.operatingCashFlowTTM,   // OCF (TTM)
      capexTTM: m.capitalExpenditureTTM,        // CapEx (TTM)
      totalDebt: m.totalDebt,
      cashAndEq: m.totalCash,
      revenueGrowthTTMYoy: m.revenueGrowthTTMYoy, // рост выручки YoY (в долях)
      epsGrowthTTMYoy: m.epsGrowthTTMYoy,
      roeTTM: m.roeTTM,
      roicTTM: m.roicTTM,
    };

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify(trimmed));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
