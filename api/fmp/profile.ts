export const runtime = "nodejs";

export default async function handler(_req: any, res: any) {
  res.statusCode = 410; // Gone — явно отключено
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "FMP profile fetch disabled on free plan" }));
}
