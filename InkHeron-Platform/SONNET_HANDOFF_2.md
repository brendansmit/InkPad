# SONNET_HANDOFF_2.md — dashboard scores bug, tone pass, gradebook export

You are Sonnet. Branch `analysis-ai`. Read CLAUDE.md first (fixed contract,
especially §8.1), then the conventions in SONNET_HANDOFF.md (rules 1-10:
injectable chat, never throw, Node 24 tests, explicit git paths, the 4 known
baseline failures). Production deploys are rsync/scp to
/opt/inkheron-platform on the droplet — do NOT deploy; the teacher's Fable
session handles deploys. Commit each item separately, log in SESSION_NOTES.md.

## 1. BUG (do first): marking is invisible on the assignment dashboard

Symptom: teacher clicks rubric scores and Finish marking on
/teacher/native-review; nothing changes on the assignment dashboard, no
score appears.

Diagnosis (verified): scores DO save (`PUT /api/native/pads/:padId/
rubric-scores` per click) and finish-marking DOES set pad state. But
`fetchDashboardRows` in src/routes/assignments.js only selects pad state and
paste aggregates; it never joins `native_rubric_scores`. Check
`publicDashboardRow` in the same file: its status/score/grade_state mapping
still reflects the legacy flow.

Fix:
- Join per-pad rubric totals into fetchDashboardRows: internal total
  (SUM of selected_score for rubric_kind='internal') and exam total, plus
  the criteria-count so the UI can show "12 / 15".
- publicDashboardRow: map native states properly (writing / submitted /
  marked / green_pen_open / resubmitted), expose `score` (internal total,
  null until any score exists), `score_max` (sum of per-criterion max band),
  `exam_score` similarly, and grade_state 'released' once state is marked or
  later (feedback becomes visible to the student at finish-marking) else
  'held'.
- Update `GET /api/assignments/:id/export.csv` to carry the same numbers.
- assignments.html renders row.score already; make sure the new fields show
  (score as "12 / 15", exam score column only for AP Lang classes).
- Tests: score a pad via the API, finish-marking, assert dashboard row shows
  status marked/green_pen_open with the right totals; unscored pad shows '-'.

## 2. Tone pass on generated feedback (student-facing copy)

Teacher feedback: suggested strengths/targets read too stiff and formal.
Wanted: conversational, warm, direct "you", contractions fine, low C1.
- src/services/feedbackSuggester.js DOER prompt: replace the copy-rules line
  with: write like a friendly teacher talking to the student, not a report.
  Use "you", contractions and short sentences. Low C1 level. Still NO em
  dashes, NO en dashes, NO Oxford commas, metric only. Titles stay short
  (3-6 words). Example pair to include in the prompt:
  stiff: "Improve verb tense consistency" / "The essay demonstrates
  inconsistent temporal marking."
  wanted: "Keep your tenses steady" / "You start in the past then jump to
  the present in the same sentence. Pick the time frame first, then keep
  every verb in it."
- Same tone instruction in src/services/profileSummarizer.js for
  writing_summary, voice_summary and targets.
- Do not touch the literacy CODE labels (those stay as the teacher's codes).

## 3. One-click export to the admin gradebook

The teacher runs a grade app at https://admin.inkheron.app (source lives in
the sibling repo folder `../grade-importer/`, a Python app; see its
SESSION_NOTES / code for the API: it has an /api/settings sync-key mechanism
and score/assignment endpoints — READ THE CODE FIRST and match its real API,
do not guess).
- Settings: add `admin_export_url` (default https://admin.inkheron.app) and
  `admin_export_key` to the teacher settings screen + settings store
  (masked like the other keys, server-side only, CLAUDE.md §3.8).
- New endpoint `POST /api/assignments/:id/export-to-admin` (teacher, CSRF):
  builds {class name, assignment title, [{student display_name, username,
  score, score_max}]} from the SAME dashboard rows as item 1, excludes
  is_demo/is_ghost students, and POSTs to the admin app with the key.
  Returns {exported: N} or a clean upstream error message. Never throws.
- HARD RULE: the payload contains ONLY names and numbers. No AI wording, no
  codes, no model names, nothing about how marking happened. Same rule for
  the CSV export.
- Tests with a fake fetchImpl: payload shape, ghost exclusion, upstream 401
  surfaces as a friendly error.

## 4. AI-mention audit (student-facing)

Grep every student-facing surface (native-feedback.html, nativeWrite.js gp
panel, student profile "student version", login/dashboard pages) plus the
CSV/admin exports for "AI", "model", "checker", "suggestion" wording visible
to students. Students must never see that a machine was involved: marks are
"your teacher's marks", suggestions language is teacher voice. Fix any hits;
list what you changed in SESSION_NOTES.

Definition of done: all four items, tests green except the known 4,
committed separately, logged.
