export async function translateWithGCP(texts: string[], target: string, source?: string): Promise<string[]> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error('GOOGLE_TRANSLATE_API_KEY not set');

  const params = new URLSearchParams({ key, target });
  if (source) params.set('source', source);

  // q можно передавать несколько раз
  for (const q of texts) params.append('q', q);

  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?${params.toString()}`, {
    method: 'POST'
  });

  if (!res.ok) throw new Error(`Google Translate v2 failed: ${res.status}`);
  const data = await res.json() as { data: { translations: Array<{ translatedText: string }> } };
  return data.data.translations.map(t => t.translatedText || '');
}
