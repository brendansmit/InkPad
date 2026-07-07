# CODEX_TESTPORTAL_HANDOFF.md — build the Test Portal (MVP)

You are building inside an existing production classroom platform. Read
CLAUDE.md in this directory FIRST and treat it as law, then TEST_PORTAL_SPEC.md,
then this file. Work on a NEW branch `test-portal` created from `analysis-ai`.

## Ground rules (violating any of these fails review)

1. The git root is the PARENT folder (Claude/), not this directory. NEVER
   `git add -A` or `git add .` — stage explicit `InkHeron-Platform/...` paths.
2. ADDITIVE ONLY. Do not modify existing tables, existing services in
   src/services/, the native pad editor (src/views/nativeWrite.js) or the AI
   marking pipeline. New migrations start at 029 and must be registered in
   the canon lists in test/migration.test.js. The two allowed touch points
   in existing files are listed in §Integration.
3. Stack is fixed: Fastify + node:sqlite (Node 24), plain HTML/CSS/JS pages
   in public/, no frameworks, no CDNs, no external fonts or scripts. Copy
   the structure of an existing route file (src/routes/assignments.js) and
   an existing page (public/teacher/assignments.html) for conventions.
4. Auth: every teacher route uses
   `{ preValidation: [app.requireTeacherSession, app.requireCsrfToken] }`
   (GETs may omit CSRF), every student route `app.requireStudentSession`.
   Students may only ever read/write their own rows.
5. SECURITY, the one that matters most: answer keys, correctness flags and
   per-question points-awarded must NEVER appear in any response to a
   student before their attempt is submitted AND results are released.
   Write a test proving the take-test payload contains no answer data.
6. Any aggregate/statistic excludes demo and ghost students via
   `realStudentsWhere` from src/db/realStudents.js.
7. Student-facing copy: high B1 to low C1 English, no em dashes, no en
   dashes, no Oxford commas, metric units. Students never see the word AI.
8. Tests: node:test + buildApp({ db }) + app.inject, like every existing
   test file. `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`
   then `npm test`. The suite is currently 152/152 green and must STAY
   fully green plus your new tests.
9. Do NOT deploy anywhere. Commit in small steps with clear messages and
   log each session in SESSION_NOTES.md (newest entry on top).

## What to build (MVP)

### Data (migration 029, one file)

- `test_questions` — the teacher's reusable bank:
  id, kind CHECK ('mcq','srq','frq'), prompt_text, options_json (MCQ: array
  of option strings), answer_index (MCQ: correct option index, NULL others),
  model_answer (SRQ guidance for the teacher, NULL others), points REAL
  NOT NULL DEFAULT 1, tag TEXT DEFAULT '', is_archived 0/1, created_at,
  updated_at.
- `test_attempts` — one per student per test assignment:
  id, assignment_id, student_id, started_at, submitted_at,
  seconds_allowed INTEGER NULL, UNIQUE(assignment_id, student_id),
  FKs with ON DELETE CASCADE.
- `test_responses` — one per answered question:
  id, attempt_id FK CASCADE, question_id FK, answer_json (MCQ: chosen
  index; SRQ: text), is_correct NULL/0/1, points_awarded REAL NULL,
  updated_at, UNIQUE(attempt_id, question_id).
- `test_focus_events` — id, attempt_id FK CASCADE, at, kind ('blur'|'focus').

### How a test is defined

A test IS an assignment with type 'test' (the assignments table and §5
settings fields already support this). The structure lives in
settings_json.test: `{ sections: [{ kind, title, question_ids: [] }],
timer_minutes, shuffle, focus_warning }`. Pooling stays OFF (hard rule §5).
At most ONE FRQ section with ONE frq question in the MVP: the FRQ is
delivered through the existing native pad (see Integration), which is
UNIQUE per (student, assignment).

### Teacher pages + endpoints (namespace /api/tests/...)

- Question bank page /teacher/question-bank: list/filter by kind and tag,
  create/edit/archive questions (CRUD endpoints).
- Test builder inside the existing new-assignment flow OR a dedicated
  /teacher/new-test page (your choice, match the design tokens): pick
  questions per section, set timer/shuffle/focus_warning, assign to class.
  Creating it creates the assignment (type 'test') with settings_json.test.
- Test marking page /teacher/test-review?assignment_id=...:
  per student: MCQ auto-scored on submit (server-side), SRQ answers listed
  with a points input + saved per response, FRQ links to the EXISTING
  /teacher/native-review?pad_id=... page. A release-results action reuses
  the assignment feedback_released_at mechanism (POST
  /api/assignments/:id/release-feedback already exists — call it, do not
  reimplement).
- Totals appear per student: mcq points + srq points (+ FRQ rubric total if
  scored, read from native_rubric_scores).

### Student flow + endpoints

- Student dashboard already lists assignments; a type 'test' assignment
  links to /native/test/:assignmentId (new page).
- Start: POST /api/tests/:assignmentId/start creates the attempt (idempotent:
  returns the existing one), stamps started_at, computes seconds_allowed
  from timer_minutes.
- Take-test page: sections in order; MCQ options shuffled per student with
  a deterministic seed (student_id * 7919 + question_id) so reloads keep
  the same order; SRQ textareas autosave (PUT answer per question,
  debounced); FRQ section embeds a prominent link/button to the normal
  write view /native/write/:assignmentId (the pad IS the FRQ answer).
  Server rejects answer writes after submitted_at is set OR the timer has
  expired (compare server-side against started_at + seconds_allowed with a
  30 second grace) OR due_at has passed.
- Timer shown client-side counting down from server-provided remaining
  seconds. focus_warning true: page records blur/focus to
  POST /api/tests/:assignmentId/focus-event and shows the grace-then-firm
  warning copy on first and second blur (§5: grace then firm).
- Submit: POST /api/tests/:assignmentId/submit stamps submitted_at,
  auto-scores every MCQ response server-side, and ALSO submits the FRQ pad
  through the existing pad submit endpoint semantics (state 'submitted',
  exam behaviour terminal). After submit the student sees a "handed in"
  screen, and results only after the teacher releases.
- Results page for the student (after release): per-section points and
  total. Never show answer keys for MCQs they got wrong unless a
  settings_json.test.reveal_answers flag is true (default false).

### Integration (the ONLY allowed edits to existing files)

1. src/app.js: register the new routes file + the two new page routes,
   following the exact pattern of the existing lines.
2. public/student-dashboard.html + public/teacher/assignments.html: a
   'test' type assignment shows a "Test" pill and links to the new pages
   instead of the essay pages. Keep the diff minimal.
FRQ pads flow into the existing AI marking pipeline automatically because
submit fires the background analysis — do not touch that code; it just
works when the pad is submitted. Set the assignment settings so
essay_type reflects the FRQ genre and supervision 'in_class'.

### Definition of done

Every endpoint has tests (auth denied for wrong role/other student, happy
path, the §5 no-answer-leak test, timer rejection, MCQ auto-scoring,
deterministic shuffle, focus events, release gating). npm test fully green.
Pages verified rendering (server-rendered HTML string checks in tests are
acceptable; you may not have browser tooling). Committed in small steps on
branch `test-portal`, logged in SESSION_NOTES.md. A reviewer (Fable) will
audit against the numbered ground rules before anything merges or deploys.
