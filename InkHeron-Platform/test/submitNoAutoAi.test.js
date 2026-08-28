/**
 * Submitting must not trigger any AI (teacher decision, 2026-08-29).
 *
 * Marking a class one trickle-fed essay at a time meant every prompt or model
 * change forced a manual re-run of everything already through, and there was
 * never a moment where the whole class had been marked by the same version.
 * The AI chain now runs only from Run check, which does the whole assignment
 * as one batch.
 *
 * Style metrics are the exception: deterministic, free, and a fingerprint of
 * the writing as submitted, so they belong to the submit event.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-noautoai-'));
  return path.join(dir, 'inkheron.db');
}

const TEXT = 'She felt empathy of the problem and the speech was memorable. The author use many device to show his point.';

test('submitting records style metrics and starts no AI work', async () => {
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });

  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const headers = { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };

  const classId = (await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers })).json().class.id;
  await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'cathy', display_name: 'Cathy', password: 'pass12345', class_id: classId }, headers });
  const assignmentId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: true } }, headers })).json().assignment.id;

  // An OpenRouter key is set, so nothing is skipped merely for want of one:
  // if submit still called the AI, it would try.
  await app.inject({ method: 'POST', url: '/api/settings/openrouter-key',
    payload: { api_key: 'sk-or-test-key-not-used' }, headers }).catch(() => {});

  const studentLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'cathy', password: 'pass12345' } });
  const studentHeaders = {
    cookie: studentLogin.headers['set-cookie'],
    'X-CSRF-Token': studentLogin.json().user.csrf_token,
  };
  const padId = (await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: studentHeaders })).json().pad.id;

  db.prepare('UPDATE native_pads SET plain_text = ?, word_count = ? WHERE id = ?')
    .run(TEXT, TEXT.split(/\s+/).length, padId);
  const submitted = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/submit`,
    headers: studentHeaders });
  assert.equal(submitted.statusCode, 201);

  // Background work is fire and forget, so give it a moment to have happened.
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM style_metrics WHERE native_pad_id = ?').get(padId).n,
    1,
    'the stylometric fingerprint is still recorded on submit'
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM ai_literacy_suggestions WHERE native_pad_id = ?').get(padId).n,
    0,
    'no literacy coder run'
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').get(padId).n,
    0,
    'no strength and target suggestions'
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM ai_grade_estimates WHERE native_pad_id = ?').get(padId).n,
    0,
    'no grade estimate'
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'").get(padId).n,
    0,
    'and so no marks were auto-applied'
  );

  await app.close();
});
