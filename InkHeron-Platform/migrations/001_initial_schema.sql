PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  class_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('essay', 'test')),
  settings_json TEXT NOT NULL,
  opens_at TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pads (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  etherpad_pad_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'writing' CHECK (
    state IN ('writing', 'submitted', 'marked', 'green_pen_open', 'resubmitted')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, assignment_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  pad_id INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_graded INTEGER NOT NULL DEFAULT 0 CHECK (is_graded IN (0, 1)),
  released INTEGER NOT NULL DEFAULT 0 CHECK (released IN (0, 1)),
  FOREIGN KEY (pad_id) REFERENCES pads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  score REAL NOT NULL,
  released INTEGER NOT NULL DEFAULT 0 CHECK (released IN (0, 1)),
  graded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paste_events (
  id INTEGER PRIMARY KEY,
  pad_id INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  length INTEGER NOT NULL CHECK (length >= 0),
  input_type TEXT NOT NULL,
  FOREIGN KEY (pad_id) REFERENCES pads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_pads_student_id ON pads(student_id);
CREATE INDEX IF NOT EXISTS idx_pads_assignment_id ON pads(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_pad_id ON submissions(pad_id);
CREATE INDEX IF NOT EXISTS idx_grades_submission_id ON grades(submission_id);
CREATE INDEX IF NOT EXISTS idx_paste_events_pad_id ON paste_events(pad_id);
