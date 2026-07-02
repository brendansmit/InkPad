-- Structured strengths and targets attached to a native pad.
-- Replaces the old Etherpad submission_feedback table and the faked
-- "Target: ..." comment bodies. One row per strength or target shown to
-- the student in the feedback / green-pen view. Feeds the student profile
-- (targets roll up into student_writing_profiles.targets_json).
--
-- source = 'teacher' for a teacher-applied item, 'ai' for an AI suggestion
-- that has been accepted. AI items are NOT written here until accepted; see
-- ai_literacy_suggestions for the hidden-suggestion holding area.
CREATE TABLE IF NOT EXISTS native_feedback_items (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('strength', 'target')),
  feedback_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  try_now_prompt TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'ai')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_teacher_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_native_feedback_items_pad ON native_feedback_items(native_pad_id, kind);
