-- Genre-aware voice profile: the fingerprint must know which of the AP Lang
-- task types it came from (synthesis, rhetorical_analysis, argument and the
-- non-AP types), because each demands a different voice and the numbers only
-- compare fairly within a type. Backfilled from the assignment settings.
ALTER TABLE style_metrics ADD COLUMN essay_type TEXT NOT NULL DEFAULT 'other';

UPDATE style_metrics SET essay_type = COALESCE(
  (SELECT json_extract(a.settings_json, '$.essay_type') FROM assignments a WHERE a.id = style_metrics.assignment_id),
  'other'
);

CREATE INDEX IF NOT EXISTS idx_style_metrics_student_type ON style_metrics(student_id, essay_type, created_at);
