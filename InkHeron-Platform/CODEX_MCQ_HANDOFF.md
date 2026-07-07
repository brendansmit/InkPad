# CODEX_MCQ_HANDOFF.md — Test portal: bulk MCQ import, selection, sections, nav, settings

This is a self-contained build brief. Everything you need is here: file paths, table
names, endpoint patterns and the house conventions. Build it in the order below,
committing after each numbered part. Read `InkHeron-Platform/CLAUDE.md` first: it is the
fixed contract and it wins over anything here if they ever disagree.

## 0. Ground rules (do not violate)

- Stack: Node.js + Fastify, single service. SQLite via `node:sqlite` (tests need Node 24;
  local run is Node 20 which is fine for the app, but `npm test` must run on Node 24:
  `PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npm test`).
- Self-host everything. No CDNs, no external script tags, no Google Fonts. All assets are
  served from the droplet (`/assets/...`).
- Student-facing copy: no em dashes, no en dashes, no Oxford commas, plain B1-C1 English.
- Every teacher mutation route uses `{ preValidation: [app.requireTeacherSession, app.requireCsrfToken] }`.
  Read routes use `[app.requireTeacherSession]`. The client sends `X-CSRF-Token` from
  `/api/me`'s `user.csrf_token`.
- Demo/ghost accounts must never skew aggregates (not relevant to most of this work, but
  keep it in mind for any counts).
- Add a dated entry to `InkHeron-Platform/SESSION_NOTES.md` (newest at top) when done, and
  keep it under ~400 lines.
- CAUTION: `src/routes/tests.js`, `public/teacher/new-test.html` and
  `public/teacher/question-bank.html` are under active development by another workstream
  (recent commits: "Add test section passages and section shuffle", "test portal part 2").
  Pull latest before starting and re-read these files; the line references below may drift.

## 1. Current architecture (verified, so you do not rediscover it)

### Questions and tests
- One global table `test_questions` (migration `migrations/029_test_portal.sql`):
  `id, kind ('mcq'|'srq'|'frq'), prompt_text, options_json, answer_index, model_answer,
  points, tag (single TEXT), is_archived, created_at, updated_at`.
- Tests are a **type of assignment**: `assignments.type = 'test'`, with config living in
  `settings_json.test = { sections, timer_minutes, shuffle, focus_warning, reveal_answers }`.
- A **section** is `{ kind, title, passage_text, question_ids: [] }`. See `normalizeSections`
  and `buildTestSettings` in `src/routes/tests.js` (~line 199 and ~line 258). FRQ sections are
  capped at one question. `testConfig(assignment)` (~line 186) reads them back.
- Question CRUD + test endpoints are in `src/routes/tests.js`, registered by
  `registerTestRoutes(app, { db })`:
  - `GET  /api/tests/questions?kind=&tag=&archived=` -> `{ questions }` (uses `teacherQuestion(row)`)
  - `POST /api/tests/questions` (uses `normalizeQuestionInput`)
  - `PUT  /api/tests/questions/:id`
  - `POST /api/tests/questions/:id/archive`
  - `POST /api/tests/assignments` (creates the test assignment from `{ class_id, title, sections, ... }`)
  - review/take/submit routes follow.
- Helpers in that file you will reuse: `normalizeQuestionInput(body, existing)`,
  `teacherQuestion(row)`, `loadQuestion(db, id)`, `QUESTION_KINDS`, `TEST_SECTION_KINDS`,
  `requirePositiveInteger`, `parseSettings(assignment)`, `nowIso()`.

### Teacher pages
- `public/teacher/index.html` is the dashboard. Nav today: Classes -> `/teacher/students`,
  Students -> `/teacher/students` (SAME page, duplicate), Assignments -> `/teacher/assignments`,
  Feedback, Settings. No dedicated Test button; tests hide inside Assignments.
- `public/teacher/question-bank.html` (~110 lines): a one-at-a-time question form plus a list
  filtered by kind/tag. No bulk import, no multi-select, no shift-range, no topic.
- `public/teacher/new-test.html` (~67 lines): builds a test with MCQ/SRQ/FRQ sections, each
  with a passage textarea and a checkbox list of questions pulled from the bank.
- Page routes are registered in `src/app.js` with `reply.sendFile('teacher/<x>.html', publicDir)`
  behind `app.requireTeacherSession`. Add new pages the same way.

### AI plumbing
- `src/services/openRouter.js`: `callChat(db, { intent, messages, maxTokens, temperature })`.
  `intent` is a fuzzy family+tier string resolved against OpenRouter's live model list by
  `resolveModel(db, intent)` -> caches the concrete id, re-resolves on a 404. NEVER hardcode a
  concrete OpenRouter model id; always pass an intent.
- Doer intent is configurable: `readDoerIntent(db)` / `writeDoerIntent(db, value)` in
  `src/services/settingsStore.js` (default `'deepseek chat v3'`). Read at call sites
  `literacyCoder.js`, `profileSummarizer.js`, `feedbackSuggester.js`.
- Checker intent is HARDCODED as `const CHECKER_INTENT = 'google gemini flash'` in THREE files:
  `src/services/checker.js`, `src/services/profileSummarizer.js`, `src/services/feedbackSuggester.js`.
  The design rule (CLAUDE.md section 8) is the Checker must be a DIFFERENT family from the Doer.

### Grade-importer key
- The "admin gradebook export key" is a shared secret. InkHeron stores it as
  `admin_export_key` (set in Settings, `public/teacher/settings.html`, used by
  `src/services/adminExport.js`). The other side is the grade-importer app
  (`../grade-importer/`, `admin.inkheron.app`), which stores the SAME value as its `sync_key`
  (`grade-importer/app.py`, `db.get_setting('sync_key')`). The grade-importer Settings tab only
  shows it masked with a "set new" box, so there is no way to read the current value. Current
  value per session notes: `GwPVRUH4EhC2vSrxrmn7XYRgar28nVXWjLlprDv6ulk`.

---

## 2. Part A — schema (migration `032_question_bank_topics.sql`)

Create `migrations/032_question_bank_topics.sql`. Migrations must be idempotent and additive
(existing ones use `IF NOT EXISTS`; SQLite has no `ADD COLUMN IF NOT EXISTS`, so guard with a
runner check or use the project's existing migration style — check how 030/031 add columns and
copy that exact pattern).

Add to `test_questions`:
- `topic TEXT NOT NULL DEFAULT ''`  — AI-inferred subject/topic, used for filtering.
- `tags_json TEXT NOT NULL DEFAULT '[]'`  — multiple free tags (keep the legacy `tag` column
  working; when reading, merge `tag` into the tags list for display).
- `origin_assignment_id INTEGER`  — the quiz a question was first imported into (provenance,
  nullable, no hard FK needed but reference `assignments(id)` if the style allows).

Update `teacherQuestion(row)` to expose `topic`, `tags` (parsed from `tags_json`, falling back
to `[tag]` if empty) and `origin_assignment_id`. Update `normalizeQuestionInput` to accept
`topic` and `tags` (array, trimmed, deduped, max ~10, each <= 40 chars) and to write
`tags_json`. Keep writing `tag` = `tags[0] ?? ''` for backward compatibility.

Extend `GET /api/tests/questions` filters:
- `topic=` -> exact or case-insensitive match on `topic`.
- `q=` -> substring match on `prompt_text` (nice to have).
- `in_assignment=<id>` -> return only questions whose ids appear in that assignment's
  `settings.test.sections[].question_ids` (this is "filter by quiz"). Load the assignment,
  gather the ids from `testConfig`, and `WHERE id IN (...)`. If the id list is empty return `[]`.
- Keep `kind=`, `tag=`, `archived=`.

Commit: "Question bank: topics, multi-tags and quiz/topic filtering".

---

## 3. Part B — bulk MCQ import (paste + file), straight into a quiz

Teacher decision: import goes DIRECTLY into a quiz. As questions are filed they are also saved
to the bank, AI-tagged with a topic and tags, steered by an optional teacher description.

### Endpoint
`POST /api/tests/questions/bulk-import` (teacher + CSRF). Accept either:
- `application/json`: `{ raw_text, description, kind='mcq', assignment_id?, section_index? }`, or
- `multipart/form-data`: a `.csv` or `.docx` file plus the same fields. For file reads follow
  the existing multipart pattern used by the native pad `.txt` import (`readTxtImport` in
  `src/routes/nativePads.js`) and the `.docx`/passage handling already in the repo. CSV parsing
  can be a tiny hand-rolled splitter (no new dependency); `.docx` -> extract text with whatever
  the repo already uses for documents, else fall back to treating it as pasted text.

### Parsing
Two paths, pick by input shape:
1. **Structured CSV** (predictable): columns `prompt, optionA, optionB, optionC, optionD, answer,
   points?, topic?, tags?` where `answer` is a letter (A-D) or the 1-based index. Parse
   deterministically, no AI. Document this exact header in the UI.
2. **Loose paste / docx**: send the block to `callChat(db, { intent: readDoerIntent(db), ... })`.
   System prompt: "You convert a teacher's raw multiple-choice questions into structured JSON.
   Return ONLY a JSON array. Each item: { prompt_text, options: [..2-8..], answer_index (0-based;
   null if the correct answer is not marked), topic (2-4 word subject label), tags (1-4 short
   labels) }. Infer topic and tags from the question content and this teacher description: ...".
   Include the teacher `description` verbatim as steer. Use `maxTokens` generous (e.g. 8000) and
   temperature 0.1. Reuse the truncation-salvage/JSON-array recovery approach already in
   `literacyCoder.js` (`parseJsonArraySalvage`) so a cut bracket does not lose everything.

Never auto-invent a correct answer. If `answer_index` is null, still import the question but
flag it in the response so the UI can show "needs answer set".

### What the endpoint does
1. For each parsed question: insert a `test_questions` row (kind='mcq', options_json,
   answer_index, points default 1, topic, tags_json, origin_assignment_id = assignment_id).
2. If `assignment_id` is given: append the new question ids to that assignment's target section
   (the MCQ section, or `section_index` if provided). Load the assignment, mutate
   `settings.test.sections`, re-validate with the same rules as `normalizeSections`, and write
   `settings_json` back in a transaction. If no MCQ section exists, create one titled "MCQ".
3. Return `{ created: [...teacherQuestion], added_to_quiz: <count>, needs_answer: [ids],
   warnings: [] }`.

Do it in one DB transaction (`db.exec('BEGIN'... COMMIT/ROLLBACK)`), matching the pattern in
`createGreenpenRewriteAssignment` in `src/routes/nativePads.js`.

Commit: "Bulk MCQ import: paste or file, AI-tagged, straight into a quiz".

---

## 4. Part C — question bank UI: multi-select, shift-range, add-to-quiz, import

Rebuild `public/teacher/question-bank.html` around a selectable list. Reuse the design tokens
(`/assets/styles.css`, the `--green-*`, `--border`, `--r-*` vars) and match the calm-desk style
of `native-review.html`.

- **Filters row**: kind, topic (populate a `<select>` from the distinct topics returned by the
  API or a `GET /api/tests/topics`), a "Quiz" `<select>` (list test assignments; selecting one
  sets `in_assignment` so you see only that quiz's questions), and a text search box.
- **Per-question row**: a real toggle switch (styled checkbox) on the left for selection, then
  kind chip, prompt, topic + tags, points, and Edit/Archive actions. The correct option should
  be visibly marked (e.g. a small check on the right answer) so the teacher can eyeball
  correctness fast.
- **Shift-click range**: track the last-clicked row index. On a click while `shiftKey` is held,
  select every row between the last index and the current index inclusive. Plain click toggles a
  single row and updates the anchor index. Add a "Select all / none" control too.
- **Bulk action bar** (shows when >=1 selected): "Add selected to quiz" -> opens a quiz picker
  (`<select>` of test assignments + section), POSTs the selected ids to a new endpoint
  `POST /api/tests/assignments/:id/append-questions` `{ question_ids, section_index? }` which
  validates and appends to `settings.test.sections` exactly like Part B step 2. Also offer
  "Archive selected".
- **Import panel**: a paste textarea + description field + file input, a kind selector, and an
  optional target-quiz `<select>`. Posts to `/api/tests/questions/bulk-import`. Show the
  returned warnings and any "needs answer" questions inline, then refresh the list.

Keep the single-question add/edit form (it still uses `POST/PUT /api/tests/questions`).

Commit: "Question bank UI: toggle + shift-range select, add-to-quiz, import panel".

---

## 5. Part D — quiz setup / sections editor

Flesh out `public/teacher/new-test.html` (and the create flow) so sections are the organising
unit. Keep the server shape from `normalizeSections` / `buildTestSettings`.

- Allow **multiple named sections** (not just the fixed MCQ/SRQ/FRQ trio). Each section: title,
  kind, passage_text, a per-section `shuffle` flag (coordinate with the concurrent "section
  shuffle" work already landing — reuse their field name if present), and its question list.
- Building a section reuses the Part C multi-select + shift-range picker: "Add from bank"
  (filtered by topic/quiz), plus the bulk-import panel so you can import straight into a section.
- Show a running count and total points per section and for the test.
- Respect existing rules: FRQ section holds at most one question; `shuffle` never crosses
  sections (see `shuffledSectionQuestions` in `tests.js`).
- If the server currently only accepts the three fixed sections, extend `normalizeSections` to
  accept an ordered array of arbitrary sections while keeping the FRQ cap and the per-question
  kind/validity checks. Keep `TEST_SECTION_KINDS` as the allowed kinds.

Commit: "Quiz setup: multi-section editor with reusable question picker".

---

## 6. Part E — dashboard nav: Tests button + merge Classes/Students

In `public/teacher/index.html`:
- Remove the duplicate. Keep ONE card for people, labelled "Students and classes", linking to
  `/teacher/students` (that page already manages both). Delete the second card.
- Add a dedicated **Tests** card/button linking to a tests view. Simplest: link to
  `/teacher/assignments?type=test` and have `assignments.html` honour a `type` query param to
  filter to test assignments and default the "new" action to the test builder. Or add a thin
  `/teacher/tests` page listing test assignments with "New test" -> `new-test.html`. Pick the
  assignments-filter approach unless the assignments page is hostile to it.
- Make sure `new-test.html` is reachable from this Tests view.

Commit: "Dashboard: dedicated Tests entry, merge duplicate Classes/Students nav".

---

## 7. Part F — settings: curated AI model picker (doer + checker)

Goal: the teacher chooses the Doer and Checker models from a small curated dropdown. Keep the
Checker a different family from the Doer (design rule). Curated list, middle-ground:

Doer options (strong but cheap):
- `deepseek chat v3`  (DeepSeek V3.2, default, cheap, strong — current default)
- `deepseek reasoner`
- `qwen 2.5 72b instruct`
- `zhipu glm 4.6`

Checker options (cheaper, ideally a different family from the chosen Doer):
- `google gemini flash`  (default)
- `openai gpt mini`
- `qwen 2.5 72b instruct`  (only if Doer is not Qwen)
- `moonshot kimi`

These are INTENT strings; `resolveModel` fuzzy-matches them to whatever OpenRouter currently
serves, so they survive version bumps. Note for the teacher: DeepSeek has no "V6"; latest is
V3.2, which `deepseek chat v3` already resolves to.

Implementation:
- Add `readCheckerIntent(db)` / `writeCheckerIntent(db, value)` to
  `src/services/settingsStore.js`, mirroring the doer functions, key `ai_checker_intent`,
  default `'google gemini flash'`.
- Replace the hardcoded `const CHECKER_INTENT = 'google gemini flash'` in `src/services/checker.js`,
  `src/services/profileSummarizer.js`, `src/services/feedbackSuggester.js` with
  `readCheckerIntent(db)` at each call site (import it; do not keep the const).
- `src/routes/settings.js`: include `ai_checker_intent` in the GET payload and accept it in the
  PATCH body (same guard pattern as `ai_doer_intent`).
- `public/teacher/settings.html`: add two labelled `<select>`s (Doer model, Checker model)
  populated with the curated lists, pre-selected from the GET response, saved via the existing
  settings PATCH. Keep the existing "Test OpenRouter" button working.

Commit: "Settings: curated Doer and Checker model pickers".

---

## 8. Part G — grade-importer: reveal/copy the sync key

In `../grade-importer/` (Python Flask app, `app.py` + `templates/index.html`):
- Add a "reveal + copy" affordance to the Settings tab so the current `sync_key` can be read and
  copied. The value is already returned to the localhost-only page (the config endpoint around
  `app.py` line 148 returns `sync_key`, and `templates/index.html` reads `cfg.sync_key`). Add a
  masked field with a "Show" toggle and a "Copy" button in the settings panel (~line 520-540 of
  `templates/index.html`). No new endpoint needed since the value is already available client-side
  on localhost.
- This is a separate app/repo; commit it separately with its own deploy (`grade-importer/deploy.sh`).

Tell the teacher: the InkHeron "Admin gradebook export key" must equal the grade-importer
"sync key". Current value `GwPVRUH4EhC2vSrxrmn7XYRgar28nVXWjLlprDv6ulk`. To rotate: set a new
string in the grade-importer Settings tab, then paste the same string into InkHeron Settings.

---

## 9. Tests to add (Node 24)

- `test/bulkImport.test.js`: structured CSV import creates rows and appends to a quiz section;
  loose text import with an injected fake `chat` returns structured questions (inject
  `{ chat }` like `verifyFindings`/`runLiteracyAnalysis` do); `answer_index` null is flagged not
  invented; questions land in the target assignment's `settings.test.sections`.
- `test/questionBankFilter.test.js`: `topic=` and `in_assignment=` filters return the right rows.
- `test/settingsModels.test.js`: PATCH `/api/settings` persists `ai_checker_intent`, GET returns
  it, and `readCheckerIntent` default is `'google gemini flash'`.
- Extend the existing tests suite; run `PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npm test`
  and keep it green.

## 10. Order of work / commits

1. Part A schema + filters. 2. Part B bulk import backend + tests. 3. Part C bank UI.
4. Part D sections editor. 5. Part E nav. 6. Part F settings models. 7. Part G grade-importer.
Commit after each. Update SESSION_NOTES.md at the end (and CLAUDE.md section 5/8 if you change
the settings contract or add a settings field).
