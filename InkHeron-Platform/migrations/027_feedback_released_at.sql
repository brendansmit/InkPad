-- Batch feedback release: assignments with settings_json.feedback_release =
-- 'batch' hold student-facing feedback and green-pen rewrite access until the
-- teacher explicitly releases them (POST /api/assignments/:id/release-feedback).
-- NULL means "not released yet"; immediate-mode assignments never set this.
ALTER TABLE assignments ADD COLUMN feedback_released_at TEXT;
