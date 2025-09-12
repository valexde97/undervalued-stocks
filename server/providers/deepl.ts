const BASE = process.env.DEEPL_API_BASE || 'https://api.deepl.com';

export async function translateWithDeepL(texts: string[], target: string, source?: string): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('DEEPL_API_KEY not set');

  const params = new URLSearchParams();
  for (const q of texts) params.append('text', q);
  params.set('target_lang', target.toUpperCase());
  if (source) params.set('source_lang', source.toUpperCase());

  const res = await fetch(`${BASE}/v2/translate`, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) throw new Error(`DeepL failed: ${res.status}`);
  const json = await res.json() as { translations: { text: string }[] };
  return json.translations.map(t => t.text);
}
