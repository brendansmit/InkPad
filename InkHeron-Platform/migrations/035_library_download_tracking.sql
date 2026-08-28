-- Distinguishes a view-log row that came from opening a document from one
-- that came from clicking Download, so admin analytics can show both a
-- student's read time AND whether they downloaded a document instead of
-- reading it (a student can read 15s then download, or download without
-- ever properly opening it in the viewer).
ALTER TABLE eap_library_view_log ADD COLUMN event_type TEXT NOT NULL DEFAULT 'view';

CREATE INDEX IF NOT EXISTS idx_eap_library_view_log_event_type ON eap_library_view_log(doc_id, event_type);
