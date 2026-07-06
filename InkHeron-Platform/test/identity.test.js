import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { verifyPassword } from '../src/auth/passwords.js';
import { buildApp } from '../src/app.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-identity-'));
  return path.join(dir, 'inkheron.db');
}

async function createTeacherSession(app, { username = 'teacher', password = 'teacherpass123' } = {}) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username, display_name: 'Teacher', password },
  });
  if (setup.statusCode !== 201 && setup.statusCode !== 403) {
    throw new Error(`Unexpected setup status: ${setup.statusCode}`);
  }

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username, password },
  });
  if (login.statusCode !== 200) {
    throw new Error(`Teacher login failed: ${login.statusCode}`);
  }
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

test('classes and students can be created, listed, updated and deleted', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath });
  const { cookies, csrfToken } = await createTeacherSession(app);

  const createdClass = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 9' },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  assert.equal(createdClass.statusCode, 201);
  const classId = createdClass.json().class.id;

  const updatedClass = await app.inject({
    method: 'PATCH',
    url: `/api/classes/${classId}`,
    payload: { name: 'Grade 9 Writing' },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  assert.equal(updatedClass.statusCode, 200);
  assert.equal(updatedClass.json().class.name, 'Grade 9 Writing');

  const createdStudent = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
    payload: {
      username: 'alice',
      display_name: 'Alice Chen',
      password: 'correct horse',
      class_id: classId,
    },
  });
  assert.equal(createdStudent.statusCode, 201);
  const student = createdStudent.json().student;
  assert.equal(student.username, 'alice');
  assert.equal(student.must_change_password, true);
  assert.equal(student.password_hash, undefined);

  const listedStudents = await app.inject({ method: 'GET', url: '/api/students', headers: { cookie: cookies } });
  assert.equal(listedStudents.statusCode, 200);
  assert.equal(listedStudents.json().students.length, 1);
  assert.equal(listedStudents.json().students[0].password_hash, undefined);

  const updatedStudent = await app.inject({
    method: 'PATCH',
    url: `/api/students/${student.id}`,
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
    payload: { display_name: 'Alice Zhang', password: 'new correct horse' },
  });
  assert.equal(updatedStudent.statusCode, 200);
  assert.equal(updatedStudent.json().student.display_name, 'Alice Zhang');
  assert.equal(updatedStudent.json().student.password_hash, undefined);

  const db = new DatabaseSync(databasePath);
  try {
    const stored = db.prepare('SELECT password_hash, must_change_password FROM students WHERE username = ?').get('alice');
    assert.notEqual(stored.password_hash, 'correct horse');
    assert.notEqual(stored.password_hash, 'new correct horse');
    assert.match(stored.password_hash, /^\$2[aby]\$/);
    assert.equal(stored.must_change_password, 1);
    assert.equal(await verifyPassword('new correct horse', stored.password_hash), true);
  } finally {
    db.close();
  }

  const deletedStudent = await app.inject({ method: 'DELETE', url: `/api/students/${student.id}`, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  assert.equal(deletedStudent.statusCode, 204);

  const deletedClass = await app.inject({ method: 'DELETE', url: `/api/classes/${classId}`, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  assert.equal(deletedClass.statusCode, 204);

  await app.close();
});

test('student plaintext password is never returned and duplicates fail', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath() });
  const { csrfToken, cookies } = await createTeacherSession(app);
  const classResponse = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 10' },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  const classId = classResponse.json().class.id;

  const payload = {
    username: 'duplicate',
    display_name: 'Duplicate Student',
    password: 'long enough',
    class_id: classId,
  };

  const first = await app.inject({ method: 'POST', url: '/api/students', payload, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  const second = await app.inject({ method: 'POST', url: '/api/students', payload, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 409);
  assert.doesNotMatch(JSON.stringify(first.json()), /long enough/);

  await app.close();
});

test('roster page is teacher-only', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath() });
  const { csrfToken, cookies } = await createTeacherSession(app);

  const classRes = await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G9' }, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  const classId = classRes.json().class.id;
  await app.inject({ method: 'POST', url: '/api/students', payload: { username: 'eve', display_name: 'Eve', password: 'password99', class_id: classId }, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  const sLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'eve', password: 'password99' } });
  const student = { cookies: sLogin.headers['set-cookie'], csrf: sLogin.json().user.csrf_token };

  const unauth = await app.inject({ method: 'GET', url: '/teacher/students' });
  assert.equal(unauth.statusCode, 401);

  const studentPage = await app.inject({ method: 'GET', url: '/teacher/students', headers: { cookie: student.cookies } });
  assert.equal(studentPage.statusCode, 403);

  const page = await app.inject({ method: 'GET', url: '/teacher/students', headers: { cookie: cookies } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Classes|Roster/);

  await app.close();
});
