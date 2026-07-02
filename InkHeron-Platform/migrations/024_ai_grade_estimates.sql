-- Marker-preference profile foundation.
--
-- Before the teacher marks, the AI (Fable, phase D3) privately estimates a
-- rubric score. The estimate stays HIDDEN from the teacher so it cannot
-- anchor their marking. When the teacher submits their own score, the delta
-- is recorded. Over many assignments these deltas build a picture of how the
-- teacher marks relative to the model (their "marker preference").
--
-- One row per (pad, rubric_kind, criterion). ai_score is filled first;
-- teacher_score and delta are filled on finish-marking once the human score
-- exists. rubric_kind matches assignment_rubric_criteria.rubric_kind.
CREATE TABLE IF NOT EXISTS ai_grade_estimates (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  rubric_kind TEXT NOT NULL DEFAULT 'internal',
  criterion_id INTEGER,
  ai_score REAL,
  teacher_score REAL,
  delta REAL,
  model TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scored_at TEXT,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id) REFERENCES assignment_rubric_criteria(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_grade_estimates_pad ON ai_grade_estimates(native_pad_id, rubric_kind);
CREATE INDEX IF NOT EXISTS idx_ai_grade_estimates_teacher_delta ON ai_grade_estimates(rubric_kind, delta);
