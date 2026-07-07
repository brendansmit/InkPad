import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
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

test('question bank cleanup tools merge topics, rename tags and archive duplicates', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath });
  const teacher = await setupTeacher(app);
  const q1 = (await post(app, teacher, '/api/tests/questions', {
    kind: 'mcq',
    prompt_text: 'First cleanup question?',
    options: ['A', 'B'],
    answer_index: 0,
    topic: 'Old Topic',
    tags: ['oldtag', 'keep'],
  })).question;
  const q2 = (await post(app, teacher, '/api/tests/questions', {
    kind: 'mcq',
    prompt_text: 'Second cleanup question?',
    options: ['A', 'B'],
    answer_index: 1,
    topic: 'Old Topic',
    tags: ['oldtag'],
  })).question;

  const merged = await post(app, teacher, '/api/tests/questions/topics/merge', { from: 'old topic', to: 'New Topic' });
  assert.equal(merged.updated, 2);
  const renamed = await post(app, teacher, '/api/tests/questions/tags/rename', { from: 'oldtag', to: 'newtag' });
  assert.equal(renamed.updated, 2);

  const db = new DatabaseSync(dbPath);
  db.prepare('UPDATE test_questions SET duplicate_of_question_id = ? WHERE id = ?').run(q1.id, q2.id);
  db.close();

  const archived = await post(app, teacher, '/api/tests/questions/archive-duplicates', { question_ids: [q2.id] });
  assert.equal(archived.archived, 1);

  const list = await app.inject({
    method: 'GET',
    url: '/api/tests/questions?topic=New Topic&archived=1',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().questions[0].id, q2.id);
  assert.deepEqual(list.json().questions[0].tags, ['newtag']);

  const active = await app.inject({
    method: 'GET',
    url: '/api/tests/questions?topic=New Topic',
    headers: { cookie: teacher.cookies },
  });
  assert.deepEqual(active.json().questions.map((q) => q.id), [q1.id]);
  assert.deepEqual(active.json().questions[0].tags, ['newtag', 'keep']);
  await app.close();
});
