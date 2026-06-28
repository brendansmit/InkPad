PRAGMA foreign_keys = ON;

ALTER TABLE students ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1));
ALTER TABLE students ADD COLUMN is_ghost INTEGER NOT NULL DEFAULT 0 CHECK (is_ghost IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_students_is_demo ON students(is_demo);
CREATE INDEX IF NOT EXISTS idx_students_is_ghost ON students(is_ghost);
