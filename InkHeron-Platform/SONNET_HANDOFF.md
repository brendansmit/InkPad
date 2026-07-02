# SONNET_HANDOFF.md — phases C, D3 and small backend seams

You are Sonnet. Fable has built phases B (literacy coder with auto-accept),
D2 (implementation scorer) and the stylometric voice layer
(src/services/styleMetrics.js) on branch `analysis-ai`. Your job is phases C
and D3 plus three small backend items. The pattern is fully established.
Copy it, do not invent. Read CLAUDE.md §8.1 first: literacy codes are
formative for L2 learners, NOT grading factors; confident findings auto-apply
as marks; the AI grade estimate stays hidden during marking.

Read first: `CLAUDE.md` (fixed contract), `FABLE_HANDOFF.md` (phase specs),
then the two finished reference implementations:

- `src/services/literacyCoder.js` + `test/literacyCoder.test.js` — the pattern
  for Doer calls, response parsing, injectable `chat` dependency, clean no-op
  on errors, delete-then-insert in a transaction.
- `src/services/implementationScorer.js` + `test/implementationScorer.test.js`
  — the pattern for upserts and for seeding pads/annotations in tests.

## Non-negotiable conventions (established in B and D2)

1. Every service function takes an optional third param `{ chat = callChat }`
   so tests inject a fake model. Never call the network in tests.
2. Never throw from a service: wrap the whole body in try/catch,
   `console.warn('[serviceName]', error?.message ?? error)`, return
   `{ status: 'error' }`. A missing `openrouter_api_key` is a clean no-op.
3. Doer intent: `'anthropic claude haiku'`. Checker intent:
   `'google gemini flash'` (different family on purpose, CLAUDE.md §8).
   Never hardcode a model id. Read the resolved model from `result.model`.
4. Parse model output defensively: strip `<think>` blocks and ``` fences,
   find the outermost JSON, return null/[] on garbage (see `parseJudgement`
   in implementationScorer.js and `parseLiteracyResponse` in literacyCoder.js).
5. Prompts: temperature 0. Output contract stated as "Return ONLY JSON".
6. Any student-facing or teacher-facing generated copy: high B1 to low C1,
   no em dashes, no en dashes, no Oxford commas, metric units only. Put this
   instruction INSIDE the system prompt (see JUDGE_SYSTEM_PROMPT for wording).
7. Tests: node test runner, `buildApp({ db, logger: false })` with a db handle
   you opened via `openDatabase(tmpDb())` so you can assert on rows directly.
   Copy the `seedPads`/`seedPad` helpers from the reference tests.
8. Tests must cover: happy path row content, re-run idempotency (clear or
   upsert, no duplicates), model failure writes nothing and returns
   `{status:'error'}`, and empty-input skip without calling the model.
9. Run `npm test` with Node 24
   (`export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`). Green means
   only these 4 known baseline failures: EAP library admin upload, student
   login timing, classes CRUD, roster page teacher-only.
10. Git root is the parent `Claude/` folder. NEVER `git add -A`; stage explicit
    paths. Commit each phase separately. Log each in
    `InkHeron-Platform/SESSION_NOTES.md`.

## Phase C — `generateProfileSummary` in `src/services/profileSummarizer.js`

Reads for the student: `student_literacy_issue_stats` (code frequencies),
`student_literacy_evidence` (example quotes), `native_feedback_items` where
kind='target' across their pads, `score_snapshots` (score trajectory), AND
`aggregateStyleProfile(db, { studentId })` from styleMetrics.js (per-feature
mean, spread, trend). If there is no evidence at all, return
`{ status: 'skipped' }` without a call.

The voice_summary MUST be grounded in the stylometric numbers: include the
aggregate features in the Doer prompt and instruct it to describe only
patterns the numbers show (e.g. long flowing sentences with heavy
coordination, I-heavy personal register, few transitions). No vibes.

One Doer call with all evidence in the user message. Ask for JSON:
`{"writing_summary": "...", "voice_summary": "...", "targets": [{"title": "...", "explanation": "..."}]}`
writing_summary = recurring technical issues (2 to 4 sentences).
voice_summary = style and voice patterns (2 to 3 sentences).
targets = at most 4, prioritised, exam-focused coaching.

One Checker call (gemini flash) confirming every claim in the summaries is
supported by the supplied evidence; it returns per-field
`{supported: bool, confidence: 0..1}`. If the Checker says a field is
unsupported with confidence >= 0.8, drop to the fallback for that field
(empty string) rather than publishing an unsupported claim. Checker failure
(no key) is non-fatal: keep the Doer output, log a warning.

Write: `UPDATE student_writing_profiles SET writing_summary = ?,
voice_summary = ?, targets_json = ? WHERE student_id = ?`. If no profile row
exists yet, INSERT one (check the table shape in
`migrations/015_student_writing_profiles.sql` first).

Trigger (decided by Fable, implement exactly this): call it in the background
from the finish-marking endpoint (`POST /api/native/pads/:padId/finish-marking`
in `src/routes/nativePads.js`) using the existing `runInBackground` helper,
with the pad's student_id. Finish-marking is when new evidence lands, so the
profile stays fresh without a scheduler.

## Phase D3 — `estimateRubric` in `src/services/markerProfile.js`

The deterministic half (`recordTeacherScores`) is DONE — do not touch it.

Fill `estimateRubric(db, { padId }, { chat = callChat })`:
1. Read the pad's `plain_text`, `student_id`, `assignment_id`. Empty text →
   `{ status: 'skipped' }`.
2. Read rubric criteria + bands for the assignment
   (`assignment_rubric_criteria` joined with `assignment_rubric_bands`),
   grouped by `rubric_kind`. No criteria → `{ status: 'skipped' }`.
3. Per rubric_kind, one Doer call: system prompt says "score strictly against
   the bands given, return ONLY JSON
   `[{"criterion_id": n, "score": n, "rationale": "one sentence"}]`";
   user message contains the essay text plus each criterion with its band
   descriptors and score range.
4. Checker (gemini flash) verifies each score is inside the criterion's valid
   band range and the rationale references the essay. Out-of-range scores are
   clamped? NO — drop that criterion's estimate (an invalid score poisons the
   delta data). Checker failure is non-fatal, keep Doer output.
5. Delete prior rows for the pad, then insert one row per surviving
   (rubric_kind, criterion) into `ai_grade_estimates` with ai_score, model,
   rationale. `teacher_score` and `delta` stay NULL — `recordTeacherScores`
   fills them later. Wrap delete+insert in BEGIN/COMMIT like literacyCoder.
6. Return `{ status: 'ok' }`.

Already wired: `estimateRubric` fires in the background on submit
(`src/routes/nativePads.js` line ~1069). Do not add UI. The estimate must
never appear in any teacher-facing response during marking (anchoring rule,
CLAUDE.md and FABLE_HANDOFF).

Deterministic guard even without the Checker: reject any score that is not a
finite number inside the criterion's min/max band score.

D3 prompt requirement (CLAUDE.md §8.1): tell the model explicitly that
grammar, spelling and punctuation are NOT grading factors for these L2
learners — they only lower a criterion score when errors destroy meaning.
Score ideas, organisation and task fulfilment as the rubric bands describe.

## New seam — strengths/targets suggester

`src/services/feedbackSuggester.js`, `suggestFeedbackItems(db, { padId })`.
Triangulate: the assignment prompt/instructions (check where the assignment
stores its prompt — settings_json or the passage/prompt fields used by the
write view), the essay `plain_text`, the rubric criteria + band descriptors,
and the student's recurring issues (`student_literacy_issue_stats`). One Doer
call returns ONLY JSON:
`{"strengths":[{"title","explanation"}],"targets":[{"title","explanation","try_now_prompt"}]}`
with 2 to 3 strengths and 3 to 5 targets, each tied to what the rubric
expected versus what the essay did. Checker (gemini flash) verifies each item
is supported by the essay; drop unsupported items at confidence >= 0.8.
Student-facing copy rules apply (B1-C1, no em/en dashes, no Oxford commas).

Storage: migration 026 creates `ai_feedback_item_suggestions`
(id, native_pad_id, kind CHECK strength/target, title, explanation,
try_now_prompt, model, checker_json, status pending/accepted/rejected,
feedback_item_id nullable FK, created_at, resolved_at). These do NOT
auto-apply — the teacher picks. Endpoints (teacher, CSRF):
- `GET /api/native/pads/:padId/feedback-suggestions?status=pending`
- `POST .../feedback-suggestions/:id/accept` → inserts a real
  native_feedback_items row (source 'ai'), links it, marks accepted
- `POST .../feedback-suggestions/:id/reject`
Wire `suggestFeedbackItems` into the submit background chain in
nativePads.js next to the other runInBackground calls.

## New endpoint — student target tick-off

Migration 025 added `student_checked` and `student_checked_at` to
`native_feedback_items`. Add
`POST /api/native/pads/:padId/feedback-items/:itemId/toggle-check`
(student session, own pad only, only when the pad state allows green pen
work) flipping student_checked and stamping the time. Include
student_checked in the payloads the student feedback view and teacher
review endpoint already return. Tests for auth (another student gets 404),
toggle both ways, and appearance in both payloads.

## New settings fields — essay type and supervision (no migration needed)

`assignments.settings_json` gains two optional fields, both set in the
assignment create/edit UI (add the two selects to the existing form):
- `essay_type`: 'narrative' | 'argumentative' | 'personal' | 'analysis' |
  'short_response' | 'rhetorical_analysis' | 'synthesis' | 'other'
- `supervision`: 'in_class' (teacher watched the whole write) | 'mixed'
  (started in class, finished at home) | 'homework' (unverified)
Defaults when absent: essay_type 'other', supervision 'in_class'. Expose
both in the review payload and the writing-profile endpoint (see
OPUS_HANDOFF). They contextualise every profile number: anomaly detection
and per-genre AP profiles depend on them.

## Normalization rule (applies to phases C and the profile endpoint)

Never present raw error counts across essays without the per-100-words rate
(evidence count / pad word_count * 100). Essays range from 200 to 700+
words; raw counts mislead. Phase C prompts must receive rates, not counts.

## Definition of done

Both services implemented, tests added following rule 8, `npm test` green
except the 4 known failures, two commits on `analysis-ai`, SESSION_NOTES.md
updated with a dated entry per phase.
