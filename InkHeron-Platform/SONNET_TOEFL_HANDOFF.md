# SONNET_TOEFL_HANDOFF.md — teacher-only TOEFL writing estimate

Same rules as CODEX_TESTPORTAL_HANDOFF.md §Ground rules (read it first, all
nine apply). Read CLAUDE.md as the fixed contract. Branch `toefl-estimate`
off the current `test-greenpen` tip. Suite is 168/168 on Node 24
(export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH") and must stay
fully green. Do not deploy — deploys are Fable-only. Never `git add -A`
(the git root is the parent Claude/ dir). Log a dated entry at the top of
SESSION_NOTES.md when done.

## Goal

A small area ONLY for the teacher that estimates what a student's TOEFL
writing score might be, from the evidence InkHeron already holds. It is
directional coaching intelligence for the teacher, never a promise and
never visible to students.

## The hard wall (rule zero for this feature)

Nothing about TOEFL estimates may ever reach a student-facing payload,
page, or push. Same wall as the AP grade estimates (ai_grade_estimates:
follow how those are kept out of student routes). Teacher session required
on every route. Grep any payload you touch before you finish.

## Build

1. Migration 031_toefl_estimates.sql, registered in test/migration.test.js:
   toefl_estimates — id, student_id (FK students ON DELETE CASCADE),
   integrated_band REAL, discussion_band REAL, scaled_low INTEGER,
   scaled_high INTEGER, confidence REAL, rationale TEXT,
   evidence_json TEXT, model TEXT, created_at. Keep history (no UNIQUE on
   student_id; newest row wins for display).
   Also: known_toefl_scores — id, student_id, writing_score INTEGER
   (0-30), noted_at TEXT, created_at. Teacher-entered real scores, used to
   anchor future estimates.
2. Service src/services/toeflEstimator.js, modelled line-for-line on the
   Doer/Checker pattern in profileSummarizer.js (readDoerIntent, Gemini
   Flash checker, parse-salvage, checker can only blank fields, never
   rewrite). Evidence: rubric score trajectory, literacy issue rates per
   100 words, aggregateStyleProfile output (overall + by_essay_type),
   word counts, and any known_toefl_scores rows for the CLASS (anchors:
   "a student with these numbers scored X"). Doer returns ONLY JSON:
   {"integrated_band": 0-5, "discussion_band": 0-5, "scaled_low": 0-30,
   "scaled_high": 0-30, "confidence": 0-1, "rationale": "2 to 4 sentences
   grounded in the evidence"}. TOEFL iBT writing = two tasks (Integrated,
   Writing for an Academic Discussion), each banded 0-5, reported scaled
   0-30. The output is a RANGE, never a single number. Rationale must cite
   the evidence (e.g. issue rates, MATTR, sentence control), not vibes.
   Skip cleanly when the student has fewer than 2 essays with style data.
3. Routes in a new src/routes/toefl.js (additive, registered in app.js):
   POST /api/teacher/students/:studentId/toefl-estimate (generate + store),
   GET  /api/teacher/students/:studentId/toefl-estimate (latest + history),
   POST /api/teacher/students/:studentId/toefl-known-score {writing_score}.
   All requireTeacherSession, POSTs requireCsrfToken, 404 on unknown
   student. Demo/ghost students may have estimates but any class-level
   aggregate view must exclude them via src/db/realStudents.js.
4. UI: a "TOEFL estimate (teacher only)" card on the teacher's student
   profile page (public/teacher/ — find where the writing profile renders
   and add alongside, reuse existing design tokens, no redesign). Shows
   latest range "Writing 20-24 (bands: Integrated ~3.5, Discussion ~4)",
   confidence, rationale, a Generate/Refresh button, an input to record a
   real TOEFL writing score, and this fixed disclaimer text: "Estimate
   only. Not calibrated against ETS scoring. Use as a rough signal, not a
   prediction." No student-side changes of any kind.
5. Tests: migration registration; route auth (401 without teacher
   session); estimator with a mocked chat (shape, range ordering
   scaled_low <= scaled_high, checker blanking on unsupported); the wall
   (student profile/feedback payloads contain no "toefl" key — add an
   assertion to an existing student-payload test); known-score insert and
   its inclusion in evidence.

## Style

Teacher-facing copy, so the B1-C1 constraint does not bind, but keep the
house style: no em dashes, no en dashes, no Oxford commas, metric only.
