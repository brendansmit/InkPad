import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { resolveModel, callChat, clearModelCache } from '../src/services/openRouter.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-or-'));
  return path.join(dir, 'inkheron.db');
}

const FAKE_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
];

async function seedDb(databasePath) {
  const app = await buildApp({ databasePath, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher', payload: { username: 't', display_name: 'T', password: 'teacherpass99' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login', payload: { username: 't', password: 'teacherpass99' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  await app.inject({
    method: 'PATCH', url: '/api/settings',
    payload: { openrouter_api_key: 'sk-or-testkey123456' },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies },
  });
  await app.close();
}

function openDb(databasePath) {
  return new DatabaseSync(databasePath);
}

function fakeModels() {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: FAKE_MODELS }) });
}

function fakeChat(status = 200, body = {}) {
  return Promise.resolve({ ok: status < 400, status, bodyUsed: false, json: () => Promise.resolve(body) });
}

test('resolveModel resolves and caches the model', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  await seedDb(dbPath);
  const db = openDb(dbPath);
  let modelFetchCount = 0;
  const fetchImpl = (url) => { if (url.includes('/models')) { modelFetchCount++; return fakeModels(); } return fakeChat(); };

  const first = await resolveModel(db, 'openai gpt mini', { fetchImpl });
  const second = await resolveModel(db, 'openai gpt mini', { fetchImpl });

  assert.equal(first.id, 'openai/gpt-4o-mini');
  assert.equal(second.id, first.id);
  assert.equal(modelFetchCount, 1, 'models fetched once — second call uses cache');
  clearModelCache('openai gpt mini');
  db.close();
});

test('resolveModel throws when key is not set', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  await app.close();
  const db = openDb(dbPath);
  await assert.rejects(
    () => resolveModel(db, 'openai gpt mini', { fetchImpl: fakeModels }),
    /openrouter_api_key not set/
  );
  db.close();
});

test('callChat returns parsed response on success', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  await seedDb(dbPath);
  const db = openDb(dbPath);
  const chatReply = { choices: [{ message: { role: 'assistant', content: 'Hello.' } }] };
  const fetchImpl = (url) => url.includes('/models') ? fakeModels() : fakeChat(200, chatReply);

  const result = await callChat(db, { intent: 'openai gpt mini', messages: [{ role: 'user', content: 'Hi' }] }, { fetchImpl });
  assert.equal(result.choices[0].message.content, 'Hello.');
  clearModelCache('openai gpt mini');
  db.close();
});

test('callChat re-resolves and retries on 404 model-not-found', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  await seedDb(dbPath);
  const db = openDb(dbPath);
  const chatReply = { choices: [{ message: { role: 'assistant', content: 'Retry worked.' } }] };
  let chatAttempts = 0;
  const fetchImpl = (url) => {
    if (url.includes('/models')) return fakeModels();
    chatAttempts++;
    if (chatAttempts === 1) return fakeChat(404, { error: { message: 'model not found' } });
    return fakeChat(200, chatReply);
  };

  const result = await callChat(db, { intent: 'openai gpt mini', messages: [{ role: 'user', content: 'Hi' }] }, { fetchImpl });
  assert.equal(result.choices[0].message.content, 'Retry worked.');
  assert.equal(chatAttempts, 2, 'retried once after 404');
  clearModelCache('openai gpt mini');
  db.close();
});

test('callChat throws when key is not set', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  await app.close();
  const db = openDb(dbPath);
  await assert.rejects(
    () => callChat(db, { messages: [] }, { fetchImpl: fakeModels }),
    /openrouter_api_key not set/
  );
  db.close();
});

test('resolver refuses weak matches, alias ids and near-miss exact ids', async () => {
  const { resolveOpenRouterModel } = await import('../src/services/keyTests.js');
  const models = [
    { id: '~anthropic/claude-haiku-latest', name: 'Claude Haiku (latest alias)' },
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat' },
  ];
  assert.equal(resolveOpenRouterModel(models, 'anthropic claude haiku').id, 'anthropic/claude-haiku-4.5',
    'canonical id beats the tilde alias');
  assert.equal(resolveOpenRouterModel(models, 'mistral large'), null, 'no arbitrary first-row fallback');
  assert.equal(resolveOpenRouterModel(models, 'anthropic/claude-haiku-4.5').id, 'anthropic/claude-haiku-4.5');
  assert.equal(resolveOpenRouterModel(models, 'anthropic/claude-haiku-9.9'), null, 'near-miss exact id fails loudly');
});

test('callChat falls back to a region-safe family on a 403 region error', async () => {
  clearModelCache();
  const dbPath = tmpDb();
  await seedDb(dbPath);
  const db = openDb(dbPath);
  const models = [
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1' },
  ];
  const calls = [];
  const fetchImpl = (url, opts) => {
    if (url.includes('/models')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: models }) });
    const body = JSON.parse(opts.body);
    calls.push(body.model);
    if (body.model.startsWith('anthropic/')) {
      return Promise.resolve({ ok: false, status: 403, bodyUsed: false,
        json: () => Promise.resolve({ error: { message: 'This model is not available in your region.' } }) });
    }
    return Promise.resolve({ ok: true, status: 200, bodyUsed: false,
      json: () => Promise.resolve({ model: body.model, choices: [{ message: { content: 'OK' } }] }) });
  };
  const result = await callChat(db, { intent: 'anthropic claude haiku', messages: [{ role: 'user', content: 'x' }] }, { fetchImpl });
  assert.deepEqual(calls, ['anthropic/claude-haiku-4.5', 'deepseek/deepseek-chat-v3.1']);
  assert.equal(result.model, 'deepseek/deepseek-chat-v3.1');
  clearModelCache();
});
