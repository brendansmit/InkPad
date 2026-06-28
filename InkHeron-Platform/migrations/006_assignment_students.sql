-- Per-assignment student overrides.
-- When this table has NO rows for a given assignment_id the assignment
-- falls back to the class-wide default (all students whose class_id matches
-- assignments.class_id can access it).
-- When ANY rows exist for an assignment_id, ONLY those student_ids have access,
-- regardless of their class membership.  This lets teachers add latecomers,
-- exclude individuals, or cross-assign to students from other classes.
CREATE TABLE IF NOT EXISTS assignment_students (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, student_id)
);
