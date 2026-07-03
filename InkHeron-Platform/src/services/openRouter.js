import { readRawSetting } from './settingsStore.js';
import { resolveOpenRouterModel } from './keyTests.js';

const modelCache = new Map();

async function fetchModels(key, fetchImpl) {
  const res = await fetchImpl('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data ?? [];
}

function apiHeaders(key) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://inkpad.inkheron.app',
    'X-Title': 'InkHeron',
  };
}

export async function resolveModel(db, intent, { fetchImpl = fetch } = {}) {
  if (modelCache.has(intent)) return modelCache.get(intent);
  const key = readRawSetting(db, 'openrouter_api_key');
  if (!key) throw new Error('openrouter_api_key not set');
  const models = await fetchModels(key, fetchImpl);
  const resolved = resolveOpenRouterModel(models, intent);
  if (!resolved?.id) throw new Error(`No usable model found for intent: ${intent}`);
  modelCache.set(intent, resolved);
  console.log(`[openRouter] resolved "${intent}" -> ${resolved.id}`);
  return resolved;
}

export function clearModelCache(intent) {
  if (intent !== undefined) modelCache.delete(intent);
  else modelCache.clear();
}

// When a model family is region-blocked (403 "not available in your region",
// seen for Anthropic/Google/OpenAI from mainland China), retry once with a
// family that is reachable there. DeepSeek and Qwen are different families,
// so a Doer falling back to DeepSeek and a Checker falling back to Qwen
// still satisfies the different-family rule (CLAUDE.md §8).
export function regionFallbackIntent(intent = '') {
  const lower = intent.toLowerCase();
  if (/anthropic|claude|openai|gpt/.test(lower)) return 'deepseek chat';
  if (/google|gemini/.test(lower)) return 'qwen qwen3 32b instruct';
  return null;
}

export async function callChat(db, {
  intent = 'openai gpt mini',
  messages,
  maxTokens = 1024,
  temperature = 0.2,
} = {}, { fetchImpl = fetch } = {}) {
  const key = readRawSetting(db, 'openrouter_api_key');
  if (!key) throw new Error('openrouter_api_key not set');

  let model = await resolveModel(db, intent, { fetchImpl });

  const makeBody = (modelId) => JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, temperature });
  const attempt = (modelId) => fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: apiHeaders(key),
    body: makeBody(modelId),
  });

  let res = await attempt(model.id);

  if ((res.status === 404 || res.status === 400) && !res.bodyUsed) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData?.error?.message ?? '';
    if (res.status === 404 || errMsg.toLowerCase().includes('model')) {
      clearModelCache(intent);
      model = await resolveModel(db, intent, { fetchImpl });
      console.log(`[openRouter] re-resolved "${intent}" -> ${model.id}`);
      res = await attempt(model.id);
    }
  }

  if (res.status === 403 && !res.bodyUsed) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = String(errData?.error?.message ?? '');
    const fallback = errMsg.toLowerCase().includes('region') ? regionFallbackIntent(intent) : null;
    if (fallback && fallback !== intent) {
      model = await resolveModel(db, fallback, { fetchImpl });
      console.warn(`[openRouter] "${intent}" region-blocked; falling back to "${fallback}" -> ${model.id}`);
      res = await attempt(model.id);
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter call failed (${res.status}): ${errData?.error?.message ?? 'unknown error'}`);
  }

  console.log(`[openRouter] call completed via ${model.id}`);
  return res.json();
}
