ALTER TABLE assignment_rubric_criteria
ADD COLUMN rubric_kind TEXT NOT NULL DEFAULT 'internal';

CREATE INDEX IF NOT EXISTS idx_assignment_rubric_criteria_kind
ON assignment_rubric_criteria(assignment_id, rubric_kind);
