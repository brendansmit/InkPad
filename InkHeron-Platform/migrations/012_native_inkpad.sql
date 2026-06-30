CREATE TABLE IF NOT EXISTS native_pads (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'writing' CHECK (state IN ('writing', 'submitted', 'marked', 'green_pen_open', 'resubmitted')),
  document_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
  plain_text TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  UNIQUE (student_id, assignment_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS native_pad_revisions (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('create', 'autosave', 'submit', 'manual')),
  document_json TEXT NOT NULL,
  plain_text TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS native_paste_events (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  length INTEGER NOT NULL CHECK (length >= 0),
  input_type TEXT NOT NULL,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_native_pads_student_id ON native_pads(student_id);
CREATE INDEX IF NOT EXISTS idx_native_pads_assignment_id ON native_pads(assignment_id);
CREATE INDEX IF NOT EXISTS idx_native_pad_revisions_pad_id ON native_pad_revisions(native_pad_id);
CREATE INDEX IF NOT EXISTS idx_native_paste_events_pad_id ON native_paste_events(native_pad_id);
