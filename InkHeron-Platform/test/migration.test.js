import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/migrate.js';

const expectedColumns = {
  students: ['id', 'username', 'display_name', 'password_hash', 'class_id', 'created_at', 'must_change_password'],
  classes: ['id', 'name', 'created_at'],
  assignments: ['id', 'class_id', 'title', 'type', 'settings_json', 'opens_at', 'due_at', 'created_at'],
  pads: ['id', 'student_id', 'assignment_id', 'etherpad_pad_id', 'state', 'created_at'],
  submissions: ['id', 'pad_id', 'submitted_at', 'is_graded', 'released'],
  grades: ['id', 'submission_id', 'score', 'released', 'graded_at'],
  paste_events: ['id', 'pad_id', 'at', 'length', 'input_type'],
  settings: ['key', 'value', 'updated_at'],
  teachers: ['id', 'username', 'display_name', 'password_hash', 'created_at'],
};

test('migration creates canonical schema and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-db-'));
  const dbPath = path.join(dir, 'inkheron.db');

  const first = runMigrations(dbPath);
  const second = runMigrations(dbPath);

  assert.deepEqual(first.applied, ['001_initial_schema.sql']);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, ['001_initial_schema.sql']);

  const db = new DatabaseSync(dbPath);
  try {
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
      assert.deepEqual(actual, columns, table);
    }

    const padIndexes = db.prepare('PRAGMA index_list(pads)').all().map((index) => index.name);
    assert.ok(padIndexes.some((name) => name.includes('student_id') || name.includes('assignment_id')));
  } finally {
    db.close();
  }
});
