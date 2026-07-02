-- Green-pen implementation score: did the student actually act on the
-- feedback in their rewrite, or just make cosmetic edits?
--
-- One row per rewrite pad. Written by the implementation scorer (Fable,
-- phase D2) which compares the original pad, the teacher feedback, and the
-- rewrite. addressed_json is the structured verdict, e.g.
--   {"codes": [{"code":"Gra","addressed":true}],
--    "targets": [{"id":"t1","addressed":false}],
--    "inline_comments_addressed": 3, "inline_comments_total": 5}
-- cosmetic_ratio 0..1 (higher = more superficial), meaningful is the
-- headline boolean, summary is a short human-readable note.
CREATE TABLE IF NOT EXISTS implementation_scores (
  id INTEGER PRIMARY KEY,
  rewrite_pad_id INTEGER NOT NULL UNIQUE,
  original_pad_id INTEGER,
  student_id INTEGER NOT NULL,
  addressed_json TEXT NOT NULL DEFAULT '{}',
  cosmetic_ratio REAL,
  meaningful INTEGER NOT NULL DEFAULT 0 CHECK (meaningful IN (0, 1)),
  summary TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rewrite_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (original_pad_id) REFERENCES native_pads(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_implementation_scores_student ON implementation_scores(student_id);
