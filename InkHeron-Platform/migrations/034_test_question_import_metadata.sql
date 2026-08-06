ALTER TABLE test_questions ADD COLUMN import_source_text TEXT NOT NULL DEFAULT '';
ALTER TABLE test_questions ADD COLUMN import_source_excerpt TEXT NOT NULL DEFAULT '';
ALTER TABLE test_questions ADD COLUMN answer_source TEXT NOT NULL DEFAULT '';
ALTER TABLE test_questions ADD COLUMN import_confidence TEXT NOT NULL DEFAULT '';
ALTER TABLE test_questions ADD COLUMN duplicate_of_question_id INTEGER REFERENCES test_questions(id);

CREATE INDEX IF NOT EXISTS idx_test_questions_duplicate ON test_questions(duplicate_of_question_id);
