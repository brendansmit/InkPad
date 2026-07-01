import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

const port = Number(process.env.PORT || 0);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-native-smoke-'));
const databasePath = path.join(dir, 'inkheron.db');
const app = await buildApp({ databasePath, logger: false });

async function injectOk(options, expectedStatus) {
  const response = await app.inject(options);
  if (response.statusCode !== expectedStatus) {
    throw new Error(`${options.method} ${options.url} returned ${response.statusCode}: ${response.body}`);
  }
  return response;
}

const teacherPassword = 'teacherpass123';
const studentPassword = 'correct horse';

await injectOk({
  method: 'POST',
  url: '/api/setup/teacher',
  payload: { username: 'teacher', display_name: 'Teacher', password: teacherPassword },
}, 201);

const teacherLogin = await injectOk({
  method: 'POST',
  url: '/api/teacher/login',
  payload: { username: 'teacher', password: teacherPassword },
}, 200);

const teacherCookies = teacherLogin.headers['set-cookie'];
const teacherCsrf = teacherLogin.json().user.csrf_token;

const classResponse = await injectOk({
  method: 'POST',
  url: '/api/classes',
  payload: { name: 'Smoke Class' },
  headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
}, 201);

const classId = classResponse.json().class.id;

await injectOk({
  method: 'POST',
  url: '/api/students',
  payload: { username: 'alice', display_name: 'Alice Chen', password: studentPassword, class_id: classId },
  headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
}, 201);

const db = new DatabaseSync(databasePath);
const settings = {
  type: 'essay',
  spellcheck: true,
  green_pen: true,
  native_inkpad: true,
  prompt: 'Write one clear paragraph for the native browser smoke test.',
};
const assignment = db.prepare(`
  INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
  VALUES (?, 'Native Smoke Essay', 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
`).run(classId, JSON.stringify(settings));
db.close();

const address = await app.listen({ port, host: '127.0.0.1' });

console.log(JSON.stringify({
  address,
  databasePath,
  assignmentId: assignment.lastInsertRowid,
  teacher: { username: 'teacher', password: teacherPassword },
  student: { username: 'alice', password: studentPassword },
  studentUrl: `${address}/native/write/${assignment.lastInsertRowid}`,
  teacherAssignmentsUrl: `${address}/teacher/assignments?id=${assignment.lastInsertRowid}`,
}, null, 2));

async function shutdown() {
  await app.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
