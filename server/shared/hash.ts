import { createHash } from 'crypto';

export function hashKey(obj: unknown): string {
  const json = JSON.stringify(obj);
  return createHash('sha256').update(json).digest('hex');
}
