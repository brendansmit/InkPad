CREATE TABLE IF NOT EXISTS student_writing_profiles (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE,
  writing_summary TEXT NOT NULL DEFAULT '',
  voice_summary TEXT NOT NULL DEFAULT '',
  targets_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_literacy_issue_stats (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT,
  last_seen_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE (student_id, code, category)
);

CREATE TABLE IF NOT EXISTS student_literacy_evidence (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  native_pad_id INTEGER NOT NULL,
  annotation_id INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  selected_text TEXT NOT NULL DEFAULT '',
  teacher_note TEXT NOT NULL DEFAULT '',
  document_version INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (annotation_id) REFERENCES native_annotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_literacy_issue_stats_student ON student_literacy_issue_stats(student_id);
CREATE INDEX IF NOT EXISTS idx_student_literacy_evidence_student ON student_literacy_evidence(student_id);
CREATE INDEX IF NOT EXISTS idx_student_literacy_evidence_pad ON student_literacy_evidence(native_pad_id);
