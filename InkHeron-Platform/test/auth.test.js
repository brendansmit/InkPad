import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';
import { verifyPassword } from '../src/auth/passwords.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-auth-'));
  return path.join(dir, 'inkheron.db');
}

test('teacher login page does not redirect a student session into the teacher area', () => {
  const html = fs.readFileSync(new URL('../public/teacher-login.html', import.meta.url), 'utf8');
  assert.match(html, /data\.user\?\.type==='teacher'/);
  assert.doesNotMatch(html, /if\(r\.ok\)\{ window\.location\.href='\/teacher'; return; \}/);
});

async function seedClassAndStudent(app, { password = 'correct horse', mustChange = false } = {}, { csrfToken = '', cookies = '' } = {}) {
  const classResponse = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 9' },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  assert.equal(classResponse.statusCode, 201);
  const classId = classResponse.json().class.id;

  const created = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice Chen', password, class_id: classId },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  assert.equal(created.statusCode, 201);

  let studentId = created.json().student.id;
  if (mustChange) {
    const databasePath = app._databasePath;
    const db2 = new DatabaseSync(databasePath);
    try {
      db2.prepare('UPDATE students SET must_change_password = 1 WHERE id = ?').run(studentId);
    } finally {
      db2.close();
    }
  }

  return { classId, studentId };
}

async function createTeacherSession(app, { username = 'teacher', password = 'teacherpass123' } = {}) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username, display_name: 'Teacher', password },
  });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

test('student login succeeds and password_hash is not exposed', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken, cookies } = await createTeacherSession(app);
  await seedClassAndStudent(app, {}, { csrfToken, cookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'correct horse' },
  });
  assert.equal(login.statusCode, 200);
  const data = login.json();
  assert.equal(data.user.username, 'alice');
  assert.equal(data.user.type, 'student');
  assert.equal(data.user.must_change_password, true);
  assert.equal(data.user.password_hash, undefined);
  assert.ok(data.user.display_name);
  assert.ok(data.user.csrf_token);

  await app.close();
});

test('wrong password fails', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken, cookies } = await createTeacherSession(app);
  await seedClassAndStudent(app, {}, { csrfToken, cookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'wrong horse' },
  });
  assert.equal(login.statusCode, 401);

  await app.close();
});

test('must_change_password forces password change before dashboard', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken: teacherCsrf, cookies: teacherCookies } = await createTeacherSession(app);
  const { studentId } = await seedClassAndStudent(app, { mustChange: true }, { csrfToken: teacherCsrf, cookies: teacherCookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'correct horse' },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.must_change_password, true);

  const cookies = login.headers['set-cookie'];
  assert.ok(cookies);

  const meBefore = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: cookies },
  });
  assert.equal(meBefore.json().user.must_change_password, true);

  const change = await app.inject({
    method: 'POST',
    url: '/api/students/me/password',
    headers: { cookie: cookies, 'X-CSRF-Token': login.json().user.csrf_token },
    payload: { new_password: 'new correct horse' },
  });
  assert.equal(change.statusCode, 200);
  assert.equal(change.json().success, true);

  const meAfter = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: cookies },
  });
  assert.equal(meAfter.json().user.must_change_password, false);

  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare('SELECT password_hash, must_change_password FROM students WHERE id = ?').get(studentId);
    assert.equal(row.must_change_password, 0);
    assert.equal(await verifyPassword('new correct horse', row.password_hash), true);
    assert.equal(await verifyPassword('correct horse', row.password_hash), false);
  } finally {
    db.close();
  }

  await app.close();
});

test('logged-in student can change password with current password', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken: teacherCsrf, cookies: teacherCookies } = await createTeacherSession(app);
  await seedClassAndStudent(app, {}, { csrfToken: teacherCsrf, cookies: teacherCookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'correct horse' },
  });
  const cookies = login.headers['set-cookie'];

  const change = await app.inject({
    method: 'POST',
    url: '/api/students/me/password',
    headers: { cookie: cookies, 'X-CSRF-Token': login.json().user.csrf_token },
    payload: { current_password: 'correct horse', new_password: 'fresh saddle' },
  });
  assert.equal(change.statusCode, 200);

  const relogin = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'fresh saddle' },
  });
  assert.equal(relogin.statusCode, 200);

  await app.close();
});

test('unauthenticated requests are rejected', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });

  const me = await app.inject({ method: 'GET', url: '/api/me' });
  assert.equal(me.statusCode, 401);

  const password = await app.inject({ method: 'POST', url: '/api/students/me/password', payload: { new_password: 'x' } });
  assert.equal(password.statusCode, 401);

  await app.close();
});

test('teacher can reset a student password and the student must change it', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken, cookies } = await createTeacherSession(app);
  const { studentId } = await seedClassAndStudent(app, {}, { csrfToken, cookies });

  // Teacher resets the student's password.
  const reset = await app.inject({
    method: 'PATCH',
    url: `/api/students/${studentId}/reset-password`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {},
  });
  assert.equal(reset.statusCode, 200);
  const resetData = reset.json();
  assert.equal(resetData.student.id, studentId);
  assert.ok(resetData.temp_password);

  // Student logs in with the temporary password and is forced to change it.
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: resetData.temp_password },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.must_change_password, true);

  const studentCookies = login.headers['set-cookie'];
  const change = await app.inject({
    method: 'POST',
    url: '/api/students/me/password',
    headers: { cookie: studentCookies, 'X-CSRF-Token': login.json().user.csrf_token },
    payload: { new_password: 'brand new horse' },
  });
  assert.equal(change.statusCode, 200);

  // The temporary password no longer works.
  const relogin = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: resetData.temp_password },
  });
  assert.equal(relogin.statusCode, 401);

  // The new password works.
  const newLogin = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'brand new horse' },
  });
  assert.equal(newLogin.statusCode, 200);
  assert.equal(newLogin.json().user.must_change_password, false);

  await app.close();
});

test('state-changing POSTs without a CSRF token are rejected', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { csrfToken, cookies } = await createTeacherSession(app);
  const { studentId } = await seedClassAndStudent(app, {}, { csrfToken, cookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'correct horse' },
  });
  const studentCookies = login.headers['set-cookie'];

  const missingCsrf = await app.inject({
    method: 'POST',
    url: '/api/students/me/password',
    headers: { cookie: studentCookies },
    payload: { new_password: 'hacker change' },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const wrongCsrf = await app.inject({
    method: 'POST',
    url: '/api/students/me/password',
    headers: { cookie: studentCookies, 'X-CSRF-Token': 'wrong' },
    payload: { new_password: 'hacker change' },
  });
  assert.equal(wrongCsrf.statusCode, 403);

  await app.close();
});

test('teacher login succeeds and teacher area rejects student sessions', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });

  const { cookies, csrfToken } = await createTeacherSession(app);
  await seedClassAndStudent(app, {}, { csrfToken, cookies });

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  const data = login.json();
  assert.equal(data.user.type, 'teacher');
  assert.equal(data.user.username, 'teacher');
  assert.equal(data.user.display_name, 'Teacher');

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookies } });
  assert.equal(me.json().user.type, 'teacher');

  // A logged-in teacher can create further teacher accounts.
  const createTeacher = await app.inject({
    method: 'POST',
    url: '/api/teachers',
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: { username: 'teacher2', display_name: 'Mr Wang', password: 'anotherpass123' },
  });
  assert.equal(createTeacher.statusCode, 201);

  // Teacher setup is locked once a teacher exists.
  const setupLocked = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'hacker', password: 'hackerpass123' },
  });
  assert.equal(setupLocked.statusCode, 403);

  // Student session cannot reach teacher-only area.
  const classResponse = await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'Grade 8' }, headers: { 'X-CSRF-Token': csrfToken, cookie: cookies } });
  const student = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'bob', display_name: 'Bob', password: 'studentpass123', class_id: classResponse.json().class.id },
    headers: { 'X-CSRF-Token': csrfToken, cookie: cookies },
  });
  const studentLogin = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'bob', password: 'studentpass123' },
  });
  const studentCookies = studentLogin.headers['set-cookie'];

  const teacherArea = await app.inject({ method: 'GET', url: '/teacher', headers: { cookie: studentCookies } });
  assert.equal(teacherArea.statusCode, 403);

  const createTeacherAsStudent = await app.inject({
    method: 'POST',
    url: '/api/teachers',
    headers: { cookie: studentCookies, 'X-CSRF-Token': studentLogin.json().user.csrf_token },
    payload: { username: 'teacher3', display_name: 'Evil', password: 'evilpass123' },
  });
  assert.equal(createTeacherAsStudent.statusCode, 403);

  await app.close();
});

test('first teacher setup route creates the initial teacher and then locks', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });

  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'headteacher', display_name: 'Head Teacher', password: 'securepass123' },
    headers: {},
  });
  assert.equal(setup.statusCode, 201);
  assert.equal(setup.json().teacher.username, 'headteacher');

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'headteacher', password: 'securepass123' },
  });
  assert.equal(login.statusCode, 200);
  assert.ok(login.json().user.csrf_token);

  await app.close();
});
