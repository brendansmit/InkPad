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
  assignments: ['id', 'class_id', 'title', 'type', 'settings_json', 'opens_at', 'due_at', 'created_at', 'is_archived'],
  pads: ['id', 'student_id', 'assignment_id', 'etherpad_pad_id', 'state', 'created_at'],
  pad_allocations: ['pad_suffix', 'etherpad_pad_id', 'created_at'],
  native_pads: ['id', 'student_id', 'assignment_id', 'state', 'document_json', 'plain_text', 'word_count', 'created_at', 'updated_at', 'submitted_at', 'version', 'applied_feedback_table', 'rewrite_of_pad_id'],
  native_pad_revisions: ['id', 'native_pad_id', 'reason', 'document_json', 'plain_text', 'word_count', 'created_at', 'document_version'],
  native_paste_events: ['id', 'native_pad_id', 'at', 'length', 'input_type'],
  native_pad_policies: ['id', 'native_pad_id', 'paste_mode', 'spellcheck_enabled', 'updated_by_teacher_id', 'updated_at'],
  native_annotations: ['id', 'native_pad_id', 'teacher_id', 'type', 'start_offset', 'end_offset', 'selected_text', 'body', 'metadata_json', 'resolved', 'document_version', 'created_at', 'updated_at'],
  native_teacher_events: ['id', 'native_pad_id', 'teacher_id', 'action', 'metadata_json', 'created_at'],
  assignment_rubric_criteria: ['id', 'assignment_id', 'label', 'description', 'weight', 'sort_order', 'created_at', 'updated_at', 'rubric_kind'],
  assignment_rubric_bands: ['id', 'criterion_id', 'score_value', 'label', 'descriptor', 'sort_order', 'created_at'],
  native_rubric_scores: ['id', 'native_pad_id', 'criterion_id', 'selected_score', 'note', 'updated_by_teacher_id', 'updated_at'],
  student_writing_profiles: ['id', 'student_id', 'writing_summary', 'voice_summary', 'targets_json', 'created_at', 'updated_at'],
  student_literacy_issue_stats: ['id', 'student_id', 'code', 'category', 'label', 'evidence_count', 'open_count', 'resolved_count', 'first_seen_at', 'last_seen_at', 'updated_at'],
  student_literacy_evidence: ['id', 'student_id', 'assignment_id', 'native_pad_id', 'annotation_id', 'code', 'category', 'label', 'selected_text', 'teacher_note', 'document_version', 'resolved', 'created_at', 'updated_at'],
  feedback_assets: ['id', 'teacher_id', 'kind', 'title', 'assignment_type', 'content_text', 'parsed_json', 'is_archived', 'created_at', 'updated_at'],
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
  sessions: ['sid', 'data', 'expires_at'],
  submission_comments: ['id', 'submission_id', 'kind', 'body', 'created_at', 'updated_at'],
  native_feedback_items: ['id', 'native_pad_id', 'kind', 'feedback_key', 'title', 'explanation', 'try_now_prompt', 'source', 'sort_order', 'created_by_teacher_id', 'created_at', 'updated_at', 'student_checked', 'student_checked_at'],
  score_snapshots: ['id', 'native_pad_id', 'student_id', 'assignment_id', 'rubric_kind', 'scores_json', 'total', 'pad_state', 'recorded_at'],
  ai_literacy_suggestions: ['id', 'native_pad_id', 'document_version', 'start_offset', 'end_offset', 'quote', 'code', 'category', 'label', 'model', 'checker_json', 'status', 'annotation_id', 'created_at', 'resolved_at'],
  implementation_scores: ['id', 'rewrite_pad_id', 'original_pad_id', 'student_id', 'addressed_json', 'cosmetic_ratio', 'meaningful', 'summary', 'model', 'created_at'],
  ai_grade_estimates: ['id', 'native_pad_id', 'student_id', 'assignment_id', 'rubric_kind', 'criterion_id', 'ai_score', 'teacher_score', 'delta', 'model', 'rationale', 'created_at', 'scored_at'],
  ai_feedback_item_suggestions: ['id', 'native_pad_id', 'kind', 'title', 'explanation', 'try_now_prompt', 'model', 'checker_json', 'status', 'feedback_item_id', 'created_at', 'resolved_at'],
};

const migrationFiles = [
  '001_initial_schema.sql',
  '002_student_must_change_default.sql',
  '003_student_demo_ghost_flags.sql',
  '004_submission_codes.sql',
  '005_submission_feedback.sql',
  '006_assignment_students.sql',
  '007_eap_library.sql',
  '008_assignment_archived.sql',
  '009_sessions.sql',
  '010_submission_comments.sql',
  '011_pad_allocations.sql',
  '012_native_inkpad.sql',
  '013_native_review_policy.sql',
  '014_native_rubrics.sql',
  '015_student_writing_profiles.sql',
  '016_feedback_assets.sql',
  '017_rubric_kind.sql',
  '018_applied_feedback_table.sql',
  '019_native_feedback_items.sql',
  '020_score_snapshots.sql',
  '021_ai_literacy_suggestions.sql',
  '022_native_pad_rewrite_link.sql',
  '023_implementation_scores.sql',
  '024_ai_grade_estimates.sql',
  '025_style_metrics.sql',
  '026_ai_feedback_item_suggestions.sql',
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
