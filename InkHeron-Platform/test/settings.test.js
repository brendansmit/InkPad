import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { maskSecret } from '../src/services/settingsStore.js';
import { resolveOpenRouterModel } from '../src/services/keyTests.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-settings-'));
  return path.join(dir, 'inkheron.db');
}

async function createTeacherSession(app) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function createStudentSession(app, teacher) {
  const cls = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'G9' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(cls.statusCode, 201);

  const student = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(student.statusCode, 201);

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

test('maskSecret keeps only a small prefix and suffix', () => {
  assert.equal(maskSecret('sk-or-12345678904f2a'), 'sk-or-...4f2a');
  assert.equal(maskSecret('short'), '****');
  assert.equal(maskSecret(''), null);
});

test('resolveOpenRouterModel chooses a matching model', () => {
  const model = resolveOpenRouterModel([
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
    { id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' },
  ]);
  assert.equal(model.id, 'openai/gpt-4.1-mini');
});

test('teacher can store settings and read back only masked values', async () => {
  const databasePath = tmpDb();
  const app = await buildApp({ databasePath, logger: false });
  const teacher = await createTeacherSession(app);

  const saved = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: {
      openrouter_api_key: 'sk-or-12345678904f2a',
      serverchan_key: 'SCT123456789xyz',
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json().settings.openrouter_api_key, {
    is_set: true,
    masked: 'sk-or-...4f2a',
    updated_at: saved.json().settings.openrouter_api_key.updated_at,
  });
  assert.equal(saved.json().settings.serverchan_key.is_set, true);
  assert.equal(JSON.stringify(saved.json()).includes('1234567890'), false);
  assert.equal(JSON.stringify(saved.json()).includes('SCT123456789xyz'), false);

  const read = await app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().settings.openrouter_api_key.masked, 'sk-or-...4f2a');
  assert.equal(JSON.stringify(read.json()).includes('sk-or-12345678904f2a'), false);

  const db = new DatabaseSync(databasePath);
  try {
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all()
      .map(row => ({ key: row.key, value: row.value }));
    assert.deepEqual(rows, [
      { key: 'openrouter_api_key', value: 'sk-or-12345678904f2a' },
      { key: 'serverchan_key', value: 'SCT123456789xyz' },
    ]);
  } finally {
    db.close();
  }

  await app.close();
});

test('current_semester defaults to S1 and can be updated, ignoring invalid values', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);

  const initial = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: teacher.cookies } });
  assert.equal(initial.json().current_semester, 'S1');

  const updated = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { current_semester: 'S2' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().current_semester, 'S2');

  const reread = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: teacher.cookies } });
  assert.equal(reread.json().current_semester, 'S2');

  const invalid = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { current_semester: 'S3' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(invalid.statusCode, 200);
  assert.equal(invalid.json().current_semester, 'S1');

  await app.close();
});

test('settings API rejects students and missing CSRF', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const student = await createStudentSession(app, teacher);

  const studentRead = await app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: { cookie: student.cookies },
  });
  assert.equal(studentRead.statusCode, 403);

  const missingCsrf = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { serverchan_key: 'SCT123' },
    headers: { cookie: teacher.cookies },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const unknownOnly = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { unknown_key: 'secret' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(unknownOnly.statusCode, 400);

  await app.close();
});

test('test-openrouter returns 400 when key not set', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/settings/test-openrouter',
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().ok, false);

  await app.close();
});

test('test-serverchan returns 400 when key not set', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/settings/test-serverchan',
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().ok, false);

  await app.close();
});

test('test endpoints reject students and missing CSRF', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const student = await createStudentSession(app, teacher);

  for (const url of ['/api/settings/test-openrouter', '/api/settings/test-serverchan']) {
    const studentRes = await app.inject({
      method: 'POST',
      url,
      headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies },
    });
    assert.equal(studentRes.statusCode, 403, `student access to ${url}`);

    const noCsrf = await app.inject({
      method: 'POST',
      url,
      headers: { cookie: teacher.cookies },
    });
    assert.equal(noCsrf.statusCode, 403, `missing CSRF for ${url}`);
  }

  await app.close();
});

test('teacher settings screen is teacher-only and linked from dashboard', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const student = await createStudentSession(app, teacher);

  const unauth = await app.inject({ method: 'GET', url: '/teacher/settings' });
  assert.equal(unauth.statusCode, 401);

  const studentPage = await app.inject({
    method: 'GET',
    url: '/teacher/settings',
    headers: { cookie: student.cookies },
  });
  assert.equal(studentPage.statusCode, 403);

  const page = await app.inject({
    method: 'GET',
    url: '/teacher/settings',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /id="settingsForm"/);
  assert.match(page.body, /OpenRouter API key/);
  assert.match(page.body, /ServerChan key/);
  assert.doesNotMatch(page.body, /sk-or-12345678904f2a/);

  const dashboard = await app.inject({
    method: 'GET',
    url: '/teacher',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /href="\/teacher\/settings"/);

  await app.close();
});

test('teacher can test stored OpenRouter and ServerChan keys', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: {
      openrouter_api_key: 'sk-or-test-key',
      serverchan_key: 'SCT-test-key',
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers ?? {}, body: String(options.body ?? '') });
    if (String(url).endsWith('/api/v1/key')) {
      assert.equal(options.headers.Authorization, 'Bearer sk-or-test-key');
      return new Response(JSON.stringify({ data: { label: 'InkHeron' } }), { status: 200 });
    }
    if (String(url).endsWith('/api/v1/models')) {
      return new Response(JSON.stringify({
        data: [
          { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
          { id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' },
        ],
      }), { status: 200 });
    }
    if (String(url).includes('sctapi.ftqq.com')) {
      return new Response(JSON.stringify({ code: 0, message: 'success' }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const openrouter = await app.inject({
      method: 'POST',
      url: '/api/settings/test/openrouter',
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    });
    assert.equal(openrouter.statusCode, 200);
    assert.equal(openrouter.json().ok, true);
    assert.equal(openrouter.json().model.id, 'openai/gpt-4.1-mini');
    assert.equal(JSON.stringify(openrouter.json()).includes('sk-or-test-key'), false);

    const serverchan = await app.inject({
      method: 'POST',
      url: '/api/settings/test/serverchan',
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    });
    assert.equal(serverchan.statusCode, 200);
    assert.equal(serverchan.json().ok, true);
    assert.equal(JSON.stringify(serverchan.json()).includes('SCT-test-key'), false);
    assert.ok(calls.some(call => call.url.includes('/SCT-test-key.send')));
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('key test endpoints report missing keys without network calls', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network should not be called');
  };

  try {
    const openrouter = await app.inject({
      method: 'POST',
      url: '/api/settings/test/openrouter',
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    });
    assert.equal(openrouter.statusCode, 200);
    assert.equal(openrouter.json().ok, false);

    const serverchan = await app.inject({
      method: 'POST',
      url: '/api/settings/test/serverchan',
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    });
    assert.equal(serverchan.statusCode, 200);
    assert.equal(serverchan.json().ok, false);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('ai_doer_intent setting defaults to deepseek and steers every doer call', async () => {
  const { buildApp } = await import('../src/app.js');
  const { readDoerIntent, writeDoerIntent } = await import('../src/services/settingsStore.js');
  const { runLiteracyAnalysis } = await import('../src/services/literacyCoder.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { openDatabase } = await import('../src/db/database.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-doer-'));
  const db = openDatabase(path.join(dir, 'inkheron.db'));
  const app = await buildApp({ db, logger: false });

  assert.match(readDoerIntent(db), /deepseek/);
  writeDoerIntent(db, 'moonshot kimi k2');
  assert.equal(readDoerIntent(db), 'moonshot kimi k2');

  db.prepare("INSERT INTO classes (name) VALUES ('X')").run();
  db.prepare("INSERT INTO students (username, display_name, password_hash, class_id) VALUES ('s','S','h',1)").run();
  db.prepare("INSERT INTO assignments (class_id, title, type, settings_json) VALUES (1,'E','essay','{}')").run();
  db.prepare("INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count) VALUES (1,1,'submitted','{}','They is playing.',3)").run();

  let seen = '';
  await runLiteracyAnalysis(db, { padId: 1 }, { chat: (d, { intent }) => { if (!seen) seen = intent; return Promise.resolve({ model: 'f', choices: [{ message: { content: '[]' } }] }); } });
  assert.equal(seen, 'moonshot kimi k2');

  await app.close();
});
