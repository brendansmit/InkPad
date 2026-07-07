import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-filter-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
  await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function post(app, teacher, url, payload) {
  const res = await app.inject({
    method: 'POST',
    url,
    payload,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.ok(res.statusCode === 201 || res.statusCode === 200, res.body);
  return res.json();
}

test('question bank filters by topic and by quiz membership', async () => {
  const app = await buildApp({ databasePath: tmpDb() });
  const teacher = await setupTeacher(app);
  const cls = await post(app, teacher, '/api/classes', { name: 'Grade 9' });
  const q1 = (await post(app, teacher, '/api/tests/questions', {
    kind: 'mcq',
    prompt_text: 'Which image is central?',
    options: ['River', 'Clock'],
    answer_index: 0,
    points: 1,
    topic: 'Imagery',
    tags: ['poetry'],
  })).question;
  const q2 = (await post(app, teacher, '/api/tests/questions', {
    kind: 'mcq',
    prompt_text: 'Which claim is best?',
    options: ['A', 'B'],
    answer_index: 1,
    points: 1,
    topic: 'Argument',
    tags: ['rhetoric'],
  })).question;
  const assignment = (await post(app, teacher, '/api/tests/assignments', {
    class_id: cls.class.id,
    title: 'Quiz',
    sections: [{ kind: 'mcq', title: 'MCQ', question_ids: [q2.id] }],
  })).assignment;

  const byTopic = await app.inject({
    method: 'GET',
    url: '/api/tests/questions?topic=imagery',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(byTopic.statusCode, 200);
  assert.deepEqual(byTopic.json().questions.map((q) => q.id), [q1.id]);

  const byQuiz = await app.inject({
    method: 'GET',
    url: `/api/tests/questions?in_assignment=${assignment.id}`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(byQuiz.statusCode, 200);
  assert.deepEqual(byQuiz.json().questions.map((q) => q.id), [q2.id]);
  await app.close();
});
