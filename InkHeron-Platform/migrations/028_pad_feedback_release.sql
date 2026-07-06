-- Per-student feedback release. In batch mode the whole class opens when the
-- assignment's feedback_released_at is stamped; this column lets the teacher
-- send feedback to ONE student early (release-feedback on the pad).
ALTER TABLE native_pads ADD COLUMN feedback_released_at TEXT;
