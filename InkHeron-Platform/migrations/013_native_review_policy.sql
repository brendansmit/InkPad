ALTER TABLE native_pads ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE native_pad_revisions ADD COLUMN document_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS native_pad_policies (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL UNIQUE,
  paste_mode TEXT NOT NULL DEFAULT 'log' CHECK (paste_mode IN ('allow', 'log', 'block')),
  spellcheck_enabled INTEGER NOT NULL DEFAULT 1 CHECK (spellcheck_enabled IN (0, 1)),
  updated_by_teacher_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS native_annotations (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  teacher_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('general_comment', 'inline_comment', 'literacy_code', 'highlight')),
  start_offset INTEGER,
  end_offset INTEGER,
  selected_text TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  document_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    type = 'general_comment'
    OR (start_offset IS NOT NULL AND end_offset IS NOT NULL AND start_offset >= 0 AND end_offset > start_offset)
  ),
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS native_teacher_events (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  teacher_id INTEGER,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_native_annotations_pad_id ON native_annotations(native_pad_id);
CREATE INDEX IF NOT EXISTS idx_native_annotations_type ON native_annotations(type);
CREATE INDEX IF NOT EXISTS idx_native_teacher_events_pad_id ON native_teacher_events(native_pad_id);
