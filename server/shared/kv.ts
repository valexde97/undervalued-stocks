type Entry = { v: unknown; exp: number };
const mem = new Map<string, Entry>();

export async function getKV<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const e = mem.get(key);
  if (e && e.exp > now) return e.v as T;
  if (e) mem.delete(key);
  return null;
}

export async function setKV(key: string, value: unknown, ttlSec: number): Promise<void> {
  const exp = Date.now() + ttlSec * 1000;
  mem.set(key, { v: value, exp });
}
