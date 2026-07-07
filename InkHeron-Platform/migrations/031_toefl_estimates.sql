-- Teacher-only TOEFL writing-score estimates.
--
-- Directional coaching intelligence for the teacher, never a promise and
-- never visible to a student. Same wall as ai_grade_estimates: nothing here
-- may ever reach a student-facing payload, page or push. Every route that
-- reads these tables requires a teacher session.
--
-- TOEFL iBT writing is two tasks (Integrated, Writing for an Academic
-- Discussion), each banded 0 to 5, reported scaled 0 to 30. The estimate is
-- always a RANGE (scaled_low to scaled_high), never a single number.
--
-- History is kept (no UNIQUE on student_id); the newest row wins for display.
CREATE TABLE IF NOT EXISTS toefl_estimates (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  integrated_band REAL,
  discussion_band REAL,
  scaled_low INTEGER,
  scaled_high INTEGER,
  confidence REAL,
  rationale TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_toefl_estimates_student ON toefl_estimates(student_id, created_at);

-- Teacher-entered real TOEFL writing scores (0 to 30). Used as anchors for
-- future estimates ("a student with these numbers scored X").
CREATE TABLE IF NOT EXISTS known_toefl_scores (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  writing_score INTEGER NOT NULL,
  noted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_known_toefl_scores_student ON known_toefl_scores(student_id, created_at);
