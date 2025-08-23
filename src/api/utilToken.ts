function readLocalToken(): string | undefined {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = [
      "VITE_FINNHUB_TOKEN",
      "FINNHUB_TOKEN",
      "finnhub_token",
      "FINHUB_TOKEN",
      "finhub_token",
      "finhub token",
      "finhub token key"
    ];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function getFinnhubToken(): string | undefined {
  // типы берутся из src/env.d.ts
  return import.meta.env.VITE_FINNHUB_TOKEN ?? readLocalToken();
}

function qs(obj: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

/** /fh + token */
export function withTokenBase(
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {}
) {
  const base = "/fh";
  const token = getFinnhubToken();
  const query = { ...params, token };
  const q = qs(query);
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}${q ? `?${q}` : ""}`;
}
