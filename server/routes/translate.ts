import { Hono } from 'hono';
import { z } from 'zod';
import { getKV, setKV } from '../shared/kv.js';
import { hashKey } from '../shared/hash.js';
import { translateWithDeepL } from '../providers/deepl.js';
import { translateWithAzure } from '../providers/azure.js';
import { translateWithGCP } from '../providers/gcp.js';

const schema = z.object({
  text: z.union([z.string(), z.array(z.string().min(1))]),
  target: z.string().min(2),
  source: z.string().min(2).optional()
});

export const translateRoute = new Hono();

translateRoute.post('/translate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parse = schema.safeParse(body);
  if (!parse.success) return c.json({ error: parse.error.flatten() }, 400);

  const texts = Array.isArray(parse.data.text) ? parse.data.text : [parse.data.text];
  const target = parse.data.target;
  const source = parse.data.source;

  const key = hashKey({ source, target, texts });
  const cached = await getKV<string[]>(key);
  if (cached) return c.json({ translations: cached, cached: true });

  const provider = (process.env.TRANSLATE_PROVIDER || 'deepl').toLowerCase();
  let out: string[];

  if (provider === 'deepl') {
    out = await translateWithDeepL(texts, target, source);
  } else if (provider === 'azure') {
    out = await translateWithAzure(texts, target, source);
  } else if (provider === 'gcp') {
    out = await translateWithGCP(texts, target, source);
  } else {
    return c.json({ error: `Unknown provider: ${provider}` }, 400);
  }

  await setKV(key, out, 60 * 60 * 24 * 30); // 30 дней
  return c.json({ translations: out, cached: false });
});
