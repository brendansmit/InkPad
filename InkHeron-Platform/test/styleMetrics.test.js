import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { computeStyleMetrics, recordStyleMetrics, aggregateStyleProfile, detectStyleAnomaly, splitSentences } from '../src/services/styleMetrics.js';

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

test('detectStyleAnomaly flags an essay that does not match the student voice', () => {
  // Bare in-memory db with only the table the function touches, no FKs.
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE style_metrics (
    id INTEGER PRIMARY KEY, native_pad_id INTEGER NOT NULL UNIQUE, student_id INTEGER NOT NULL,
    assignment_id INTEGER NOT NULL, word_count INTEGER NOT NULL DEFAULT 0,
    metrics_json TEXT NOT NULL DEFAULT '{}', essay_type TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  // Their normal: short simple sentences. Slight natural variation.
  const usual = 'I like my city. It is big. We walk to school. My friend comes too. The food is good. We eat noodles. Then we go home. My mother cooks rice.';
  const insert = db.prepare('INSERT INTO style_metrics (native_pad_id, student_id, assignment_id, word_count, metrics_json) VALUES (?, 1, 1, ?, ?)');
  const variants = [usual, usual + ' I sleep early.', usual + ' We play games. It is fun.', 'I like my town. It is small. We ride bikes. My cousin comes too. The tea is good. We drink it. Then we rest. My father cooks fish.'];
  variants.forEach((textVariant, i) => {
    const m = computeStyleMetrics(textVariant);
    insert.run(i + 1, m.word_count, JSON.stringify(m));
  });

  // The homework essay: long subordinated academic prose. Not their voice.
  const suspicious = 'Although urbanization has fundamentally transformed contemporary metropolitan environments, which increasingly exhibit unprecedented infrastructural complexity, residents nevertheless demonstrate remarkable adaptability because technological integration facilitates continuous connectivity; consequently, communities that historically depended upon localized interaction now negotiate hybridized social configurations, which scholars characterize as simultaneously liberating and alienating, although empirical assessments remain contested.';
  const sm = computeStyleMetrics(suspicious);
  insert.run(99, sm.word_count, JSON.stringify(sm));

  const result = detectStyleAnomaly(db, { padId: 99 });
  assert.equal(result.status, 'ok');
  assert.equal(result.essays, 4);
  assert.ok(result.anomalies.length >= 2, 'multiple features flag');
  const features = result.anomalies.map((a) => a.feature);
  assert.ok(features.includes('mean_sentence_length'), 'sentence length is wildly off their normal');
  assert.ok(Math.abs(result.anomalies[0].z) >= 2);

  // A normal essay does not flag.
  insert.run(100, 30, JSON.stringify(computeStyleMetrics(usual + ' We like it here.')));
  const calm = detectStyleAnomaly(db, { padId: 100 });
  assert.equal(calm.status, 'ok');
  assert.equal(calm.anomalies.some((a) => a.feature === 'mean_sentence_length'), false);

  // Too little history is reported, not guessed.
  db.exec('DELETE FROM style_metrics WHERE native_pad_id NOT IN (1, 99)');
  assert.equal(detectStyleAnomaly(db, { padId: 99 }).status, 'insufficient_history');
});

test('AP register features count attribution, rhetoric, concession, quotes and formality', () => {
  const synthesis = 'Smith argues that "cities must adapt quickly" and the author of Source B claims the opposite. According to Jones, "planning fails without data". These sources suggest a middle path.';
  const ms = computeStyleMetrics(synthesis);
  assert.ok(ms.attribution_verbs_per_100_words > 5, 'argues, claims, according counted');
  assert.ok(ms.quoted_evidence_per_100_words > 0, 'two quote pairs counted');

  const rhetorical = 'The author uses vivid imagery and an urgent tone to persuade her audience. This diction conveys fear while the appeal to logos emphasizes the data.';
  const mr = computeStyleMetrics(rhetorical);
  assert.ok(mr.rhetoric_terms_per_100_words > 10, 'imagery, tone, diction, audience, appeal, logos counted');

  const argument = "Admittedly, critics contend that homework helps. Granted, some practice matters. But it's clear the evidence points the other way and you can see it.";
  const ma = computeStyleMetrics(argument);
  assert.ok(ma.concession_markers_per_100_words > 5, 'admittedly, critics, granted counted');
  assert.ok(ma.contractions_per_100_words > 0, "it's counted as informal register");
  assert.ok(ma.second_person_per_100_words > 0, 'you counted');

  const nominal = 'The implementation of the regulation caused significant transformation and the establishment of new governance.';
  const mn = computeStyleMetrics(nominal);
  assert.ok(mn.nominalizations_per_100_words > 10, 'implementation, regulation, transformation, establishment counted');
});

test('aggregateStyleProfile groups fingerprints per essay type', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE style_metrics (
    id INTEGER PRIMARY KEY, native_pad_id INTEGER NOT NULL UNIQUE, student_id INTEGER NOT NULL,
    assignment_id INTEGER NOT NULL, word_count INTEGER NOT NULL DEFAULT 0,
    metrics_json TEXT NOT NULL DEFAULT '{}', essay_type TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const insert = db.prepare('INSERT INTO style_metrics (native_pad_id, student_id, assignment_id, word_count, metrics_json, essay_type) VALUES (?, 1, 1, ?, ?, ?)');
  const synth = computeStyleMetrics('Smith argues that "data matters". According to Jones, "plans fail". I agree with Smith because the evidence is strong.');
  const arg = computeStyleMetrics('Admittedly, critics disagree. But homework clearly helps because practice builds skill, although balance matters.');
  insert.run(1, synth.word_count, JSON.stringify(synth), 'synthesis');
  insert.run(2, arg.word_count, JSON.stringify(arg), 'argument');

  const profile = aggregateStyleProfile(db, { studentId: 1 });
  assert.equal(profile.essays, 2);
  assert.deepEqual(Object.keys(profile.by_essay_type).sort(), ['argument', 'synthesis']);
  assert.equal(profile.by_essay_type.synthesis.essays, 1);
  assert.ok(profile.by_essay_type.synthesis.features.attribution_verbs_per_100_words.mean
    > profile.by_essay_type.argument.features.attribution_verbs_per_100_words.mean,
  'synthesis fingerprint shows more attribution than argument');
  assert.ok(profile.by_essay_type.argument.features.concession_markers_per_100_words.mean > 0);
});

test('detectStyleAnomaly prefers same-type history so a genre shift is not an anomaly', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE style_metrics (
    id INTEGER PRIMARY KEY, native_pad_id INTEGER NOT NULL UNIQUE, student_id INTEGER NOT NULL,
    assignment_id INTEGER NOT NULL, word_count INTEGER NOT NULL DEFAULT 0,
    metrics_json TEXT NOT NULL DEFAULT '{}', essay_type TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const insert = db.prepare('INSERT INTO style_metrics (native_pad_id, student_id, assignment_id, word_count, metrics_json, essay_type) VALUES (?, 1, 1, ?, ?, ?)');
  const simple = 'I like my city. It is big. We walk to school. My friend comes too. The food is good.';
  const academic = 'Although urbanization transforms cities, residents adapt because technology facilitates connectivity; consequently, communities negotiate configurations that scholars characterize as liberating.';
  // Three personal essays and three rhetorical analyses in two distinct voices.
  [simple, simple + ' We eat noodles.', simple + ' Then we go home. It is fun.'].forEach((t, i) => {
    const m = computeStyleMetrics(t);
    insert.run(i + 1, m.word_count, JSON.stringify(m), 'personal');
  });
  [academic, academic + ' The tone conveys urgency.', academic + ' Her diction emphasizes appeals to the audience and evokes fear.'].forEach((t, i) => {
    const m = computeStyleMetrics(t);
    insert.run(i + 10, m.word_count, JSON.stringify(m), 'rhetorical_analysis');
  });
  // A fourth rhetorical analysis in the same academic voice: with same-type
  // baseline this is calm; against the personal essays it would scream.
  const next = computeStyleMetrics(academic + ' The author uses imagery to persuade.');
  insert.run(20, next.word_count, JSON.stringify(next), 'rhetorical_analysis');
  const result = detectStyleAnomaly(db, { padId: 20 });
  assert.equal(result.status, 'ok');
  assert.equal(result.baseline, 'same_type');
  assert.equal(result.anomalies.some((a) => a.feature === 'mean_sentence_length'), false,
    'long academic sentences are normal for THIS task type');

  // With no same-type history the baseline falls back to all essays.
  db.exec("DELETE FROM style_metrics WHERE essay_type = 'rhetorical_analysis' AND native_pad_id != 20");
  const fallback = detectStyleAnomaly(db, { padId: 20 });
  assert.equal(fallback.baseline, 'all_types');
});
