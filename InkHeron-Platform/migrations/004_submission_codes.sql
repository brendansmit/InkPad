PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS submission_codes (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset >= start_offset),
  code TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_codes_submission_id ON submission_codes(submission_id);
