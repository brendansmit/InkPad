function readSettingValue(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return typeof row?.value === 'string' ? row.value.trim() : '';
}

function failure(message) {
  return { ok: false, message };
}

function success(message, extra = {}) {
  return { ok: true, message, ...extra };
}

export function resolveOpenRouterModel(models, intent = 'openai gpt mini') {
  const rows = Array.isArray(models) ? models : [];
  if (!rows.length) return null;
  const wanted = intent.trim().toLowerCase();

  // An intent that looks like an exact model id must resolve to exactly that
  // id from the live list, or fail loudly. OpenRouter rejects near-miss ids,
  // so "close enough" is worse than an error here.
  if (wanted.includes('/')) {
    const exact = rows.find((m) => (m.id ?? '').toLowerCase() === wanted)
      ?? rows.find((m) => (m.canonical_slug ?? '').toLowerCase() === wanted);
    if (!exact) return null;
    return { id: exact.id ?? exact.canonical_slug, name: exact.name ?? exact.id };
  }

  const tokens = wanted.split(/\s+/).filter(Boolean);
  let best = null;
  for (const model of rows) {
    const id = String(model.id ?? '');
    const haystack = `${id} ${model.name ?? ''} ${model.canonical_slug ?? ''}`.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) { score += token === 'mini' ? 3 : 2; matched++; }
    }
    if (haystack.includes('free')) score -= 1;
    // Alias/meta ids (e.g. "~anthropic/claude-haiku-latest") are unstable
    // targets; only pick one if no canonical id matches.
    if (id.startsWith('~') || id.startsWith(':')) score -= 4;
    if (!best || score > best.score) best = { model, score, matched };
  }
  // A weak match is worse than no match: require every intent token to have
  // landed somewhere, otherwise surface the failure (never fall back to an
  // arbitrary first row).
  if (!best || best.score <= 0 || best.matched < tokens.length) return null;
  const chosen = best.model;
  return {
    id: chosen.id ?? chosen.canonical_slug ?? chosen.name,
    name: chosen.name ?? chosen.id ?? chosen.canonical_slug,
  };
}

export async function testOpenRouterKey(db, { fetchImpl = fetch } = {}) {
  const key = readSettingValue(db, 'openrouter_api_key');
  if (!key) return failure('OpenRouter key is not set.');

  const headers = { Authorization: `Bearer ${key}` };
  const keyResponse = await fetchImpl('https://openrouter.ai/api/v1/key', { headers });
  if (!keyResponse.ok) return failure('OpenRouter rejected the key.');

  const modelsResponse = await fetchImpl('https://openrouter.ai/api/v1/models', { headers });
  if (!modelsResponse.ok) return failure('OpenRouter models could not be loaded.');

  const modelsPayload = await modelsResponse.json();
  const model = resolveOpenRouterModel(modelsPayload.data);
  if (!model?.id) return failure('No usable OpenRouter model was found.');

  return success('OpenRouter key works.', { model });
}

export async function testServerChanKey(db, { fetchImpl = fetch } = {}) {
  const key = readSettingValue(db, 'serverchan_key');
  if (!key) return failure('ServerChan key is not set.');

  const response = await fetchImpl(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      title: 'InkHeron test',
      desp: 'Your InkHeron ServerChan key works.',
    }).toString(),
  });
  if (!response.ok) return failure('ServerChan rejected the test push.');

  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }
  if (payload.code !== undefined && Number(payload.code) !== 0) {
    return failure(payload.message || 'ServerChan rejected the test push.');
  }

  return success('ServerChan test push sent.');
}
