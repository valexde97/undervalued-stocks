import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const TARGET_LANGS = (process.env.I18N_TARGETS || 'de,es').split(',').map(s => s.trim()).filter(Boolean);
const PROVIDER = (process.env.TRANSLATE_PROVIDER || 'deepl').toLowerCase();

async function translateMany(texts: string[], target: string): Promise<string[]> {
  // используем наш локальный сервер: он сам выберет провайдера и кеширует
  const res = await fetch('http://127.0.0.1:8787/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target, source: 'en' })
  });
  if (!res.ok) throw new Error(`translate failed: ${res.status}`);
  const json = await res.json() as { translations: string[] };
  return json.translations;
}

async function run() {
  const srcPath = join('src', 'locales', 'en', 'translation.json');
  const enRaw = await readFile(srcPath, 'utf8');
  const en = JSON.parse(enRaw) as Record<string, unknown>;

  async function flatten(obj: any, prefix = ''): Promise<Record<string,string>> {
    const out: Record<string,string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') out[key] = v;
      else if (v && typeof v === 'object') Object.assign(out, await flatten(v, key));
    }
    return out;
  }

  function unflatten(map: Record<string,string>): any {
    const out: any = {};
    for (const [k, v] of Object.entries(map)) {
      const parts = k.split('.');
      let cur = out;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) cur[p] = v;
        else cur = (cur[p] ||= {});
      }
    }
    return out;
  }

  const flat = await flatten(en);

  for (const lng of TARGET_LANGS) {
    const keys = Object.keys(flat);
    const vals = Object.values(flat);
    const translated = await translateMany(vals, lng);
    const map: Record<string,string> = {};
    keys.forEach((k, i) => (map[k] = translated[i] || vals[i]));
    const obj = unflatten(map);
    const outPath = join('public', 'locales', lng, 'translation.json');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`[i18n] ${lng} written to ${outPath} via ${PROVIDER}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
