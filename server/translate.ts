// псевдокод: Hono/Express — не важно, суть одна
app.post('/translate', async (req, res) => {
  const { text, target, source } = req.body; // text: string | string[]
  const payload = Array.isArray(text) ? text : [text];

  const cached = await kv.get(hash(source, target, payload));
  if (cached) return res.json(cached);

  let out;
  if (process.env.TRANSLATE_PROVIDER === 'deepl') {
    out = await deeplTranslate(payload, target, source); // /v2/translate
  } else if (process.env.TRANSLATE_PROVIDER === 'gcp') {
    out = await gcpTranslateV3(payload, target, source);
  } else {
    out = await azureTranslate(payload, target, source);
  }

  await kv.set(hash(source, target, payload), out, { ttl: 60 * 60 * 24 * 30 });
  res.json(out);
});
