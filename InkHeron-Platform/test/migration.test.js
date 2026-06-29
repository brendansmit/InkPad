import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/migrate.js';

const expectedColumns = {
  students: ['id', 'username', 'display_name', 'password_hash', 'class_id', 'created_at', 'must_change_password', 'is_demo', 'is_ghost'],
  classes: ['id', 'name', 'created_at'],
  assignments: ['id', 'class_id', 'title', 'type', 'settings_json', 'opens_at', 'due_at', 'created_at'],
  pads: ['id', 'student_id', 'assignment_id', 'etherpad_pad_id', 'state', 'created_at'],
  submissions: ['id', 'pad_id', 'submitted_at', 'is_graded', 'released'],
  grades: ['id', 'submission_id', 'score', 'released', 'graded_at'],
  paste_events: ['id', 'pad_id', 'at', 'length', 'input_type'],
  submission_codes: ['id', 'submission_id', 'start_offset', 'end_offset', 'code', 'category', 'label', 'created_at'],
  submission_feedback: ['id', 'submission_id', 'kind', 'feedback_key', 'title', 'explanation', 'created_at'],
  settings: ['key', 'value', 'updated_at'],
  teachers: ['id', 'username', 'display_name', 'password_hash', 'created_at'],
  assignment_students: ['assignment_id', 'student_id'],
  eap_library_categories: ['id', 'label', 'icon', 'sort_order'],
  eap_library_docs: ['id', 'filename', 'title', 'hidden', 'views', 'uploaded_at', 'category_id', 'icon', 'release_at', 'file_type', 'downloadable'],
  eap_library_view_log: ['id', 'doc_id', 'student_name', 'class_period', 'viewed_at', 'duration_seconds'],
};

const migrationFiles = [
  '001_initial_schema.sql',
  '002_student_must_change_default.sql',
  '003_student_demo_ghost_flags.sql',
  '004_submission_codes.sql',
  '005_submission_feedback.sql',
  '006_assignment_students.sql',
  '007_eap_library.sql',
];

test('migration creates canonical schema and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-db-'));
  const dbPath = path.join(dir, 'inkheron.db');

  const first = runMigrations(dbPath);
  const second = runMigrations(dbPath);

  assert.deepEqual(first.applied, migrationFiles);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, migrationFiles);

  const db = new DatabaseSync(dbPath);
  try {
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
      assert.deepEqual(actual, columns, table);
    }

    db.prepare('INSERT INTO classes (name) VALUES (?)').run('Default Check');
    db.prepare(`
      INSERT INTO students (username, display_name, password_hash, class_id)
      VALUES ('default-check', 'Default Check', 'hash', 1)
    `).run();
    const student = db.prepare('SELECT must_change_password FROM students WHERE username = ?').get('default-check');
    assert.equal(student.must_change_password, 0);

    const padIndexes = db.prepare('PRAGMA index_list(pads)').all().map((index) => index.name);
    assert.ok(padIndexes.some((name) => name.includes('student_id') || name.includes('assignment_id')));
  } finally {
    db.close();
  }
});
