-- Hidden holding area for AI-suggested strengths and targets.
--
-- suggestFeedbackItems (src/services/feedbackSuggester.js) triangulates the
-- assignment prompt, the essay, the rubric bands and the student's recurring
-- literacy issues to propose 2-3 strengths and 3-5 targets. These do NOT
-- auto-apply: the teacher picks. Accepting one inserts a real
-- native_feedback_items row (source 'ai') and links it here.
--
-- status: 'pending'  = awaiting teacher review
--         'accepted' = promoted to a native_feedback_items row (feedback_item_id set)
--         'rejected' = dismissed by the teacher
--
-- checker_json holds the second-model (Checker) verdict per CLAUDE.md §8:
-- e.g. {"supported": true, "confidence": 0.9}.
CREATE TABLE IF NOT EXISTS ai_feedback_item_suggestions (
  id INTEGER PRIMARY KEY,
  native_pad_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('strength', 'target')),
  title TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  try_now_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  checker_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  feedback_item_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (native_pad_id) REFERENCES native_pads(id) ON DELETE CASCADE,
  FOREIGN KEY (feedback_item_id) REFERENCES native_feedback_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_item_suggestions_pad ON ai_feedback_item_suggestions(native_pad_id, status);
