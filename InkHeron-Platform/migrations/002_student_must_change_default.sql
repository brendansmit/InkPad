PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS students_rebuild (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  class_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

INSERT INTO students_rebuild (
  id,
  username,
  display_name,
  password_hash,
  class_id,
  created_at,
  must_change_password
)
SELECT
  id,
  username,
  display_name,
  password_hash,
  class_id,
  created_at,
  must_change_password
FROM students;

DROP TABLE students;
ALTER TABLE students_rebuild RENAME TO students;

CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);

PRAGMA foreign_keys = ON;
