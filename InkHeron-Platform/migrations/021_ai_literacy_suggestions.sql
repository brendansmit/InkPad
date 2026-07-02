-- Hidden holding area for AI-generated literacy findings.
--
-- The literacy coder (Fable, phase B) writes rows here after a student
-- submits. They are NOT visible as marks and do NOT feed the profile until
-- a teacher accepts one, which promotes it into a real native_annotations
-- row (type 'literacy_code') and triggers syncLiteracyEvidence.
--
-- status: 'pending'  = awaiting teacher review
--         'accepted' = promoted to a native_annotation (annotation_id set)
--         'rejected' = dismissed by the teacher
--
-- checker_json holds the second-model (Checker) verdict per CLAUDE.md §8:
-- e.g. {"verbatim": true, "confidence": 0.9, "flag": null}.
CREATE TABLE IF NOT EXISTS ai_literacy_suggestions (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  document_version INTEGER NOT NULL DEFAULT 1,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  quote TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  checker_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  annotation_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (annotation_id) REFERENCES native_annotations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_literacy_suggestions_pad ON ai_literacy_suggestions(native_pad_id, status);
