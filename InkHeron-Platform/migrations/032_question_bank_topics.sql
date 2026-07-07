ALTER TABLE test_questions ADD COLUMN topic TEXT NOT NULL DEFAULT '';
ALTER TABLE test_questions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE test_questions ADD COLUMN origin_assignment_id INTEGER REFERENCES assignments(id);

CREATE INDEX IF NOT EXISTS idx_test_questions_topic ON test_questions(topic);
CREATE INDEX IF NOT EXISTS idx_test_questions_origin_assignment ON test_questions(origin_assignment_id);
