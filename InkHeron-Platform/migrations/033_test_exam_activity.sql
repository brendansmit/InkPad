ALTER TABLE test_attempts ADD COLUMN rules_acknowledged_at TEXT;
ALTER TABLE test_attempts ADD COLUMN last_activity_at TEXT;
ALTER TABLE test_attempts ADD COLUMN extra_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_attempts ADD COLUMN unlocked_until TEXT;
ALTER TABLE test_attempts ADD COLUMN unlock_reason TEXT;
ALTER TABLE test_attempts ADD COLUMN force_submitted_at TEXT;
ALTER TABLE test_attempts ADD COLUMN sound_disabled INTEGER NOT NULL DEFAULT 0 CHECK (sound_disabled IN (0, 1));
ALTER TABLE test_attempts ADD COLUMN pulse_disabled INTEGER NOT NULL DEFAULT 0 CHECK (pulse_disabled IN (0, 1));

CREATE TABLE IF NOT EXISTS test_assignment_controls (
  assignment_id INTEGER PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  paused_at TEXT,
  pause_total_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_teacher_id INTEGER REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS test_activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES test_questions(id),
  section_index INTEGER,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  excused_at TEXT,
  excused_by_teacher_id INTEGER REFERENCES teachers(id),
  excuse_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_activity_attempt ON test_activity_events(attempt_id, created_at);
CREATE INDEX IF NOT EXISTS idx_test_activity_assignment ON test_activity_events(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_test_activity_question ON test_activity_events(question_id);
