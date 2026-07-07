import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { readCheckerIntent } from '../src/services/settingsStore.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-settings-models-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  assert.equal(setup.statusCode, 201);
  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

test('settings persist checker intent and reject same-family checker', async () => {
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  const teacher = await setupTeacher(app);

  assert.equal(readCheckerIntent(db), 'google gemini flash');

  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
    payload: { ai_checker_intent: 'moonshot kimi' },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().ai_checker_intent, 'moonshot kimi');
  assert.equal(readCheckerIntent(db), 'moonshot kimi');

  const get = await app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(get.statusCode, 200);
  assert.equal(get.json().ai_checker_intent, 'moonshot kimi');

  const rejected = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
    payload: { ai_doer_intent: 'qwen 2.5 72b instruct', ai_checker_intent: 'qwen 2.5 72b instruct' },
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.json().error, 'checker_must_be_different_family');

  await app.close();
});
