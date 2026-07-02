import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { computeStyleMetrics, recordStyleMetrics, aggregateStyleProfile, splitSentences } from '../src/services/styleMetrics.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-style-'));
  return path.join(dir, 'inkheron.db');
}

// Excerpt from a real student sample (L2 learner, statistics essay).
const SAMPLE = `If I had to describe myself in one word, I'll choose a collector. My bedroom is usually messy and my things are scattered everywhere. That my normal life. The only spot that is well-organized in my room is the collect cabinet.

First of all, i'm sensitive about numbers. Since I was in the elementary school, math has always been my best subject. I can always get a good grade. However, I never think about choosing it as my major because I don't know how pure mathmatics student can do on the society, maybe just mathmatician or teacher.

All in all, statistics is the ideal major for me. It integrates my mathmatical strengths hobby of collecting and intended career path into one field.`;

test('computeStyleMetrics produces the full fingerprint with sane values', () => {
  const m = computeStyleMetrics(SAMPLE);
  assert.ok(m.word_count > 100);
  assert.equal(m.paragraph_count, 3);
  assert.ok(m.sentence_count >= 9 && m.sentence_count <= 13);
  assert.ok(m.mean_sentence_length > 5 && m.mean_sentence_length < 30);
  assert.ok(m.mattr_50 > 0.5 && m.mattr_50 <= 1);
  assert.ok(m.first_person_per_100_words > 5, 'personal essay is I-heavy');
  assert.ok(m.hedges_per_100_words > 0, '"maybe", "can" register as hedging');
  assert.ok(m.transitions_per_100_words > 0, '"However", "First of all" era transitions counted via however/firstly');
  assert.ok(m.lexical_density > 0.3 && m.lexical_density < 0.8);
  const rep = computeStyleMetrics('I like cats. I like dogs. I like birds. We ran.');
  assert.equal(rep.repeated_opener_share, 0.75, 'three of four sentences share an opener');
  // Empty input never throws and gives zeros.
  const empty = computeStyleMetrics('');
  assert.equal(empty.word_count, 0);
  assert.equal(empty.sentence_count, 0);
});

test('splitSentences handles newline-terminated and punctuated sentences', () => {
  const s = splitSentences('One sentence. Two sentence!\nA line without a stop\nLast one?');
  assert.equal(s.length, 4);
});

test('recordStyleMetrics stores and upserts a fingerprint per pad', async () => {
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const student = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentId = student.json().student.id;
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const pad = await app.inject({ method: 'GET',
    url: `/api/native/assignments/${created.json().assignment.id}/pad`,
    headers: { cookie: sLogin.headers['set-cookie'] } });
  const padId = pad.json().pad.id;
  db.prepare('UPDATE native_pads SET plain_text = ? WHERE id = ?').run(SAMPLE, padId);

  const result = recordStyleMetrics(db, { padId });
  assert.equal(result.status, 'ok');
  const row = db.prepare('SELECT * FROM style_metrics WHERE native_pad_id = ?').get(padId);
  assert.equal(row.student_id, studentId);
  assert.ok(row.word_count > 100);
  assert.ok(JSON.parse(row.metrics_json).mean_sentence_length > 0);

  // Upsert, not duplicate.
  recordStyleMetrics(db, { padId });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM style_metrics WHERE native_pad_id = ?').get(padId).n, 1);

  // Aggregate view over the student's essays.
  const profile = aggregateStyleProfile(db, { studentId });
  assert.equal(profile.essays, 1);
  assert.ok(profile.features.mean_sentence_length.mean > 0);
  assert.equal(profile.features.mean_sentence_length.trend, null, 'no trend with fewer than 4 essays');

  // Empty pad is a clean skip.
  db.prepare("UPDATE native_pads SET plain_text = '' WHERE id = ?").run(padId);
  assert.equal(recordStyleMetrics(db, { padId }).status, 'skipped');

  await app.close();
});
