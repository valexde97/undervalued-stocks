export const runtime = "nodejs";
export default async function handler(_req: any, res: any) {
  res.statusCode = 410; // Gone — явно отключено
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "FMP disabled on free plan" }));
}
