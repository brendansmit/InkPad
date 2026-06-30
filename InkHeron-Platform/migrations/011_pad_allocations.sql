CREATE TABLE IF NOT EXISTS pad_allocations (
  pad_suffix TEXT PRIMARY KEY CHECK (pad_suffix GLOB '[A-Z][0-9][0-9][0-9][0-9]'),
  etherpad_pad_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
