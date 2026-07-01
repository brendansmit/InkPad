CREATE TABLE IF NOT EXISTS feedback_assets (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  assignment_type TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  parsed_json TEXT NOT NULL DEFAULT '{}',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CHECK (kind IN ('strength_target', 'rubric')),
  CHECK (is_archived IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_feedback_assets_kind ON feedback_assets(kind, is_archived);
