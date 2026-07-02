-- Stylometric fingerprint per pad (phase C voice layer, deterministic half).
--
-- Computed by src/services/styleMetrics.js on every submit. No AI involved:
-- these are counted features (sentence rhythm, lexical range, syntax proxies,
-- discourse habits). Comparing rows across a student's pads is what makes the
-- voice/style profile honest; the AI narrative layer only describes what
-- these numbers already show. metrics_json is the full feature object.
CREATE TABLE IF NOT EXISTS style_metrics (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL UNIQUE,
  student_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_style_metrics_student ON style_metrics(student_id, created_at);

-- Students tick off targets they have addressed during green pen.
ALTER TABLE native_feedback_items ADD COLUMN student_checked INTEGER NOT NULL DEFAULT 0 CHECK (student_checked IN (0, 1));
ALTER TABLE native_feedback_items ADD COLUMN student_checked_at TEXT;
