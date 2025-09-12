export async function translateWithAzure(texts: string[], target: string, source?: string): Promise<string[]> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key || !region) throw new Error('AZURE_TRANSLATOR_KEY/REGION not set');

  const params = new URLSearchParams({ 'api-version': '3.0' });
  params.append('to', target);
  const url = `https://api.cognitive.microsofttranslator.com/translate?${params.toString()}`;

  const body = texts.map((t) => ({ Text: t }));
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Azure Translator failed: ${res.status}`);
  const data = await res.json() as Array<{ translations: Array<{ text: string }> }>;
  return data.map(row => row.translations[0]?.text ?? '');
}
