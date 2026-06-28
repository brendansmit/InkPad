PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS submission_feedback (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('strength', 'target')),
  feedback_key TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, kind, feedback_key),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_feedback_submission_id ON submission_feedback(submission_id);
