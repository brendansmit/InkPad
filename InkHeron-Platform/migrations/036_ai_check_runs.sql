-- Batch "Run check" jobs.
--
-- The AI chain used to fire on every submit. It now runs only when the teacher
-- asks for it, over a whole assignment at once (teacher decision, 2026-08-29).
-- One run can take twenty minutes for a class, so it cannot live in the HTTP
-- request: the teacher starts it, closes the tab, and comes back later. This
-- table is the run's memory, so progress survives both a closed tab and a
-- server restart.
--
-- status: 'running' | 'done' | 'error' | 'interrupted'
--   'interrupted' is stamped at startup on any run left 'running' by a restart,
--   so a dead run never shows as still going.
-- result_json holds the per-pad summary the review page already understands.
CREATE TABLE IF NOT EXISTS ai_check_runs (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  started_by INTEGER,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error', 'interrupted')),
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  current_student TEXT NOT NULL DEFAULT '',
  total_marks INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_check_runs_assignment ON ai_check_runs(assignment_id, id DESC);
