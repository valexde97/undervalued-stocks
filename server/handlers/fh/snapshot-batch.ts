export const runtime = "nodejs";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const FINNHUB = "https://finnhub.io/api/v1";
const TOKEN =
  process.env.FINNHUB_TOKEN ||
  process.env.FH_TOKEN ||
  process.env.NEXT_PUBLIC_FINNHUB_TOKEN ||
  "";

type SnapshotItem = {
  ticker: string;
  name?: string | null;
  country?: string | null;
  industry?: string | null;
  logo?: string | null;
  marketCapM?: number | null;

  price?: number | null;
  changePct?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
};

async function fh(path: string, params: Record<string, string | number>) {
  const u = new URL(FINNHUB + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (TOKEN) u.searchParams.set("token", TOKEN);

  const r = await fetch(u, { headers: { accept: "application/json" } });
  if (r.status === 429) {
    // rate limit — подскажем фронту, когда попробовать ещё раз
    const resetHdr = r.headers.get("x-ratelimit-reset");
    const resetTs = resetHdr ? Number(resetHdr) * 1000 : Date.now() + 1500;
    const backoffUntil = Number.isFinite(resetTs) ? resetTs : Date.now() + 1500;
    return { __rateLimited: backoffUntil };
  }
  if (!r.ok) {
    // бросать не будем — вернём «пусто», чтобы UI не падал
    return null;
  }
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const raw = String(req.query.symbols || "");
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50);

    if (!symbols.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ items: [] });
    }

    if (!TOKEN) {
      // Без токена не роняем фронт
      res.setHeader("Cache-Control", "no-store");
      return res
        .status(200)
        .json({ items: [], error: "missing_token", backoffUntil: Date.now() + 60_000 });
    }

    let maxBackoff: number | null = null;

    const items: SnapshotItem[] = [];
    for (const sym of symbols) {
      // Параллельно quote + profile
      const [quote, profile] = await Promise.all([
        fh("/quote", { symbol: sym }),
        fh("/stock/profile2", { symbol: sym }),
      ]);

      if (quote?.__rateLimited || profile?.__rateLimited) {
        const b =
          (quote?.__rateLimited as number | undefined) ??
          (profile?.__rateLimited as number | undefined) ??
          null;
        if (b && (!maxBackoff || b > maxBackoff)) maxBackoff = b;
      }

      const out: SnapshotItem = { ticker: sym };

      if (quote && typeof quote.c === "number") {
        out.price = quote.c ?? null;
        out.changePct = typeof quote.dp === "number" ? quote.dp : null;
        out.open = quote.o ?? null;
        out.high = quote.h ?? null;
        out.low = quote.l ?? null;
        out.prevClose = quote.pc ?? null;
      }

      if (profile) {
        out.name = profile.name ?? null;
        out.country = profile.country ?? null;
        out.industry = profile.finnhubIndustry ?? null;
        // Finnhub profile2.marketCapitalization — в млрд USD → переводим в млн
        const capB = Number(profile.marketCapitalization);
        out.marketCapM = Number.isFinite(capB) ? Math.round(capB * 1000) : null;
        out.logo = profile.logo ?? null;
      }

      items.push(out);
    }

    res.setHeader("Cache-Control", "no-store");
    return res
      .status(200)
      .json(maxBackoff ? { items, backoffUntil: maxBackoff } : { items });
  } catch (e: any) {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(200)
      .json({ items: [], error: "server_error", message: e?.message || String(e) });
  }
}
