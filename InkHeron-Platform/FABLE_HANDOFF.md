# FABLE_HANDOFF.md — the analysis backend AI layer + review redesign

You are Fable. The plumbing is done. Your job is the parts that need strong
reasoning: the AI analysis logic (phases B, C, D) and the teacher review
window redesign. Everything below is the exact contract so you never have to
rediscover context. Read CLAUDE.md first (it is the fixed contract), then this.

## Ground rules (do not violate)
- **Native only.** Etherpad is gone. The writing surface is the native pad.
  The 8 legacy tables (pads, submissions, grades, etc.) are INERT. Never read
  or write them.
- **AI suggestions are hidden until a teacher accepts them.** Literacy findings
  go to `ai_literacy_suggestions` (status pending), never straight to marks.
  Grade estimates go to `ai_grade_estimates` and stay hidden from the teacher
  so they cannot anchor marking. This is a hard product requirement.
- **Doer + Checker (CLAUDE.md §8).** Heavy extraction uses a capable model
  (Doer, e.g. `anthropic claude haiku` intent). A DIFFERENT, cheaper family
  validates it (Checker, e.g. `google gemini flash` or `deepseek`). The Checker
  only flags; it never rewrites.
- **Demo and ghost accounts are statistically invisible** (CLAUDE.md §3.1). Any
  aggregate must exclude `is_demo=1 OR is_ghost=1` via `src/db/realStudents.js`.
- **Student-facing copy:** high B1 to low C1, no em dashes, no en dashes, no
  Oxford commas. Metric units only.
- Never throw from a background analysis function; log and return. A missing
  `openrouter_api_key` must be a clean no-op (tests run without a key).

## Environment
- Node 24 required (`node:sqlite`). The shell default may be Node 20; use
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` before `npm test`.
- Tests: `npm test`. Pre-existing baseline failures unrelated to this work, do
  not treat as regressions: EAP library admin upload, student login timing,
  classes CRUD, roster page teacher-only. Everything else must stay green.
- This repo's git root is the parent `Claude/` folder, not this directory.
  NEVER `git add -A`; stage explicit `InkHeron-Platform/...` paths only.
- The foundation is merged to `main`. Branch fresh off `main` for your work
  (e.g. `analysis-ai`). Commit in small checkpoints, log each in SESSION_NOTES.md.
- The analysis schema (migrations 019-024) and seams already exist on `main`.
  Run `npm test` first to confirm a green baseline before you change anything.

## How to call a model
`src/services/openRouter.js` → `callChat(db, { intent, messages, maxTokens,
temperature })`. `intent` is a fuzzy family+tier string resolved against the
live model list and cached; never hardcode a model id. Key is read server-side
from the `openrouter_api_key` setting. Returns the raw OpenRouter JSON; read
`result.choices[0].message.content`.

---

## Phase B — Literacy coder (accuracy is everything)

**Files:** `src/services/literacyCoder.js` (Doer, has the reusable
`SYSTEM_PROMPT`, `VALID_CODES`, `parseLiteracyResponse`, `findQuoteSpan`,
`codeCategory`), `src/services/checker.js` (Checker).

**`runLiteracyAnalysis(db, { padId })`** — fill the stub:
1. Read `native_pads.plain_text` and `.version` for `padId`.
2. Split into paragraphs. For each, Doer `callChat` with `intent:'anthropic
   claude haiku'`, system=`SYSTEM_PROMPT`, user=the paragraph. Parse with
   `parseLiteracyResponse`, locate each quote with `findQuoteSpan` to get
   absolute offsets into `plain_text`.
3. Pass all findings through `verifyFindings(db, { padPlainText, findings })`
   (Checker, different family). Drop any where `checker.verbatim === false`.
4. Delete prior `status='pending'` rows for the pad, then insert one row per
   surviving finding into `ai_literacy_suggestions` (native_pad_id,
   document_version, start_offset, end_offset, quote, code,
   category=`codeCategory(code)`, label, model, checker_json, status='pending').
5. Return `{ status:'ok', written:N }`.

Already wired: `runLiteracyAnalysis` fires in the background on student submit.
The teacher accept/reject endpoints and profile promotion already exist.

**`verifyFindings(db, { padPlainText, findings })`** — Checker. For each finding
confirm the quote appears verbatim in `padPlainText` and the code is defensible.
Return findings each with `checker:{ verbatim, confidence, flag }`.

---

## Phase C — Profile summariser

**File:** `src/services/profileSummarizer.js`.
**`generateProfileSummary(db, { studentId })`** — read
`student_literacy_issue_stats`, `student_literacy_evidence`,
`native_feedback_items` (targets) and `score_snapshots` for the student. Doer +
Checker produce a recurring-issues summary, a voice/style summary, and a
prioritised target list. Then `UPDATE student_writing_profiles SET
writing_summary, voice_summary, targets_json WHERE student_id`. `targets_json`
is a JSON array of `{title, explanation}`. Decide the trigger (suggest: after
finish-marking, or a nightly/on-demand teacher action) and wire it.

---

## Phase D2 — Green-pen implementation scoring (the moat)

**File:** `src/services/implementationScorer.js`.
**`scoreRewrite(db, { rewritePadId })`** — read the rewrite pad's `plain_text`
and its `rewrite_of_pad_id`; read the original pad's `plain_text`, its
`native_annotations` (literacy_code + inline_comment) and `native_feedback_items`
(targets). Use a deterministic text diff plus an AI judgement to decide, per
code / per target / per inline comment, whether it was addressed, and whether
the revision was meaningful or cosmetic. Upsert one row into
`implementation_scores` by `rewrite_pad_id` (addressed_json, cosmetic_ratio 0..1,
meaningful 0/1, summary, model). Already wired: fires in the background when a
rewrite pad (one with `rewrite_of_pad_id`) is resubmitted.

---

## Phase D3 — Marker-preference estimate

**File:** `src/services/markerProfile.js`. The deterministic half
(`recordTeacherScores`, fills teacher_score+delta) is DONE and wired into
rubric-score saving. You fill **`estimateRubric(db, { padId })`**: read the pad
text and the assignment's rubric criteria/bands per rubric_kind, Doer + Checker
estimate a score per criterion, clear prior estimate rows for the pad, insert
one row per (pad, rubric_kind, criterion) into `ai_grade_estimates` with
ai_score, model, rationale (teacher_score/delta left NULL). Already wired: fires
in the background on submit, before the teacher marks. The deltas then build the
marker profile. A teacher-facing "how you mark vs the model" view is optional
follow-up (keep it hidden during active marking).

---

## Review window redesign (teacher)

**File:** `public/teacher/native-review.html`. The teacher dislikes the current
design and wants it cleaner, smoother and more intuitive. This is a genuine
redesign, not a tweak. Constraints and the data you have to work with:

- Self-host every asset (CLAUDE.md §3.2). No CDNs, no Google Fonts links. Reuse
  the existing design tokens / CSS variables already in `public/assets`.
- Data source: `GET /api/native/pads/:padId/review` now returns, among the
  existing fields: `feedback:{strengths:[],targets:[]}` (structured items),
  `suggestions:[]` (hidden AI literacy findings pending teacher accept),
  `annotations`, `comparison`, three rubrics with scores, and `student_profile`.
- New endpoints to wire into the UI:
  - `POST/GET/DELETE /api/native/pads/:padId/feedback-items` (strengths/targets)
  - `GET /api/native/pads/:padId/suggestions?status=pending`
  - `POST /api/native/pads/:padId/suggestions/:id/accept` and `/reject`
- The suggestions panel is the new centrepiece: show pending AI literacy
  findings unobtrusively (they must not look like confirmed marks), each with a
  one-click accept (promotes to a real mark) or reject.
- Honour the phase-7 three-way feedback model (see `phase-7-greenpen.md`): inline
  grammar codes reveal CATEGORY ONLY on hover never the fix, targets are
  coaching that expands with a "Try now" prompt, strengths expand to an
  explanation.
- The AI grade estimate must NOT be shown during marking (anchoring). It stays
  hidden.
- Verify with the preview tools and share a screenshot; do not ask the teacher
  to eyeball it blind.

## Definition of done for your work
Each phase: real model calls behind the seams, hidden-suggestion flow intact,
tests added, `npm test` green except the known baseline failures, committed in
small checkpoints, logged in SESSION_NOTES.md.
