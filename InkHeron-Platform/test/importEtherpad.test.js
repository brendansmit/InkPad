import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/migrate.js';
import { importEtherpadAssignment } from '../scripts/import-etherpad-to-native.mjs';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-etherpad-import-'));
  return path.join(dir, 'test.db');
}

function seedDatabase(databasePath) {
  runMigrations(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  const classId = db.prepare("INSERT INTO classes (name) VALUES ('11A')").run().lastInsertRowid;
  const assignmentId = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json)
    VALUES (?, 'Etherpad rescue', 'essay', ?)
  `).run(classId, JSON.stringify({ prompt: 'Write.' })).lastInsertRowid;
  const aliceId = db.prepare(`
    INSERT INTO students (username, display_name, password_hash, class_id)
    VALUES ('alice', 'Alice Chen', 'hash', ?)
  `).run(classId).lastInsertRowid;
  const bobId = db.prepare(`
    INSERT INTO students (username, display_name, password_hash, class_id)
    VALUES ('bob', 'Bob Li', 'hash', ?)
  `).run(classId).lastInsertRowid;
  const alicePadId = db.prepare(`
    INSERT INTO pads (student_id, assignment_id, etherpad_pad_id, state)
    VALUES (?, ?, 'g.1$alice', 'submitted')
  `).run(aliceId, assignmentId).lastInsertRowid;
  db.prepare('INSERT INTO submissions (pad_id, submitted_at) VALUES (?, ?)').run(alicePadId, '2026-07-01 10:00:00');
  db.prepare(`
    INSERT INTO pads (student_id, assignment_id, etherpad_pad_id, state)
    VALUES (?, ?, 'g.1$bob', 'writing')
  `).run(bobId, assignmentId);
  db.close();
  return { assignmentId, aliceId, bobId };
}

function fakeEtherpad(textByPadId) {
  return {
    async getPadText(padId) {
      if (!(padId in textByPadId)) throw new Error(`missing ${padId}`);
      return textByPadId[padId];
    },
  };
}

test('Etherpad importer dry-runs without writing native pads', async () => {
  const databasePath = tmpDb();
  const { assignmentId } = seedDatabase(databasePath);

  const summary = await importEtherpadAssignment({
    databasePath,
    assignmentId,
    etherpadService: fakeEtherpad({
      'g.1$alice': 'First paragraph.\n\nSecond paragraph.\n',
      'g.1$bob': 'Bob writes one paragraph.',
    }),
  });

  assert.equal(summary.mode, 'dry_run');
  assert.equal(summary.total, 2);
  assert.equal(summary.failed, 0);
  assert.equal(summary.flipped_assignment, false);

  const db = new DatabaseSync(databasePath);
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM native_pads').get().count, 0);
    const settings = JSON.parse(db.prepare('SELECT settings_json FROM assignments WHERE id = ?').get(assignmentId).settings_json);
    assert.equal(settings.native_inkpad, undefined);
  } finally {
    db.close();
  }
});

test('Etherpad importer applies current content with paragraph structure and flips assignment native', async () => {
  const databasePath = tmpDb();
  const { assignmentId, aliceId, bobId } = seedDatabase(databasePath);

  const summary = await importEtherpadAssignment({
    databasePath,
    assignmentId,
    apply: true,
    etherpadService: fakeEtherpad({
      'g.1$alice': 'First paragraph.\n\nSecond paragraph.\n',
      'g.1$bob': 'Bob writes one paragraph.',
    }),
  });

  assert.equal(summary.mode, 'apply');
  assert.equal(summary.total, 2);
  assert.equal(summary.failed, 0);
  assert.equal(summary.flipped_assignment, true);

  const db = new DatabaseSync(databasePath);
  try {
    const alice = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ? AND student_id = ?').get(assignmentId, aliceId);
    assert.equal(alice.state, 'submitted');
    assert.equal(alice.submitted_at, '2026-07-01 10:00:00');
    assert.equal(alice.plain_text, 'First paragraph.\n\nSecond paragraph.');
    assert.match(JSON.parse(alice.document_json).html, /<p>First paragraph\.<\/p><p>Second paragraph\.<\/p>/);

    const bob = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ? AND student_id = ?').get(assignmentId, bobId);
    assert.equal(bob.state, 'writing');
    assert.equal(bob.plain_text, 'Bob writes one paragraph.');

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM native_pad_revisions').get().count, 2);
    const settings = JSON.parse(db.prepare('SELECT settings_json FROM assignments WHERE id = ?').get(assignmentId).settings_json);
    assert.equal(settings.native_inkpad, true);
  } finally {
    db.close();
  }
});

test('Etherpad importer skips existing non-empty native pads unless overwrite is set', async () => {
  const databasePath = tmpDb();
  const { assignmentId, aliceId } = seedDatabase(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, document_json, plain_text, word_count)
    VALUES (?, ?, ?, 'Keep me', 2)
  `).run(aliceId, assignmentId, JSON.stringify({ type: 'html', html: '<p>Keep me</p>', text: 'Keep me' }));
  db.close();

  const summary = await importEtherpadAssignment({
    databasePath,
    assignmentId,
    apply: true,
    etherpadService: fakeEtherpad({
      'g.1$alice': 'Imported Alice.',
      'g.1$bob': 'Imported Bob.',
    }),
  });

  assert.equal(summary.results.find((row) => row.username === 'alice').action, 'skipped_existing');

  const check = new DatabaseSync(databasePath);
  try {
    assert.equal(
      check.prepare('SELECT plain_text FROM native_pads WHERE assignment_id = ? AND student_id = ?').get(assignmentId, aliceId).plain_text,
      'Keep me',
    );
  } finally {
    check.close();
  }
});
