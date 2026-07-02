-- Time-series snapshot of rubric scores, appended each time a teacher
-- finishes marking a pad. native_rubric_scores holds only the current
-- state (UNIQUE per pad+criterion); this table preserves history so
-- "rubric performance over time" and "AP estimate history" are possible.
--
-- One row per (pad, marking event, rubric_kind). scores_json is the full
-- per-criterion breakdown at that moment: [{criterion_id, label, score}].
-- total is the summed/weighted score for convenience.
CREATE TABLE IF NOT EXISTS score_snapshots (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  rubric_kind TEXT NOT NULL DEFAULT 'internal',
  scores_json TEXT NOT NULL DEFAULT '[]',
  total REAL,
  pad_state TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_score_snapshots_student ON score_snapshots(student_id, rubric_kind, recorded_at);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_pad ON score_snapshots(native_pad_id, rubric_kind);
