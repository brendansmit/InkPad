import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-padrel-'));
  return path.join(dir, 'inkheron.db');
}

test('per-student release opens feedback for one student while the class stays held', async () => {
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const h = { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };
  const cls = await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G9' }, headers: h });
  for (const name of ['alice', 'bob']) {
    await app.inject({ method: 'POST', url: '/api/students',
      payload: { username: name, display_name: name, password: 'pass12345', class_id: cls.json().class.id }, headers: h });
  }
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: { feedback_release: 'batch' } }, headers: h });
  const assignmentId = created.json().assignment.id;

  const pads = {};
  for (const name of ['alice', 'bob']) {
    const sLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: name, password: 'pass12345' } });
    const pad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
      headers: { cookie: sLogin.headers['set-cookie'] } });
    pads[name] = { id: pad.json().pad.id, cookie: sLogin.headers['set-cookie'] };
    db.prepare("UPDATE native_pads SET state = 'marked', plain_text = 'Some text here.' WHERE id = ?").run(pads[name].id);
  }

  // Both held before any release.
  for (const name of ['alice', 'bob']) {
    const fb = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/feedback`, headers: { cookie: pads[name].cookie } });
    assert.equal(fb.json().feedback_released, false, name + ' held');
  }

  // Release only alice.
  const rel = await app.inject({ method: 'POST', url: `/api/native/pads/${pads.alice.id}/release-feedback`, headers: h });
  assert.equal(rel.statusCode, 200);
  assert.equal(rel.json().released, true);

  const aliceFb = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/feedback`, headers: { cookie: pads.alice.cookie } });
  assert.notEqual(aliceFb.json().feedback_released, false, 'alice now sees feedback');
  // The wall: TOEFL estimates are teacher only and must never reach a
  // student-facing payload, even after feedback is released.
  assert.ok(!JSON.stringify(aliceFb.json()).toLowerCase().includes('toefl'), 'student feedback payload leaks no toefl data');
  const bobFb = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/feedback`, headers: { cookie: pads.bob.cookie } });
  assert.equal(bobFb.json().feedback_released, false, 'bob still held');

  // Unmarked pad refuses release.
  db.prepare("UPDATE native_pads SET state = 'writing' WHERE id = ?").run(pads.bob.id);
  const bad = await app.inject({ method: 'POST', url: `/api/native/pads/${pads.bob.id}/release-feedback`, headers: h });
  assert.equal(bad.statusCode, 409);

  await app.close();
});
