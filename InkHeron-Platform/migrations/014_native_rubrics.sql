CREATE TABLE IF NOT EXISTS assignment_rubric_criteria (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_rubric_bands (
  id INTEGER PRIMARY KEY,
  criterion_id INTEGER NOT NULL,
  score_value REAL NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  descriptor TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (criterion_id) REFERENCES assignment_rubric_criteria(id) ON DELETE CASCADE,
  CHECK (score_value >= 0),
  CHECK (score_value * 2 = CAST(score_value * 2 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS native_rubric_scores (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  criterion_id INTEGER NOT NULL,
  selected_score REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by_teacher_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id) REFERENCES assignment_rubric_criteria(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  UNIQUE (native_pad_id, criterion_id),
  CHECK (selected_score >= 0),
  CHECK (selected_score * 2 = CAST(selected_score * 2 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_assignment_rubric_criteria_assignment ON assignment_rubric_criteria(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_rubric_bands_criterion ON assignment_rubric_bands(criterion_id);
CREATE INDEX IF NOT EXISTS idx_native_rubric_scores_pad ON native_rubric_scores(native_pad_id);
