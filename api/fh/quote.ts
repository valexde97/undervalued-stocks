// api/fh/quote.ts
export default async function handler(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "SPY";

  const token = process.env.FINNHUB_TOKEN || process.env.VITE_FINNHUB_TOKEN; // если пока так заведено
  if (!token) {
    return new Response(JSON.stringify({ error: "FINNHUB_TOKEN is missing" }), { status: 500 });
  }

  const fh = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`);
  const data = await fh.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}
