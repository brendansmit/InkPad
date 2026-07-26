# SESSION_NOTES_ARCHIVE.md — InkHeron Platform

## Archived 2026-07-26 — Entries from 2026-07-03 to 2026-07-05

- 2026-07-05: Fixed assignment dashboard internal and exam score totals, CSV fields and released/held status rendering, with focused and browser tests.
- 2026-07-05: Reviewed and deployed the six round-3 commits covering contested marks, rubrics, feedback banks, layered marks and the selection toolbar.
- 2026-07-05: Made batch feedback the server fallback and added per-student feedback release.
- 2026-07-05: Batch feedback release became the default for new assignments.
- 2026-07-05: Round-2 review cleared four baseline failures and deployed migrations and UI work.
- 2026-07-04: Round-2 handoffs covered dashboard scores, prompt tone, gradebook export, class insights, release gating, semester tags and parent report snippets.
- 2026-07-04: Added the false-positive accuracy layer, MT literacy code and click-to-change marks, then narrowed MT to mistranslated names and fixed expressions.
- 2026-07-03: Cached heavy PDF.js and font assets for unreliable school networks.
- 2026-07-03: Fixed assignment datetime-local values by converting them to UTC ISO before saving.
- 2026-07-03: Added the teacher student-profile dashboard and writing-profile endpoint.
- 2026-07-03: Rebuilt student feedback with category filters, target tick-off, strengths, rubrics and green-pen navigation.

## 2026-07-03 — Sonnet: essay_type/supervision settings fields

- Phase/Step worked: SONNET_HANDOFF.md "New settings fields — essay type and supervision".
- Built: `assignments.settings_json` gains `essay_type` (narrative/argumentative/personal/analysis/short_response/rhetorical_analysis/synthesis/other) and `supervision` (in_class/mixed/homework), validated against fixed sets in `buildSettingsJson`, defaulting to 'other'/'in_class' when absent or invalid. No migration, settings_json is a blob. Two selects added to both the create form (`new-assignment.html`) and the edit modal (`assignments.html`), wired into the existing settings-object construction alongside paste_mode. Exposed in the teacher review payload's `assignment` block and, per literacy evidence row, in the writing-profile endpoint's `recent_evidence` (joined against the owning assignment's settings_json) so profile numbers carry their genre/supervision context. Tests: default/valid/invalid-falls-back-to-default in `assignments.test.js`, presence in review and profile payloads in `nativePads.test.js`. Full `assignments.test.js` + `nativePads.test.js` rerun clean (28 tests). Commit 640cf63.
- Decisions: none beyond the handoff spec.
- Open / next: full suite run (task 6).
- Gotchas hit: none.

## 2026-07-03 — Sonnet: student target/strength tick-off endpoint

- Phase/Step worked: SONNET_HANDOFF.md "Student target tick-off endpoint".
- Built: `POST /api/native/pads/:padId/feedback-items/:itemId/toggle-check` (student session + CSRF), ownership checked via `loadOwnedNativePad`, gated to `pad.state === 'green_pen_open'` (409 `green_pen_not_open` otherwise), flips `student_checked` 0/1 and sets/clears `student_checked_at`. `publicFeedbackItem` now includes `student_checked`/`student_checked_at`, so both the student feedback view and the teacher review endpoint expose it automatically with no extra changes. No migration needed, columns already existed from migration 025. 4 new tests in `test/feedbackTickOff.test.js` (toggle both ways, other student gets 404, 409 outside green_pen_open, field appears in both payloads). Full `nativePads.test.js` + `analysisBackend.test.js` rerun clean (22 tests). Commit 5ac9716.
- Decisions: state-gated to `green_pen_open` specifically, not any broader "feedback visible" state, since that is the one lifecycle state where the student is actively revising against feedback.
- Open / next: essay_type/supervision settings fields, then full suite run.
- Gotchas hit: none.

## 2026-07-03 — Sonnet: strengths/targets suggester seam

- Phase/Step worked: SONNET_HANDOFF.md "New seam — strengths/targets suggester", `suggestFeedbackItems` in `src/services/feedbackSuggester.js` plus migration 026.
- Built: migration 026 creates `ai_feedback_item_suggestions` (hidden holding area, mirrors `ai_literacy_suggestions`). Service triangulates the assignment prompt (`settings_json.prompt`), essay `plain_text`, rubric criteria/bands across all rubric_kinds, and the student's recurring literacy issues into one Doer (haiku) call returning 2-3 strengths and 3-5 targets (targets carry `try_now_prompt`, strengths don't); a Checker (gemini flash) call verifies each item is grounded in the essay and drops any flagged unsupported at confidence >= 0.8; delete-then-insert of prior pending rows in a transaction. Three teacher endpoints added to `nativePads.js`: `GET .../feedback-suggestions`, `POST .../accept` (inserts a real `native_feedback_items` row with `source='ai'`, links `feedback_item_id`), `POST .../reject`. Wired into the submit background chain next to the other `runInBackground` seams. 9 tests (service: happy path, re-run no duplicates, checker-flagged drop, checker-failure non-fatal, empty-essay skip, doer-failure error; endpoints: accept promotes + 409 on re-accept, reject resolves without creating an item, wrong-pad 404).
- Decisions: rubric context pulled across all `rubric_kind` values (not just 'internal') since it is only used as prompt context, not for scoring, so the richer picture triangulates better.
- Open / next: student target tick-off endpoint, essay_type/supervision settings fields.
- Gotchas hit: none.

Old entries moved out of `SESSION_NOTES.md` to keep active context under 400 lines.


## 2026-07-02 — Remove Etherpad entirely, disentangle to native-only
- Asked: remove the old Etherpad stuff, disentangle and remove, without deleting/losing any student data and without breaking anything. Confirmed by user: production writing already imported into native_pads; leave the 8 legacy tables inert (no drop).
- Built (branch `remove-etherpad`, 3 commits):
  1. assignments.js made native-only: dashboard, student list, status derivation and the teacher notifications count now read native_pads instead of pads/submissions/grades/paste_events. Removed the Etherpad-only bulk release-grades endpoint and its button. Rewrote/pruned the mixed-path cases in assignments.test.js (now 11/11).
  2. Deleted src/routes/pads.js (+ app.js registration), src/etherpad/ (API, config, ep_inkheron_paste plugin), old views write/locked/greenPen.js, teacher review.html + timeslider.html and their routes, dead /write fallbacks in student-dashboard.html, the obsolete import-etherpad-to-native.mjs, and the Etherpad-only tests (etherpad, pads, submissions, paste, importEtherpad).
  3. Updated CLAUDE.md §1/§2/§4/§7/§9 to describe native InkPad as the writing surface and document the native data model; marked the 8 legacy tables inert.
- Decisions: kept serverChan.js and literacyCoder.js (not Etherpad-specific, reusable for the native path — currently unwired). Kept all legacy tables and their data; no drop migration. Repointed the teacher notification badge to native submissions rather than killing it.
- Verified: app boots clean on Node 24; deleted routes (/teacher/review, /write/:id, /api/pads/:id/timeslider) return 404, native routes intact. Full suite 58 pass / 6 fail, and those 6 are the SAME pre-existing failures present before this work (EAP library upload, student login, classes CRUD, roster page, two native-write-view CSS assertions) — no new regressions.
- Gotchas hit: this repo's git root is the parent Claude/ dir, not InkHeron-Platform/. A `git add -A` swept in unrelated projects and embedded repos; fixed by soft-resetting and re-staging only InkHeron-Platform paths. Use explicit paths here, never `-A`. Tests need Node 24 (node:sqlite); nvm has v24.18.0.
- Open / next: serverChan/literacyCoder are unwired on the native path (native submit does not notify WeChat, no AI literacy analysis endpoint yet). Legacy tables can be dropped later as a deliberate backed-up step. SESSION_NOTES is over 400 lines — archive oldest soon.

## 2026-07-02 - Uniform line spacing for clean empty-line numbers
- Asked: line numbers looked buggy around empty Enter lines.
- Cause: paragraphs/divs had a 1em bottom margin, so blank lines were taller than text lines and the gutter numbers spaced unevenly.
- Built: dropped the paragraph/div bottom margin so every line is one uniform ruled-paper height; empty lines now number evenly. Lists keep left indent, lost bottom margin.
- Verified: node --check passes, wrapper active after deploy.

## 2026-07-02 - Fix line-number alignment
- Asked: line numbers on the left did not line up with lines that have text.
- Cause: gutter was a fixed 31.5px-spaced text column counting only newline lines, so wrapped lines and the 1em paragraph bottom margin drifted the numbers off the text.
- Built: updateLineNumbers now measures each visual line via a Range over the editor content (getClientRects, deduped by top) and absolutely positions a number at each line top, dividing out the current editor zoom.
- Verified: node --check passes, wrapper active after deploy. Live look for Brendan.

---

## 2026-06-30 - Native InkPad opt-in controls

- Asked: do the next batch of Native InkPad steps.
- Built: added a teacher-facing Native InkPad toggle to new assignment and edit assignment screens. API tests cover explicit on/off behaviour.
- Verification: assignment tests passed 11/11 and edited dashboard scripts parsed.
- Open / next: autosave/version conflict hardening.
- Gotchas hit: explicit off removes the native flag, while normal edits without the field still preserve it.

## 2026-06-30 - Native InkPad dashboard integration

- Asked: do the next two native InkPad steps.
- Built: student assignment API now returns native flags and `write_url`; student dashboard uses that URL. Teacher assignment dashboard now returns `pad_kind`, native paste evidence and `review_url`; teacher assignment page uses that URL so native pads open the native review page. Assignment PATCH preserves hidden `native_inkpad` flags.
- Verification: Node 24 assignment/native/Etherpad/migration focused suite passed 25/25. Student and teacher dashboard inline scripts parse.
- Open / next: add a teacher-facing opt-in control for creating/editing native assignments without direct DB/test setup.
- Gotchas hit: dashboard SQL needed native paste summary columns explicitly selected after joining the native paste aggregate.

## 2026-06-30 - Native InkPad teacher review UI

- Asked: build the next native InkPad step after the review and paste policy foundation.
- Built: added `/teacher/native-review`, a separate sidecar review page for native pads with text highlights, general comments, inline comments, annotation list, paste policy controls, paste evidence and revision summaries.
- Verification: Node 24 app syntax check passed, native migration/page tests passed, extracted browser script parsed, Etherpad API plus native focused suite passed.
- Open / next: integrate native pad links/status into student and teacher dashboards behind the opt-in flag.
- Gotchas hit: kept this separate from the Etherpad review page so current classes are not affected.

## 2026-06-30 - Native InkPad review and paste policy foundation

- Asked: prepare native InkPad for teacher review modes, general comments, Word-style inline comments, literacy-code style marks and live paste toggling.
- Built: migration `013_native_review_policy.sql`, native pad versioning, per-pad policies, range annotations, teacher events, teacher review API, annotation create/update APIs, paste-event API and student-side policy polling.
- Verification: Node 24 syntax checks pass. `etherpad`, migration and native pad focused tests pass.
- Open / next: build the actual teacher review page UI and dashboard integration for native pads.
- Gotchas hit: kept this as sidecar-only; no `/write` cutover or dashboard link changes yet.

## 2026-06-30 - Native InkPad sidecar foundation

- Asked: start building an Etherpad replacement on the side while Etherpad stays live until confidence is high.
- Built: added `NATIVE_INKPAD.md`, migration `012_native_inkpad.sql`, hidden native routes, a simple native write view, autosave, submit locking and revision snapshots. Native routes only work when assignment settings include `native_inkpad: true`.
- Verification: Node 24 syntax checks pass. Focused migration and native pad tests pass. Existing Etherpad pad test run still has unrelated failures in old expectations.
- Open / next: add teacher review for native pads, native dashboard status integration and richer editor behaviour after save/submit proves stable.
- Gotchas hit: local default Node is 20 and cannot load `node:sqlite`; use bundled Node 24 for tests.

## 2026-06-30 - Permanent random pad suffixes

- Asked: give each newly used pad a random `1 letter + 4 digit` suffix so deleted local pad rows do not reuse the same Etherpad pad.
- Built: added `pad_allocations`, generated suffixes like `K4821`, reserved suffixes before Etherpad pad creation, retried collisions and reused existing active pad rows unchanged.
- Verification: focused migration, Etherpad and pad allocation tests pass. Live smoke created `g.Tff3JsxD9Dv6MfWE$a9_s5_D2565`, then confirmed the allocation stayed recorded after deleting the throwaway assignment.
- Open / next: full local suite still has unrelated dirty-work failures in auth, EAP admin, write-view UI, timeslider and submission review expectations.
- Gotchas hit: live restart initially failed because current dirty `app.js` imports library routes and multipart support that were not on the droplet; deployed the missing route/assets and installed the missing package, then health checks passed.

## 2026-06-30 — PDF TextLayer: text selection + canvas highlight

- Built: Replaced canvas-only PDF.js render with per-page structure: pdf-canvas + hl-canvas + TextLayer div. Students can now select and copy text from the passage PDF. Highlight buttons paint selection rects onto the hl-canvas using `getClientRects()` with `mix-blend-mode:multiply`. Used named imports (`getDocument`, `TextLayer`) from pdf.min.mjs (PDF.js v5 API).
- Decisions: Highlight is canvas-drawn (not DOM spans) — simpler, no EP conflict, but not persistent across zoom re-renders (acceptable for in-session use).
- Commit: 9edcadc

---

## 2026-06-30 — Batch fixes: zoom, line numbers, sidebar, teacher comments

- Built:
  - **Zoom (#3):** `applyZoom` now sets `body.style.zoom` on both padDoc and aceOuter body so gutter + editor scale together. Tracks `currentZoom`, reapplies after cleanup. Old approach targeted `#editorcontainerbox` which didn't scale the gutter.
  - **Line numbers (#6):** Changed `#sidediv` `padding-top: 55px → 40px` in layout.css on server (matches iframe padding). Also fires resize on `aceOuter.contentWindow` 200ms after cleanup so EP recalculates gutter positions after CSS applies.
  - **Instructions sidebar (#4):** Prompt now shows in left sidebar panel (`.split-left`) instead of a collapsible panel above the pad. Sidebar appears whenever there is a prompt or passage or both. Removed prompt-btn, prompt-panel, and prompt-panel-toggle JS.
  - **Teacher comments (#2, general only):** Migration 010 adds `submission_comments` table. `PUT /api/submissions/:id/comment` upserts a general comment. Review page includes a comment textarea; saving feedback also saves the comment in parallel.
  - **Targets/strengths (#5):** Verified already working — `feedbackLibrary` IDs match string keys stored in DB.
- Decisions: Inline comments deferred (complex); general comments cover the immediate need. Line numbers fix is empirical (40px = iframe padding-top); may need fine-tuning after visual check.
- Open: Verify line numbers and zoom work visually. Inline teacher comments still not built. Task #1 (review page redesign) and #7 (iframe deep-debug) still pending.
- Gotchas: `sed` failed on multi-line layout.css edit; used Python instead.
- Commit: 487f870


## 2026-06-29 — Multi-class assignment creation
- Phase/Step worked: Phase 8 teacher UX polish
- Built: Updated `new-assignment.html` to replace the single class dropdown with a
  checkbox list. `loadClasses()` renders one `<label><input type=checkbox>` per class
  into `#classChecks`. Submit handler collects all checked IDs, validates at least one
  is selected, then loops `POST /api/assignments` once per class. Button shows count
  while creating. Redirects to assignments page on full success; shows error count
  if any POSTs fail. No backend change needed.
- Decisions: One assignment row per class (existing schema, no migration). Last created
  ID used for the `?highlight` redirect.
- Open / next: Strengths and Targets upload + AI marking suggestions (Phase 8.6)
- Gotchas hit: none.

---

## 2026-06-29 — Flexible column-picker for student import
- Phase/Step worked: Phase 8 teacher UX polish
- Built: Reworked spreadsheet import in students.html. After dropping a file,
  two dropdowns let the teacher pick which column is the name and which is the
  class. Auto-guesses column from header text ("English Name", "Admin Class" etc).
  Class cells matched case-insensitively against existing classes — green tick if
  matched, red X with manual fallback picker if not. Import blocked until all
  students have a class. Username auto-generated from name.
- Decisions: class match is exact case-insensitive; no fuzzy match to avoid
  false positives across similar class names.
- Open / next: Strengths and Targets upload + AI marking suggestions (Phase 8.6)
- Gotchas hit: none.

---

## 2026-07-01 - Native InkPad Phase 7 rubrics
- Asked: Build the next two native InkPad phases, starting with rubric grading beside strengths, targets, comments and literacy codes.
- Built: Added `014_native_rubrics.sql` with assignment rubric criteria, score bands and per-native-pad rubric scores. Added teacher APIs to create assignment rubrics and save half-step pad scores. Review payload now includes rubric criteria and scores.
- UI: Native review page can create a default five-criterion rubric, choose whole or half scores with an X marker and save notes for each criterion.
- Verified: `node --check src/routes/nativePads.js` and Node 24 `--test test/migration.test.js test/nativePads.test.js` passed 8/8.
- Decision: Rubric scores stay separate from numeric grades for now so they can later feed visible feedback packages and student profiles.

---

## 2026-07-01 - Live InkPad slowness check
- Asked: Check `inkpad.inkheron.app` because it felt very slow and determine whether the server or China traffic throttling was likely.
- Checked: Timed live HTTPS requests from the Codex environment. DNS and TCP connect were fast, but HTTPS page requests had 8-45 s time to first byte. Plain HTTP redirect was fast at about 0.46 s.
- Decision: This points to the HTTPS origin/app path, likely nginx proxy to Fastify or the small droplet under load, not primarily China throttling. Browser navigation also failed to complete inside the timeout.

## 2026-07-01 - Live InkPad slowness fix
- Asked: Fix the live slowness before doing more feature work.
- Found: Droplet load was around 10-14 on a 1 GB server with no swap. `apt-daily-upgrade.service` had been stuck for over 2 hours, with orphaned unattended-upgrade and apt-check processes holding dpkg locks and driving CPU system time to about 95-97%.
- Fixed: Killed the orphaned apt/unattended-upgrade process tree, added a persistent 2 GB `/swapfile`, set `vm.swappiness=10` and disabled `apt-daily.timer` plus `apt-daily-upgrade.timer` to prevent surprise upgrades during class use.
- Verified: Local upstream timings recovered to 1-28 ms and local nginx HTTPS to 7-20 ms. Public HTTPS checks recovered to about 0.63-0.72 s total for `/`, `/assets/styles.css` and `/api/me`.
- Decision: This was server resource exhaustion, not primarily China throttling. Manual OS updates are now needed because daily apt timers are disabled.

---

## 2026-07-01 - Controlled update schedule and WeChat alerts
- Asked: Schedule droplet updates for early China mornings, cancel stuck updates by 06:00 and alert through ServerChan/WeChat.
- Built: Stored ServerChan send key in root-only `/etc/inkheron/serverchan.env`. Installed `/usr/local/sbin/inkheron-maintenance-update` and `/usr/local/sbin/inkheron-maintenance-watchdog`.
- Schedule: systemd update timer checks daily at 02:00 with a 20 minute random delay. The script only runs on Wednesday, Sunday or when a retry marker exists. Watchdog runs daily at 06:00 and kills stuck apt/dpkg processes, then marks retry for the next morning.
- Verified: Scripts pass `bash -n`, timers are enabled, Ubuntu `apt-daily` timers remain disabled and ServerChan test returned success.
- Decision: Server maintenance now runs on the droplet without the MacBook. Manual update policy is controlled by these InkHeron timers rather than Ubuntu's default unattended update timers.

---

## 2026-07-01 - Native InkPad Phase 10 student feedback loop
- Asked: Run a health check, continue the build and report replacement readiness.
- Health check: Droplet services were active, load recovered to near zero, swap active and public `inkpad.inkheron.app` timings were about 0.65-0.72 s.
- Built: Added native `finish-marking` endpoint, student native feedback API, `/native/feedback/:assignmentId` page and dashboard feedback links for returned native work.
- UI: Teacher review can return feedback. Student feedback page shows marked text, general comment, inline comments, literacy codes, highlights, rubric scores and an `Open rewrite` button when green pen is open.
- Verified: Node 24 syntax checks passed. Focused suite `test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 21/21. Broader stable suite `test/etherpad.test.js test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

---

## 2026-07-01 - Native InkPad Phase 11 green-pen resubmission
- Asked: Keep plodding on toward native replacement after the student feedback loop.
- Built: Native submit now accepts `green_pen_open` pads, preserves first submission time, moves the pad to `resubmitted` and records another submit revision snapshot.
- UI/API: Student writer labels green-pen work as `Resubmit`. Teacher review payloads include original/latest submission comparison anchors and the review page shows quick buttons for original submission and latest rewrite.
- Verified: Node 24 syntax checks passed. Focused suite `test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 21/21. Broader stable suite `test/etherpad.test.js test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.
- Decision: Resubmission reuses the existing `submit` revision reason to avoid a migration just for naming. Original versus rewrite is derived from first and latest submit snapshots.

---

## 2026-07-01 - Native InkPad Phase 12 browser smoke confidence
- Asked: Keep going toward native replacement readiness.
- Built: Added `scripts/native-smoke-server.mjs`, a temp-data local smoke server that seeds one teacher, one student and one green-pen native assignment for real browser checks.
- Verified: In the in-app browser, student login/password reset, native write, autosave, submit lock, teacher review, return feedback, green-pen rewrite, resubmit lock and teacher comparison anchors all worked against the local server.
- Decision: This is a smoke tool, not a production route. It uses a temp SQLite database and does not touch live data.

---

## 2026-07-01 - Native InkPad local preview
- Asked: Show what the custom native pad looks like compared with Etherpad.
- Did: Started `scripts/native-smoke-server.mjs` on `http://127.0.0.1:3476` with a temp SQLite database and seeded native assignment.
- Decision: This preview is local temp data only and does not touch live student work.

---

## 2026-07-01 - Native InkPad default for new assignments
- Asked: Get the custom pad usable for students ASAP because Etherpad has been breaking down.
- Built: New assignments now default to Native InkPad in the API and teacher form. Etherpad remains an explicit fallback and existing Etherpad assignments are not silently flipped.
- Verified: Node 24 syntax and whitespace checks passed. Focused assignment/native suite passed 21/21. Broader stable suite passed 31/31.

---

## 2026-07-01 - Native InkPad default deployed
- Asked: Move ASAP toward student usability after Etherpad instability.
- Deployed: `src/routes/assignments.js`, `public/teacher/new-assignment.html` and `public/teacher/assignments.html` to `/opt/inkheron-platform`, then restarted `inkheron-wrapper.service`.
- Verified: Wrapper active. Droplet local `/healthz` returned 200 in about 3 ms. Public `https://inkpad.inkheron.app/healthz` returned 200 in about 0.69 s. Teacher page remains auth-protected with 401 when unauthenticated.

---

## 2026-07-01 - Fix live student login loop
- Asked: Fix InkPad showing logged in as student, then looping back to the login page.
- Found: Live logs showed `/api/me` returning 200, then `/api/student/assignments` crashing with `no such table: native_pads`. The dashboard was failing after login, not losing the session.
- Fixed: Deployed missing Native InkPad migrations and native route/page files, ran migrations `012_native_inkpad.sql` through `015_student_writing_profiles.sql`, then restarted `inkheron-wrapper.service`.
- Verified: Required native tables exist, wrapper health is 200, public health is 200 and no `no such table` or 500 errors appeared after the fixed restart.

---

## 2026-06-26 — Add-on: demo & ghost accounts Step A
- Phase/Step worked: Add-on Step A (account flags + shared filter)
- Built: Added migration `003_student_demo_ghost_flags.sql` with `is_demo` and `is_ghost`
  boolean columns on `students`, plus indexes. Created `src/db/realStudents.js` with a single
  shared helper `realStudentsWhere(alias)` (plus `realStudentsClause` and `andRealStudents`
  conveniences) that produces `is_demo = 0 AND is_ghost = 0`. Added THE ONE RULE to `CLAUDE.md`
  as hard rule #1 and updated the data model to include the two flags. Updated migration test
  to expect the new columns.
- Decisions: SQLite stores booleans as 0/1 with CHECK constraints. The helper is the only path
  for real-student filters; future aggregate/tally/export/calibration queries must use it.
  Steps B (ghost auto-enrol), C (demo sandbox) and D (demo reset) are intentionally deferred
  until Phases 3, 4 and 6 are built, because they depend on pad provisioning, assignments and
  seeded demo work.
- Open / next: Phase 2, Step 2.5 teacher password reset for students (or continue with the
  Add-on steps once pad/assignment phases are in place).
- Gotchas hit: none.

## 2026-06-26 — Phase 2 Step 2.4 teacher login (admin)
- Phase/Step worked: Phase 2, Step 2.4
- Built: Added teacher auth routes: `POST /api/teacher/login`, `POST /api/teachers` (teacher-only),
  and one-time `POST /api/setup/teacher` that self-locks after the first teacher is created.
  Added teacher login page `public/teacher-login.html` and teacher dashboard shell
  `public/teacher/index.html`. Guarded `/teacher` and `/api/teachers` with
  `requireTeacherSession`; student sessions receive 403 on teacher routes. Added tests for
  teacher login, teacher creation, setup lockdown, and student rejection from teacher routes.
- Decisions: Reused the same session cookie mechanism as students. The one-time setup endpoint
  avoids needing a pre-seeded default password while keeping abuse impossible once any teacher
  exists.
- Open / next: Add-on Step A, then Phase 2 Step 2.5 teacher password reset for students.
- Gotchas hit: none.

## 2026-06-26 — Phase 2 Step 2.3 student self-change password
- Phase/Step worked: Phase 2, Step 2.3
- Built: Added a self-hosted student change-password page at
  `public/student-change-password.html` and served it at `/student/change-password`. The page
  asks for the current password and a new password of at least 8 characters, calls
  `POST /api/students/me/password`, and gives clear success/error feedback. The endpoint still
  supports the forced-change path from Step 2.2.
- Decisions: Kept the page self-hosted using Design tokens; no external fonts or scripts.
  Chose a dedicated path rather than a modal so it works before the dashboard SPA exists.
- Open / next: Phase 2, Step 2.4 teacher login (admin).
- Gotchas hit: none.

## 2026-06-26 — Phase 2 Step 2.2 student login
- Phase/Step worked: Phase 2, Step 2.2
- Built: Added `@fastify/cookie`, `@fastify/session`, new `src/routes/auth.js`, and a real
  student login page at `public/login.html`. Routes: `POST /api/login`, `POST /api/logout`,
  `GET /api/me`, `POST /api/students/me/password`. Password change supports both the
  forced-change path (no current password needed) and the normal self-change path (current
  password verified). Added session guards `requireStudentSession` and `requireTeacherSession`
  for future phases. Added `test/auth.test.js` covering login, wrong password, forced password
  change, self-change with current password, and guard rejection.
- Decisions: Sessions are signed httpOnly cookies with `SameSite=lax`; `INKHERON_SESSION_SECRET`
  is required in production and falls back to a clear dev warning/secret locally. The login page
  is a wired, self-hosted version of the existing mockup design, with no Google Fonts.
- Open / next: Phase 2, Step 2.3 student self-change password UI.
- Gotchas hit: Local machine defaulted to Node 20, which lacks `node:sqlite`. Installed Node
  24.18.0 via nvm and added `.nvmrc`. npm test now passes all 10 tests.

## 2026-06-25 — Phase 2 Step 2.1 classes and students
- Phase/Step worked: Phase 2, Step 2.1
- Built: Added DB helpers, bcrypt password hashing, class CRUD routes and student CRUD routes.
  Added corrective migration `002_student_must_change_default.sql` so new students default
  `must_change_password` to false. Deployed to the droplet and created one test class with three
  test students through the local API.
- Decisions: API responses never include `password_hash`. Setup CRUD routes are usable locally on
  the droplet at `127.0.0.1:3000`, but nginx blocks public `/api/*` with 404 until auth and guards
  are built.
- Open / next: Phase 2, Step 2.2 student login.
- Gotchas hit: Node `node:sqlite` reports duplicate constraints as `ERR_SQLITE_ERROR` with a
  message, not a dedicated unique-constraint code, so duplicate handling maps the message to 409.

## 2026-06-25 — Phase 1 Step 1.8 backups and basics
- Phase/Step worked: Phase 1, Step 1.8
- Built: Added `ops/backup.sh`, `ops/RESTORE.md` and `ops/SECURITY.md`. Installed `sqlite3` on
  the droplet, created root-only `/etc/inkheron/backup.key`, installed
  `/usr/local/sbin/inkheron-backup`, added `/etc/cron.d/inkheron-backup` for nightly 03:15
  backups, and produced `/var/backups/inkheron/inkheron-20260625T112543Z.tar.gz.enc`.
- Decisions: Backups include `/opt/inkheron-platform/data/inkheron.db` and
  `/opt/etherpad-lite/var/etherpad.sqlite`, encrypted with OpenSSL AES-256-CBC and PBKDF2.
  Current droplet root disk was not converted to full-disk encryption in place; documented that
  true FDE needs a planned rebuild or encrypted volume migration.
- Open / next: Phase 1 exit check, then Phase 2 identity and auth.
- Gotchas hit: Backup directory is root-only, so restore tests need `sudo` to find the encrypted
  backup file. Restore test passed with `PRAGMA integrity_check` returning `ok` for both DBs.

## 2026-06-25 — Phase 1 Step 1.7 SQLite schema
- Phase/Step worked: Phase 1, Step 1.7
- Built: Added `migrations/001_initial_schema.sql` and a Node migration runner at
  `src/db/migrate.js`. Created canonical tables `students`, `classes`, `assignments`, `pads`,
  `submissions`, `grades` and `paste_events`, plus `settings`, `teachers` and
  `schema_migrations`.
- Decisions: Used Node 24 `node:sqlite` instead of adding a native SQLite package. Runtime DB
  files are ignored with `data/*.db` and `data/*.db-*`.
- Open / next: Phase 1, Step 1.8 backups and basics.
- Gotchas hit: `node:sqlite` prints an experimental warning in Node 24. Remote schema verification
  first failed due shell quoting, not due the migration. Rerun verified all expected tables and
  columns.

## 2026-06-25 — Phase 1 Step 1.6 Fastify wrapper skeleton
- Phase/Step worked: Phase 1, Step 1.6
- Built: Added a Node/Fastify wrapper with `GET /healthz`, static self-hosted assets, local
  Inter and Source Serif 4 font files, and a minimal InkHeron landing page. Deployed it to
  `/opt/inkheron-platform` as `inkheron-wrapper.service` on `127.0.0.1:3000`.
- Decisions: nginx now routes wrapper traffic to `127.0.0.1:3000`, while Etherpad keeps `/p/*`,
  `/socket.io/*`, `/static/*`, `/locales.json`, `/manifest.json` and `/favicon.ico` on
  `127.0.0.1:9001`.
- Open / next: Phase 1, Step 1.7 platform SQLite schema.
- Gotchas hit: Initial wrapper returned 500 on `/` because `@fastify/static` was registered with
  `decorateReply: false` while the route used `reply.sendFile`. Fixed and redeployed. Local
  machine Node is 16, so tests use the bundled Node 24 runtime.

## 2026-06-25 — Phase 1 Step 1.5 China reachability confirmed
- Phase/Step worked: Phase 1, Step 1.5
- Built: User confirmed `https://inkpad.inkheron.app/` works from China with VPN off. Current
  public surface is pure Etherpad, which is expected before the Fastify wrapper phase.
- Decisions: Mark Step 1.5 complete based on the real China-side test plus prior DNS, HTTPS and
  WebSocket checks.
- Open / next: Phase 1, Step 1.6 Fastify wrapper skeleton.
- Gotchas hit: none.

## 2026-06-25 — Phase 1 Step 1.5 reachability checks started
- Phase/Step worked: Phase 1, Step 1.5
- Built: Verified `inkpad.inkheron.app` resolves to `167.172.71.219` through Chinese public DNS
  resolvers AliDNS `223.5.5.5` and DNSPod `119.29.29.29`. Re-verified public HTTPS returns
  `200` from nginx and WebSocket upgrade returns an Engine.IO session id through
  `wss://inkpad.inkheron.app/socket.io/`.
- Decisions: Did not mark Step 1.5 complete because the done condition requires a real China
  mobile-data VPN-off browser test with live pad editing.
- Open / next: Run `https://inkpad.inkheron.app/` from Chinese mobile data with VPN off, open a
  pad in two tabs and confirm edits sync live. Optional browser checks: 17CE, BOCE and GreatFire.
- Gotchas hit: 17CE's documented WebSocket API requires API credentials. BOCE blocks direct
  scripted access with WAF. GreatFire timed out from this environment.

## 2026-06-25 — Phase 1 Step 1.4 nginx HTTPS and WebSocket
- Phase/Step worked: Phase 1, Step 1.4
- Built: Configured nginx for `inkpad.inkheron.app`, reverse-proxied to Etherpad on
  `127.0.0.1:9001`, using an existing Let's Encrypt certificate managed by certbot.
- Decisions: Reused the existing nginx instance (shared with speed-dating and grammar-arcade).
  Added the InkHeron server block alongside the existing ones.
- Open / next: Phase 1, Step 1.5 reachability from China VPN-off and third-party checks.
- Gotchas hit: Ports 80 and 443 were already used by nginx serving older apps from this reused
  droplet. Verified WebSocket upgrade headers are passed; public `wss://` Socket.IO handshake
  returned an Engine.IO session id.

## 2026-06-25 — Phase 1 Step 1.3 Etherpad local install
- Phase/Step worked: Phase 1, Step 1.3
- Built: Installed Etherpad under `/opt/etherpad-lite`, pinned to stable `v3.3.2`, upgraded Node
  to `24.18.0`, installed `pnpm 11.1.2`, configured Etherpad to bind to `127.0.0.1:9001`,
  configured Etherpad DB as SQLite at `/opt/etherpad-lite/var/etherpad.sqlite`, and created an
  enabled `etherpad.service`.
- Decisions: Used the latest stable Etherpad tag instead of the default `develop` branch.
  Removed `ProtectHome=true` from the systemd unit because pnpm reads the account home path from
  `/etc/passwd` during plugin migration and fails under home protection.
- Open / next: Phase 1, Step 1.4 configure nginx and route HTTPS/WebSocket traffic to Etherpad.
- Gotchas hit: Etherpad `v3.3.2` requires Node `>=24`; the droplet had Node 22. The first
  config-edit attempts failed due remote shell quoting before touching the file. Service startup
  failed until pnpm's home-access issue was isolated with `systemd-run`.

## 2026-06-25 — Phase 1 Step 1.2 server hardening
- Phase/Step worked: Phase 1, Step 1.2
- Built: Created `inkheron` non-root sudo user with SSH key access, set timezone to
  `Asia/Shanghai`, ran `apt-get update` and `apt-get upgrade`, enabled UFW with only 22, 80 and
  443 open.
- Decisions: Disabled root SSH login and password SSH. `inkheron` has passwordless sudo so remote
  maintenance still works with key-only auth.
- Open / next: Phase 1, Step 1.3 install/run Etherpad locally on port 9001.
- Gotchas hit: `/etc/ssh/sshd_config.d/50-cloud-init.conf` was forcing
  `PasswordAuthentication yes`; changed it to `no`. Hostname still reads
  `InkHeron--Speed-Dating-App`, which may need cleanup later.

## 2026-06-25 — Phase 1 Step 1 DNS verified
- Phase/Step worked: Phase 1, Step 1.1
- Built: Verified `inkpad.inkheron.app` A record resolves to `167.172.71.219`.
- Decisions: Target host is `inkpad.inkheron.app`, not apex `inkheron.app`.
- Open / next: Phase 1, Step 1.2 base server hardening.
- Gotchas hit: none.

## 2026-06-25 — Buildbook foundation created
- Phase/Step worked: pre-build setup
- Built: CLAUDE.md, buildbook/INDEX.md, this file. Student + teacher UI mockups already exist.
- Decisions: Writing portal is day-one; Tests portal later. SQLite. Node/Fastify wrapper.
  Singapore droplet. Porkbun DNS-only. Hashed passwords, teacher-reset only. Word count always on.
  Targets coach (explain), grammar codes answer-free, strengths expand. Paste detection day-one.
- Open / next: write remaining phase files (1–8), then begin Phase 1.
- Gotchas hit: none yet. (Watch: nginx WebSocket headers for Etherpad; custom paste plugin is the
  main time-risk.)

## 2026-06-26 — Audit and bug fix: steps 1.1–3.2 review
- Phase/Step worked: audit of all completed steps 1.1 through 3.2
- Built: Fixed a bug in `src/app.js` where `buildApp` accepted `etherpadService` in options but
  did not forward it to `registerPadRoutes`, causing pads tests to hit the real Etherpad client
  instead of the fake. One-line fix: pass `etherpadService: options.etherpadService` in the
  `registerPadRoutes` call. All 25 tests now pass.
- Decisions: No other issues found. Steps 1.1–3.2 are complete and correct per spec.
- Open / next: Phase 3, Step 3.3 — hand the student into their pad (mint Etherpad session cookie
  client-side and load the pad in the wrapper shell).
- Gotchas hit: Tests must be run under Node 24 (nvm use). Node 20 (macOS default) lacks
  node:sqlite and fails immediately.

## 2026-06-26 — Phase 3 Step 3.1 Etherpad HTTP API wired to wrapper
- Phase/Step worked: Phase 3, Step 3.1
- Built: Added `src/etherpad/api.js` with `EtherpadApiClient` and `EtherpadService` classes.
  The client wraps Etherpad's HTTP API (group, author, session, pad) using `fetch`, reads
  `ETHERPAD_API_URL` and `ETHERPAD_API_KEY`, and surfaces API error codes. The service layer
  maps InkHeron concepts to Etherpad primitives: `ensureClassGroup(classId)`,
  `ensureStudentAuthor(studentId, displayName)`, `createSessionCookie(groupId, authorId)`,
  and `createAssignmentPad(classId, assignmentId, studentId, initialText)`. Added
  `test/etherpad.test.js` with mocked `fetch` covering missing key, endpoint routing,
  session creation, pad creation, cookie formatting, and error handling.
- Decisions: Kept the client thin and synchronous-looking (async call per method) so future
  phases can inject it. Used `class:${classId}` and `student:${studentId}` mappers so Etherpad
  reuses stable group/author IDs across calls. The actual pad id stored in our DB will be the
  Etherpad `groupID$padName` string.
- Open / next: Phase 3, Step 3.2 one pad per (student, assignment).
- Gotchas hit: Initial tests set `client._fetch` but the implementation called global `fetch`;
  updated the call to use `this._fetch ?? fetch` so injection works.

## 2026-06-26 — Phase 2 Steps 2.5 and 2.6 finished
- Phase/Step worked: Phase 2, Steps 2.5 and 2.6
- Built: Added `PATCH /api/students/:id/reset-password` for teachers, plus a minimal roster page
  at `/teacher/students` to trigger resets. Added CSRF protection via per-session tokens
  returned in `/api/me` and checked on all state-changing POST/PATCH/DELETE routes.
  Session cookies already had `maxAge: 1 day`; CSRF tokens live in the same session. Updated all
  public pages (`login.html`, `student-change-password.html`, `teacher-login.html`,
  `teacher/index.html`, `teacher/students.html`) to fetch and send the CSRF token. Updated tests
  to create a teacher session first and include both session cookie and CSRF token for
  protected routes. Added tests for teacher reset flow and missing/wrong CSRF tokens.
- Decisions: The reset endpoint returns the temporary password once; the teacher reads it to the
  student. `/api/setup/teacher` stays intentionally open (one-time only). Identity routes are
  now teacher-only for read as well as write, because roster/class data is not student-visible.
- Open / next: Phase 3 writing surface.
- Gotchas hit: Initial CSRF implementation generated a fresh token for the response that did not
  match the session; fixed by storing one token in `session.csrfToken` and returning it.

## 2026-06-26 — Phase 3 Step 3.4 wrapper shell around the pad
- Phase/Step worked: Phase 3, Step 3.4
- Built: Added `src/views/write.js` with `renderWriteView({ title, dueAt, spellcheck, etherpadPadId })`.
  Generates the full write-view HTML (writetop bar, duebar, padwrap/padframe with iframe, writeactions
  with Save and Submit buttons) matching the inkheron_student_v2.html mockup. Uses design tokens from
  /assets/styles.css plus inline write-view CSS. XSS-safe via `esc()` helper. Updated
  `GET /write/:assignmentId` to render this HTML (with sessionID cookie set) instead of redirecting.
  Updated pads.test.js assertions to check for 200 HTML, title presence, iframe element, and pad URL;
  29/29 tests pass.
- Decisions: Settings JSON defaults `spellcheck` to true when the field is absent. Save and Submit
  buttons are present but wired in Steps 3.7 and 4.x. Due date formatted server-side with
  `toLocaleString` (en-US locale).
- Open / next: Phase 3, Step 3.5 Etherpad plugins installed on the droplet.
- Gotchas hit: none.

## 2026-06-26 — Phase 3 Step 3.3 hand student into pad
- Phase/Step worked: Phase 3, Step 3.3
- Built: Added `GET /write/:assignmentId` route in `src/routes/pads.js`. Provisions or reuses
  the pad (via extracted `provisionPad` helper shared with the JSON API route), creates an
  Etherpad session, sets `sessionID` cookie (`Path=/; SameSite=Lax; HttpOnly`) on the response
  so Etherpad can read it (same domain), and redirects to `/p/{etherpadPadId}`. Added 4 tests:
  redirect + cookie, reuse on repeat visit, 403 for wrong class, 401 unauthenticated. 29/29
  tests pass. Also extracted `resolveAssignmentAndStudent` helper to avoid duplication between
  the JSON and redirect routes.
- Decisions: Route redirects to raw Etherpad for now; Step 3.4 will replace the redirect target
  with a wrapper-shell page embedding the pad in an iframe. Cookie is HttpOnly because Etherpad
  reads it server-side, not client-side JS.
- Open / next: Phase 3, Step 3.4 wrapper shell around the pad.
- Gotchas hit: none.


---

## 2026-06-28 — Baseline audit and paste block deploy fix
- Phase/Step worked: Audit through Phase 5 before Phase 6
- Built: Re-ran the local suite on Node 24 with 46/46 passing. Re-applied the missing
  `src/views/write.js` direct-DOM paste detection and `paste_block` intra-pad copy allowance to
  `/opt/inkheron-platform/src/views/write.js` on the droplet, then restarted
  `inkheron-wrapper`.
- Decisions: Paste detection remains direct DOM access in `write.js`; the Etherpad plugin stays
  abandoned because Etherpad v3 rejects non-npm plugin loading at startup.
- Open / next: Phase 6 teacher dashboard.
- Gotchas hit: Droplet does not have `rg`, so deploy verification used `grep`.

## 2026-06-26 — Phase 5 + paste_block deployed to droplet
- Phase/Step worked: Phase 5 full deployment + paste_block addon
- Built:
  - Switched paste detection from Etherpad plugin to direct same-origin DOM access in
    write.js (parent frame traverses ace_outer -> ace_inner, attaches beforeinput/input).
    Plugin approach abandoned — Etherpad v3 pnpm workspace rejects non-npm plugins.
  - paste_block setting (settings_json): blocks external paste via preventDefault;
    intra-pad paste allowed by tracking copy/cut events inside the pad (lastCopyFromPad flag).
  - 46/46 tests pass locally.
- Droplet state:
  - nginx: inkpad.inkheron.app routes wrapper paths (api/login/write/etc) to :3000,
    everything else (Etherpad JS/CSS/pads/socket.io) to :9001. WORKING.
  - Etherpad APIKEY at /opt/etherpad-lite/APIKEY.txt, set in inkheron-wrapper service env.
  - AUTHENTICATION_METHOD=apikey set in etherpad service drop-in.
  - ep_inkheron_paste in local_plugins/ but NOT loading (Etherpad v3 ignores it).
    Detection is handled client-side in write.js instead — plugin is dead code on droplet.
  - write.js paste_block patch NOT yet applied to droplet (SSH dropped mid-deploy).
    Next session: re-apply the write.js patch (intra-pad paste allowance).
  - Test data: class_id=2, student teststudent/test12345, assignment id=1.
- Gotchas:
  - Etherpad v3 tries to fetch custom plugins from npm on startup — fails 404, skips them.
    local_plugins/ directory exists but doesn't bypass this. Direct DOM is the right approach.
  - ETHERPAD_API_KEY appended outside [Service] block initially — fixed with sed.
  - Node 20 in PATH — always nvm use before running tests locally.

---

## 2026-06-26 — Phase 5 paste detection — Steps 5.1-5.3 complete
- Phase/Step worked: Phase 5, Steps 5.1, 5.2, 5.3
- Built:
  - ep_inkheron_paste plugin (src/etherpad/ep_inkheron_paste/): package.json, ep.json,
    static/js/index.js — postAceInit hook, beforeinput+input listener pair on ACE inner
    document, fires ih_paste_event postMessage to wrapper shell on insertFromPaste events
    of 5+ chars. Minimum 5 chars prevents false positives from autocomplete.
  - Write view (src/views/write.js): injects PAD_ID and CSRF_TOKEN JS vars, message
    listener relays ih_paste_event to POST /api/pads/:padId/paste-event fire-and-forget.
  - Paste event endpoint (src/routes/pads.js): validates pad ownership, writes paste_events
    row (at, length, input_type). Requires student session + CSRF.
  - test/paste.test.js: 4 tests — store event, reject zero length, reject unauthenticated,
    reject cross-student pad access. 46/46 pass.
- Decisions: postMessage relay pattern keeps auth out of the plugin entirely. Server-side
  timestamp (datetime('now')) used, not client-supplied, for reliability.
- Open / next: Step 5.4 (surface flags on teacher dashboard) deferred to Phase 6.
  Plugin needs deploying to droplet (copy to Etherpad src/node_modules/ + restart Etherpad).
  Wrapper code (pads.js, write.js) needs deploying to droplet.
- Gotchas: Node 20 in PATH fails all tests — must nvm use in InkHeron-Platform/ first.

---

## 2026-06-26 — Tests failing — Node version mismatch diagnosed
- Built: nothing; diagnosed and resolved test failure
- Gotcha: `node --test` was running against the shell's default Node 20; project requires
  Node 24 (uses `node:sqlite`). `.nvmrc` already set to v24.18.0. Fix: `nvm use` inside
  InkHeron-Platform/ before running tests. 42/42 pass on Node 24.
- Nginx proxy fix command prepared (inkpad.inkheron.app → proxy_pass 3000/9001 instead of
  try_files). Pending user running command on droplet.

---

## 2026-06-26 — Phase 4 complete — assignment lifecycle and submission
- Phase/Step worked: Phase 4, Steps 4.1–4.6
- Built:
  - 4.1 `src/routes/assignments.js`: teacher CRUD (POST/GET/PATCH/DELETE /api/assignments),
    `buildSettingsJson` enforces word_count=true and paste_detection=true always; student
    `GET /api/student/assignments` returns assignments with derived status.
  - 4.2 opens_at enforcement in /write/:id and /api/assignments/:id/pad (403 not_open_yet).
  - 4.3 `POST /api/pads/:padId/submit` in pads.js: writing→submitted transition, submissions
    row, returns `locked: true` for exam behaviour.
  - 4.4 `applyDueDateLock` in pads.js: on-open check, auto-transitions writing→submitted +
    creates submission row when due_at has passed; renders locked view.
  - 4.5 `src/services/serverChan.js`: reads serverchan_key from settings table, fires
    Server酱 push on submit; silent no-op if key unset.
  - 4.6 `deriveStatus` in assignments.js maps pad/submission state to dashboard pills
    (upcoming/not_started/in_progress/submitted/marked/needs_rewrite/closed/resubmitted).
  - `src/views/locked.js`: renders the "Assignment closed" locked view.
  - Registered registerAssignmentRoutes in app.js.
  - 42/42 tests pass (added assignments.test.js and submissions.test.js).
- Decisions: due-date lock creates a submission row so the teacher sees the work even if
  the student never clicked Submit. Server酱 failures are fire-and-forget (`.catch(()=>{})`).
  CSRF tokens required on all state-changing student routes.
- Open / next: Phase 5 — paste detection plugin.
- Gotchas hit: none.

## 2026-06-26 — Phase 3 Step 3.5 Etherpad plugins installed on droplet
- Phase/Step worked: Phase 3, Step 3.5
- Built: Installed ep_headings2, ep_align, ep_comments_page, ep_countable, ep_stable_authorid
  directly into /opt/etherpad-lite/src/node_modules by curling each tarball from npmmirror
  and extracting with tar --strip-components=1. Etherpad restarted and confirmed active.
- Decisions: Bypassed pnpm entirely — pnpm's content store was empty so any `pnpm add`
  triggered a full workspace re-download (hundreds of packages, timed out twice). Direct
  tarball extraction is safe for production; pnpm lock file not updated but Etherpad loads
  plugins by scanning node_modules for ep_* packages, not from lock file.
- Open / next: Phase 3 exit check, then Phase 4 assignment lifecycle.
- Gotchas hit: `pnpm -w` failed (not a workspace root); `npm install` failed (link: protocol);
  `pnpm --filter ep_etherpad-lite add` timed out on both npmjs.org and npmmirror due to
  empty pnpm store. Tarball-direct approach was the fix.

## 2026-06-26 — Phase 3 Steps 3.5–3.7 plugins, spellcheck, save-state
- Phase/Step worked: Phase 3, Steps 3.5, 3.6, 3.7
- Built: Added all client-side JS to `src/views/write.js`:
  - Step 3.6: `SPELLCHECK` boolean injected server-side as a safe literal. Chrome note already
    reflects the flag (done in 3.4). After iframe loads, JS walks into Etherpad's nested ACE
    editor iframe to set `spellcheck="true/false"` on the contenteditable surface, with 20 retries
    at 500 ms intervals (inner frame loads after outer).
  - Step 3.7: Save-state indicator listens for `change`/`commit` postMessages from the Etherpad
    iframe and shows "Saving... → Saved ✓". Save button triggers a brief Saving/Saved cycle as
    psychological confirmation. Word count polls the iframe DOM every 2 s for ep_countable's
    `.ep_countable_words` element (same-origin, so accessible once the plugin is installed).
  - Step 3.5: ops step — install 5 plugins on the droplet (see commands above in SESSION_NOTES).
    Not yet done; plugins required for word count and full spellcheck to function in-browser.
- Decisions: `spellcheckJs` is emitted as `true`/`false` literal (not string interpolation of
  user data) so there is no XSS path. Word-count sync does not start until iframe `load` fires.
- Open / next: Step 3.5 must be completed on the droplet (install plugins, restart etherpad).
  After that: Phase 3 exit check, then Phase 4 assignment lifecycle and submission.
- Gotchas hit: none (browser-level verification of 3.6/3.7 requires the droplet with plugins).

## 2026-06-28 — Phase 7 Step 7.4 student dashboard surfacing
- Phase/Step worked: Phase 7, Step 7.4
- Built: Replaced the root placeholder with a real student dashboard shell. Logged-in students
  now see returned green-pen work as a prominent `Feedback ready` card, action cards, status
  pills and a due-date timeline. Teachers are sent to `/teacher`, password-change students are
  sent to `/student/change-password`, and unauthenticated visitors see sign-in links.
- Verification: Ran `node --test test/*.test.js` with 55/55 passing and parsed the inline
  dashboard script with Node. Deployed `public/index.html`, restarted the wrapper, patched nginx
  so exact `/` routes to the wrapper while Etherpad routes remain on Etherpad, then verified
  public HTTPS root, `/p/inkheron-check`, audit student login and assignment status
  `needs_rewrite`. Wrapper, Etherpad and nginx log scans showed no new errors.
- Decisions: Kept nginx routing narrow with `location = /` so the Etherpad catch-all still owns
  pad assets, sockets and `/p/...`.
- Open / next: Phase 7, Step 7.5 resend revised version.

## 2026-06-28 — Phase 7 Step 7.5 resend revised version
- Phase/Step worked: Phase 7, Step 7.5
- Built: Added `POST /api/pads/:padId/resubmit` for student-owned `green_pen_open` pads. Resend
  now requires CSRF, transitions the pad to `resubmitted`, creates a fresh submission row, locks
  the pad and sends the ServerChan notification with `resubmitted work` wording. Wired the
  green-pen `Resend when ready` button to call the endpoint and return students to the dashboard.
- Verification: Ran focused `test/submissions.test.js`, full `node --test test/*.test.js` with
  56/56 passing and `node --check` on the changed modules. Deployed the route, view and notifier
  to the droplet, restarted the wrapper, then verified the audit student moved assignment 2 from
  `needs_rewrite` to `resubmitted`; `/write/2` locked and hid the resend button. Live wrapper,
  Etherpad and nginx log scans showed no new errors.
- Decisions: A revised version is recorded as a new `submissions` row against the same Etherpad
  pad, relying on Etherpad timeslider history for the text version rather than adding a new
  snapshot column in this step.
- Open / next: Phase 7 exit check, then move to the next phase/spec.

## 2026-06-28 — Phase 8 Step 8.1 settings storage
- Phase/Step worked: Phase 8, Step 8.1
- Built: Added a server-side settings store over the existing `settings` table with known secret
  keys `openrouter_api_key` and `serverchan_key`. Added teacher-only `GET /api/settings` and
  CSRF-protected `PATCH /api/settings`; reads return only `is_set`, `masked` and `updated_at`,
  never raw values. Unknown-only writes return `settings_required`.
- Verification: Added `test/settings.test.js` covering masking, raw DB persistence, teacher-only
  access, missing CSRF and unknown-key rejection. Ran focused settings tests and the full suite:
  59/59 passing. Deployed the API to the droplet, restarted the wrapper, verified live teacher
  read access, missing-CSRF rejection and student denial without modifying production secrets.
  Live wrapper and nginx log scans showed no new errors.
- Decisions: Did not run a live dummy-key write because overwriting production secret settings,
  even temporarily, was blocked as avoidable disruption risk. Local tests prove write and mask
  behavior against isolated databases.
- Open / next: Phase 8, Step 8.2 teacher settings screen.

## 2026-06-28 — Phase 8 Step 8.2 teacher settings screen
- Phase/Step worked: Phase 8, Step 8.2
- Built: Added `/teacher/settings`, guarded by teacher session middleware, and linked it from the
  teacher dashboard. The page loads masked OpenRouter and ServerChan key state from
  `/api/settings`, saves new pasted keys through the CSRF-protected settings API, clears password
  fields after save and never renders raw stored values.
- Verification: Added coverage to `test/settings.test.js` for teacher-only page access and the
  dashboard link. Ran focused settings tests, parsed the new page script and ran the full suite:
  60/60 passing. Deployed the page and route to the droplet, restarted the wrapper, then verified
  live teacher access, dashboard link and student 403 without modifying production secrets. Live
  wrapper and nginx log scans showed no new errors.
- Decisions: Live save was not exercised against production secrets; the isolated local API test
  remains the proof for write-and-mask behavior.
- Open / next: Phase 8, Step 8.3 test-key buttons.

## 2026-06-28 — Phase 8 Steps 8.4–8.5 roster UI and OpenRouter module
- Phase/Step worked: Phase 8, Steps 8.4 and 8.5
- Built:
  - 8.4: Rebuilt `public/teacher/students.html` into full roster management. Classes panel:
    create/rename (prompt)/delete as chips. Students panel: add with name+username+password+class,
    filter by class, inline edit (name/username/class), reset password (temp pw shown once),
    delete. All CRUD via existing teacher+CSRF APIs. Route remains `/teacher/students`.
  - 8.5: `src/services/openRouter.js` — `resolveModel(db, intent)` fetches models list from
    OpenRouter, fuzzy-resolves via `resolveOpenRouterModel`, caches result in module-level Map.
    `callChat(db, { intent, messages, maxTokens, temperature })` reads key from DB, resolves
    model, POSTs to `/chat/completions`; on 404 clears cache and re-resolves once (survives
    model rename). Both accept `fetchImpl` for unit-test injection. Logs resolved model id.
    5 unit tests in `test/openRouter.test.js` using `DatabaseSync` + fakeImpl. 72/72 pass.
- Decisions: `db` passed as a parameter (not Fastify-decorated) so the module works from any
  context without coupling to the app lifecycle.
- Open / next: Phase 8 exit check (set/test both keys, manage roster, verify AI call routes
  through the module); then Phase 9.
- Gotchas hit: `app.db` not exposed by Fastify app — tests use `DatabaseSync` on the same file.

## 2026-06-28 — Phase 8 Step 8.4 class and student management
- Phase/Step worked: Phase 8, Step 8.4
- Built: Rebuilt `public/teacher/students.html` into a full roster management page.
  Classes panel: list as chips with rename (prompt) and delete. Add class form inline.
  Students panel: filter by class, add student form (name/username/password/class), per-row
  inline edit (name/username/class), reset password (shows temp password once), delete.
  All actions call existing CRUD APIs with CSRF. No backend changes needed.
  67/67 tests pass. Deployed, healthz confirmed.
- Decisions: Kept rename as a `prompt()` dialog to avoid extra inline form complexity.
  Delete class tells teacher to move students first (API returns 400 on FK constraint).
- Open / next: Phase 8, Step 8.5 OpenRouter call module.
- Gotchas hit: none.

## 2026-06-28 — Phase 8 Step 8.3 test-key buttons
- Phase/Step worked: Phase 8, Step 8.3
- Built: Added server-side OpenRouter and ServerChan test endpoints, both teacher-only and CSRF
  protected. OpenRouter validates the stored key with `/api/v1/key`, loads `/api/v1/models` and
  returns a resolved model without exposing the key. ServerChan sends a test push and returns a
  clear success or failure. Added Test buttons to the teacher settings screen.
- Verification: Added mocked-network tests for successful key checks, missing-key checks, access
  control and OpenRouter model resolution. Ran focused settings tests, parsed the settings page
  script and ran the full suite: 66/66 passing. Deployed the endpoints and corrected page to the
  droplet, then verified live page wiring and missing-CSRF rejection without firing real key
  tests. Live wrapper and nginx log scans showed no new errors.
- Decisions: Did not trigger live OpenRouter or ServerChan tests because that could consume API
  quota or send a real notification from production keys.
- Open / next: Phase 8, Step 8.4 class and student management.

## Archived from SESSION_NOTES.md on 2026-07-01

## 2026-06-29 — Teacher tab: class import, timeslider wrapper, new assignment
- Phase/Step worked: Phase 8 teacher UX polish
- Built:
  - Fixed "Manage classes" dashboard link (was `#`, now `/teacher/students`)
  - students.html: drag-drop CSV/Excel import using self-hosted SheetJS; preview
    table with editable names/usernames and per-row skip toggle; bulk import uses
    temp password `ChangeMe1` with must_change_password flag
  - timeslider.html: InkHeron wrapper with "Back to assignments" nav bar, iframe
    loads `/api/pads/{id}/timeslider`, CSS injection hides "Return to pad" button
  - review.html: timeslider button now opens the wrapper instead of raw redirect
  - new-assignment.html: full create form with title, class, type, dates, submit
    behaviour, spellcheck, green pen, writing prompt (stored in settings_json)
  - assignments.html: "+ New assignment" button added
  - app.js: routes for `/teacher/timeslider` and `/teacher/new-assignment`
  - assignments.js: `buildSettingsJson` passes through prompt field (capped 4k)
  - public/xlsx.mini.min.js: self-hosted SheetJS 0.18.5 mini bundle
- Decisions: prompt stored in settings_json blob (no migration needed). Import
  temp password is hardcoded `ChangeMe1`; must_change_password forces reset.
- Open / next: Strengths and Targets upload + AI marking suggestions (Phase 8.6)
- Gotchas hit: app.js must be synced separately from src/routes/

## 2026-06-28 — Etherpad UI cleanup (hide non-formatting chrome)
- Phase/Step worked: Phase 8 housekeeping / write view polish
- Built: Added `applyPadUiCleanup()` to `src/views/write.js`. Injects a `<style>` element into
  the Etherpad outer iframe document hiding: bottom toolbar icons (timeslider, settings, embed,
  import/export, showusers), chat button/panel, user count. Retries up to 20 times at 400ms
  so it lands after Etherpad finishes loading. Deployed to `/opt/inkheron-platform/` via rsync,
  restarted `inkheron-wrapper.service`.
- Decisions: CSS injection into iframe.contentDocument is possible because nginx serves both
  the wrapper and Etherpad on the same origin. Formatting toolbar (B/I/U/lists/align) is not
  touched — only non-essential chrome is hidden.
- Open / next: Phase 9 Tests portal, or next Phase 8 step.
- Gotchas hit: SSH hostname `inkheron.app` does not resolve in this environment; must use IP
  `167.172.71.219`. Droplet path is `/opt/inkheron-platform/`, service name is
  `inkheron-wrapper.service` (systemd, not PM2).

## 2026-06-28 — Phase 7 Step 7.3 student green-pen view
- Phase/Step worked: Phase 7, Step 7.3
- Built: Added `renderGreenPenView` and wired `/write/:assignmentId` to show it when the pad is
  `green_pen_open`. The view embeds the real Etherpad pad for editing, shows an answer-free coded
  snapshot, literacy code legend, expandable coaching targets, expandable strengths and a resend
  button placeholder for Step 7.5. Deployed and verified live on `/write/2`.
- Decisions: The green-pen page keeps actual rewriting in Etherpad and presents feedback beside
  it, so editing remains on the proven pad surface.
- Open / next: Phase 7 Step 7.4 prominent dashboard surfacing.
- Gotchas hit: none.

## 2026-06-28 — Phase 7 Step 7.2 green-pen reopen
- Phase/Step worked: Phase 7, Step 7.2
- Built: Added `POST /api/submissions/:submissionId/finish-marking` to move green-pen
  assignments to `green_pen_open` and non-green-pen assignments to `marked`. Marked/resubmitted
  pads now render a locked view unless explicitly reopened. Deployed and verified live against
  the audit assignment: finish marking sets `green_pen_open`, student dashboard shows
  `needs_rewrite`, and `/write/2` reopens the editor.
- Decisions: Reopen is explicit on finish-marking, not an implicit side effect of saving a grade.
- Open / next: Phase 7 Step 7.3 student green-pen view.
- Gotchas hit: First rsync target was too broad; corrected by syncing exact remote paths.

## 2026-06-28 — Phase 7 Step 7.1 feedback attachment
- Phase/Step worked: Phase 7, Step 7.1
- Built: Added `POST /api/submissions/:submissionId/codes` for teacher/analyzer attachment of
  inline literacy codes, replacing existing codes with validated spans and metadata. Review API
  now reads codes through the shared helper. Deployed to droplet and verified live with audit
  teacher, audit submission, valid code save, invalid span rejection and review retrieval.
- Decisions: Codes remain answer-free metadata only: span, code, category and optional label.
  Strengths/targets continue through the existing `submission_feedback` endpoint.
- Open / next: Phase 7 Step 7.2 marking reopens green-pen assignments.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 bug hunt and Etherpad fixes
- Phase/Step worked: Post-Phase 6 bug hunt
- Built: Ran deployed HTTP audit across teacher/student login, CSRF, role guards, Etherpad pad
  provisioning, write shell, paste event, submit, dashboard, review, feedback, grade, release,
  CSV and replay. Fixed production session config by adding a real
  `INKHERON_SESSION_SECRET`, `INKHERON_SESSION_SECURE=true` and `INKHERON_TRUST_PROXY=true` on
  the droplet. Added app support for `INKHERON_TRUST_PROXY=true`. Fixed replay redirect to
  Etherpad v3's required `/timeslider?embed=1`.
- Decisions: Production wrapper now trusts nginx forwarded HTTPS headers so Secure session
  cookies are issued correctly. Timeslider replay uses the embedded Etherpad history route.
- Open / next: Browser plugin navigation still timed out before page load, so the completed pass
  is HTTP/API plus remote log verification, not visual browser automation.
- Gotchas hit: Secure cookies silently failed without Fastify trustProxy. Etherpad v3 redirects
  legacy `/p/:pad/timeslider` back to the pad unless `embed=1` is present.

## 2026-06-28 — Phase 6 exit check and deployment
- Phase/Step worked: Phase 6 exit check and deploy
- Built: Re-ran full local suite with 52/52 passing, deployed the platform to
  `/opt/inkheron-platform`, restarted `inkheron-wrapper`, verified public `/healthz`, confirmed
  migrations `004_submission_codes.sql` and `005_submission_feedback.sql` applied on the droplet,
  and rechecked the remote `write.js` paste_block patch.
- Decisions: Phase 6 is deployed on the existing nginx + wrapper + Etherpad split.
- Open / next: Phase 7 green-pen loop.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 Step 6.8 carry-forward targets
- Phase/Step worked: Phase 6, Step 6.8
- Built: Review API now returns the most recent previous assignment targets for the same student,
  and the review page shows those targets above the current strength/target selectors.
- Decisions: Carry-forward reads the latest earlier assignment with target feedback by assignment
  creation time and id, then shows all targets from that assignment.
- Open / next: Phase 6 exit check and deploy.
- Gotchas hit: Test fixture initially inserted previous targets without destructuring the seeded
  class/student ids.

## 2026-06-28 — Phase 6 Step 6.7 CSV export
- Phase/Step worked: Phase 6, Step 6.7
- Built: Added `GET /api/assignments/:id/export.csv` with student name, username, status,
  submitted time, grade, grade state, paste flag and paste count. Added Export CSV button to the
  assignment dashboard.
- Decisions: CSV uses the same server-derived dashboard status and paste fields as the UI.
- Open / next: Phase 6 Step 6.8 carry-forward targets.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 Step 6.6 grades and release all
- Phase/Step worked: Phase 6, Step 6.6
- Built: Added held grade save route `POST /api/submissions/:submissionId/grade`, release route
  `POST /api/assignments/:id/release-grades`, dashboard held/released labels, review page grade
  save button and release-all button on the assignment dashboard.
- Decisions: Saving or editing a grade resets it to held. Release all flips every graded
  submission for that assignment to released together.
- Open / next: Phase 6 Step 6.7 CSV export.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 Step 6.5 strengths and targets
- Phase/Step worked: Phase 6, Step 6.5
- Built: Added `submission_feedback` storage, a small feedback library, selected feedback in the
  review payload, and `POST /api/submissions/:submissionId/feedback` with CSRF. Review page now
  loads multi-select strengths/targets and saves selected feedback.
- Decisions: Feedback options are app-owned seed data for now. Writing Analyzer still owns any
  future generated suggestions.
- Open / next: Phase 6 Step 6.6 grade entry and release all.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 Step 6.4 literacy coding view
- Phase/Step worked: Phase 6, Step 6.4
- Built: Added `submission_codes` storage for analyzer-provided inline codes, returned codes in
  the teacher review API, and wired the review page Literacy codes button to toggle coded text
  with answer-free inline marks and a code/category legend.
- Decisions: InkHeron stores and renders codes only. Code generation/import remains a Phase 7
  boundary with the Writing Analyzer.
- Open / next: Phase 6 Step 6.5 strengths and targets selection.
- Gotchas hit: Step 6.4 depends on Phase 7 data, so this step builds the display/storage boundary
  and handles the no-code case cleanly.

## 2026-06-28 — Phase 6 Step 6.3 timeslider replay
- Phase/Step worked: Phase 6, Step 6.3
- Built: Added teacher author mapping in Etherpad, `GET /api/pads/:padId/timeslider` to issue
  an Etherpad session cookie and redirect to the exact pad timeslider, and wired the review
  page replay button to that route.
- Decisions: Timeslider access is a server-side authenticated redirect so the browser receives
  the right Etherpad cookie without exposing API credentials.
- Open / next: Phase 6 Step 6.4 literacy coding view.
- Gotchas hit: Fastify returns multiple Set-Cookie headers as an array in tests.

## 2026-06-28 — Phase 6 Step 6.2 review surface
- Phase/Step worked: Phase 6, Step 6.2
- Built: Added teacher review API `GET /api/pads/:padId/review`, Etherpad `getPadText`
  helper, `/teacher/review` page, and Review links from the assignment dashboard. Review page
  shows student metadata, submission state, paste evidence, submitted text, timeslider and codes
  buttons, strength/target selectors and grade field.
- Decisions: Text is fetched server-side from Etherpad for review. Saving marks remains deferred
  to Steps 6.5 and 6.6.
- Open / next: Phase 6 Step 6.3 timeslider replay button.
- Gotchas hit: none.

## 2026-06-28 — Phase 6 Step 6.1 assignment dashboard
- Phase/Step worked: Phase 6, Step 6.1
- Built: Added `GET /api/assignments/:id/dashboard` for teacher roster progress with status,
  submission time, paste counts, paste totals and scores. Added `/teacher/assignments` with an
  assignment picker, status and paste filters, sort controls, summary counters and roster table.
- Decisions: Teacher dashboard status is derived server-side so later review, CSV and release
  steps can reuse one source of truth.
- Open / next: Phase 6 Step 6.2 review surface.
- Gotchas hit: Initial dashboard tests accidentally used the real Etherpad client. Switched them
  to the fake Etherpad service used by existing pad tests.

## 2026-06-29 — AP Lang dashboard read pass
- Asked: Inspect and understand sibling project `ap-lang-dashboard`, then report back.
- Did: Reviewed project tree, package metadata, Express/SQLite server, student library UI,
  admin UI, database table counts and current content state.
- Decisions: No code changes made to the AP Lang dashboard. Noted the admin topbar upload
  button has malformed inline JavaScript and the project currently has no documents or view logs.
- Open / next: Fix admin button syntax and consider tightening auth/logging if this app is going
  beyond local classroom use.

## 2026-06-29 — AP Lang PDF uploads and download toggle
- Asked: Allow AP Lang dashboard library uploads to accept PDFs, add an upload toggle for student
  downloads versus view-only, let students download when enabled and fix the admin upload button bug.
- Did: Updated `ap-lang-dashboard` server and front ends for PDF metadata, download routing,
  upload UI toggle, student viewer download visibility and admin library download toggles. Fixed
  the malformed admin topbar upload button.
- Verification: `node --check server.js`, front-end script parse checks, local server smoke test
  for downloadable PDF `200` and view-only PDF `403`. Test uploads were deleted afterward.
- Commit: `df29f56` in `/Users/brendansmit/Documents/Claude/ap-lang-dashboard`.
- Notes: The tracked `ap-lang.db` and local image assets were already dirty or local and were not
  included in the commit.

## 2026-06-29 — AP Lang deploy clarification
- Asked: Shared a screenshot where the upload UI still showed the old HTML-only copy.
- Did: Verified local source already had the PDF upload and student-download toggle changes.
- Decision: User confirmed the deployed app had not been updated yet, so no further code change
  was needed.

## 2026-06-29 — AP Lang admin table alignment
- Asked: Fix the admin library table alignment issue shown after adding the Download column.
- Did: Changed the Actions table cell back to normal table-cell layout and moved button flex
  alignment into an inner `.actions-row`. Centered the Download and Visible toggle cells.
- Verification: Parsed `public/admin.html` script, ran `node --check server.js`, ran
  `git diff --check`, started a local server and confirmed the updated admin HTML was served.
  Headless screenshot verification was attempted but blocked by local browser permissions.
- Commit: `495948b` in `/Users/brendansmit/Documents/Claude/ap-lang-dashboard`.

## 2026-06-29 — EAP landing page and library entry
- Asked: Add an `eap.inkheron.app` landing page with cards for Grammar Arcade, Inkpad and a file
  library adapted from the AP Lang dashboard.
- Did: Replaced root with a three-card EAP chooser, moved the existing student writing dashboard
  to `/student`, updated student login redirects, added `/library` with an AP Lang-style student
  library UI and added platform-native EAP library tables and public API routes.
- Decisions: Kept this pass student-facing only. Did not copy the AP Lang admin upload workflow
  because that is a larger multipart/admin surface.
- Verification: Focused route and migration tests passed with bundled Node 24. Local HTTP smoke
  test on port 3490 returned `200` for `/`, `/library`, `/api/library/docs` and
  `/api/library/categories`. Full suite still has unrelated pre-existing failures around student
  password defaults, roster copy and Etherpad wrapper expectations.

## 2026-06-29 — EAP library admin backend
- Asked: Add the obvious missing admin backend so files can actually be added to the EAP library.
- Did: Added `@fastify/multipart`, teacher-protected `/library/admin`, admin APIs for document
  upload, replace, edit, hide/show, download toggle, delete, categories and view logs. Linked the
  student library to the admin page.
- Decisions: Admin uses the existing InkHeron teacher session and CSRF token, not a separate
  library password.
- Verification: `node --check` for app and library routes passed. Focused route/admin tests passed
  with bundled Node 24, including real multipart upload/replace/delete. Local HTTP smoke test on
  port 3491 created a teacher, loaded `/library/admin`, uploaded an HTML file and downloaded it.
  Full suite still has the same unrelated six failures noted above.

## 2026-06-29 — EAP live deployment split
- Asked: Update the live droplet so `eap.inkheron.app` shows the new three-card EAP landing page
  and make deploy-dashboard updates hit the correct app.
- Did: Deployed `InkHeron-Platform` to `/opt/eap-platform` as PM2 app `eap-platform` on port
  `3466`, created a remote-only EAP env file, migrated the separate EAP SQLite database and updated
  nginx so `/` serves EAP while `/grammar-arcade/` serves the existing Grammar Arcade app. Patched
  Grammar Arcade for subpath-aware API and teacher links.
- Did: Updated the local deploy dashboard to default to EAP, use rsync deploys for EAP and keep
  Grammar Arcade deployable as `eap.inkheron.app/grammar-arcade/`.
- Verification: Live checks returned `200` for `https://eap.inkheron.app/`, `/library`,
  `/api/library/docs`, `/grammar-arcade/`, `/grammar-arcade/api/health` and
  `https://inkpad.inkheron.app/`. `/library/admin` correctly returned `401` when unauthenticated.

## 2026-06-30 — Force light mode on pad

- Asked: pad should always be white background / black text, no dark mode.
- Did: injected `color-scheme:light!important; background:#fff!important; color:#000!important;` into all three iframe documents (padDoc via ih-ui-cleanup, ace_outer and ace_inner via ih-author-suppress). Deployed, restarted. Committed feba54d.

## 2026-06-30 — Pad UI overhaul (toolbar size, dark bg, highlights, chat, submit)

- Asked: remove chat, remove purple highlights, fix dark grey background, fix zoom, make formatting buttons 50% bigger, wire up Submit button.
- Did:
  - Toolbar buttons: 26px→39px, font 13px→19px, SVGs rescaled, padchrome min-height 54px, colour swatches 16px→22px
  - Submit handler: POSTs to /api/pads/:id/submit with CSRF token; shows confirm dialog, disables button on success
  - Highlight fix: was setting cleanupDone=true before aceInner was ready. Now returns false until aceInner is also injected; retries up to 40×300ms
  - White background: added #innerdocbody, #outerdocbody, #editorcontainerbox to the injected CSS in both inner frames
  - Chat: expanded selector list to cover all EP 3.x chat element IDs/classes
- Deployed, restarted. Committed 9f57069.

## 2026-06-30 — Fix submit/zoom/undo-redo/dark-border + literacy coding bridge

- Asked: fix submit error, zoom, undo/redo arrows, dark grey border; bridge literacy codes to InkHeron on submit.
- Bugs fixed:
  - Submit: Content-Type:application/json with no body → Fastify rejected. Removed header.
  - Zoom: was injecting CSS into padDoc, but #editorcontainerbox is in ace_outer. Moved target.
  - Undo/redo: unicode chars rendered poorly at large size. Replaced with SVG paths.
  - Dark border: EP sets body background-color via inline JS which beats !important. Now use element.style.setProperty('background','#fff','important') on aceOuter.body and #editorcontainerbox.
- Literacy bridge (literacyCoder.js):
  - On submit, background async task fetches pad text via EtherpadService.getText()
  - Splits into paragraphs, calls Claude Haiku via OpenRouter with Writing Analyzer prompt
  - Parses JSON array response, locates each quote span in text, saves to submission_codes
  - Results held (not student-visible) until teacher releases feedback
  - Deployed, restarted. Committed 215c055.

## 2026-06-30 — Fix grey border (root cause found)

- Root cause: CSS variables don't cross iframe boundaries. `var(--bg-color)` inside ace_outer was undefined, so `#editorcontainerbox` fell back to its hardcoded fallback `#f2f3f4` (grey). All prior JS/CSS injection attempts failed because they were fighting the wrong thing.
- Fix: patched `/opt/etherpad-lite/src/static/skins/colibris/src/layout.css` directly — hardcoded `#ffffff !important` on `#editorcontainerbox` and `#outerdocbody iframe`. Backup at layout.css.bak. No EP restart needed (static file). Browser needs Cmd+Shift+R to bust CSS cache.
- Committed bc005b9 (write.js cleanup only — EP file change is outside the InkHeron repo).

## 2026-06-30 — Fix word count + PDF zoom (context resumed)

**Asked:** Fix word count (showing ~7 words for ~18-word sentence) and PDF zoom slider (visually no effect).

**Word count fix:** Replaced `.ace-line querySelectorAll` approach with `body.innerText` directly on `#innerdocbody`. The ace-line approach was returning a partial/inconsistent set of DOM elements depending on EP internals, causing severe undercounting. `innerText` is robust against EP's DOM structure.

**PDF zoom fix:** Adding only a `#zoom=N` fragment to `iframe.src` doesn't force a reload when the base URL is unchanged — browsers treat hash-only navigations as same-document and skip reload. Fixed by appending `?_z=<timestamp>` to force the browser to treat it as a new URL, triggering a full iframe reload with the correct `#zoom=` parameter.

**Commit:** cfc69be

## 2026-06-30 — PDF.js canvas renderer for passage panel

**Asked:** Extract PDF text for more control, or move the broken zoom slider. Decided on Option A (PDF.js canvas renderer) to preserve images and get real zoom control.

**What was done:**
- Installed `pdfjs-dist` v5, copied `pdf.min.mjs` + `pdf.worker.min.mjs` to `public/static/pdfjs/`
- Replaced `<iframe>` passage panel with a `<div id="passagePdfPages">` container
- Added `<script type="module">` using PDF.js to render each page as a `<canvas>` element
- PDF auto-fits to the panel width at 100% zoom; slider re-renders at the chosen scale multiplier (50–200%)
- Removed broken `#zoom=` fragment approach entirely
- Static path: `/assets/static/pdfjs/` (Fastify prefix is `/assets/`, root is `public/`)

**Commit:** ea4ecea

## 2026-06-30 — Fix PDF scroll + draggable split panel

**Asked:** PDF panel not scrollable (renders as one long image). Add resizable split with 35/65 min ratio.

**Scroll fix:** Root cause was `body{min-height:100vh}` — body expands with content so `.passage-pdf-outer`'s `overflow:auto` never triggers. Fixed to `height:100vh; overflow:hidden`. Also added `min-height:0` to `.split-left` and `.passage-pdf-outer`.

**Divider:** Added `<div class="split-divider" id="splitDivider">` between panels. Mousedown on it starts drag; mousemove sets `.split-left` width as percentage of `.padcols` width clamped to [35%, 65%]. Turns green on hover/drag. Mobile: becomes a horizontal bar (cursor:row-resize).

**Commit:** 2cc2654

## 2026-06-30 — Toolbar pickers, stats bar, word count fix

**Asked:** Group colors into popup grid, add highlight picker, add lines/sentences to counter, fix layout shift, fix word count accuracy.

**Color picker:** Replaced 5 individual swatch buttons with a single "A" button that opens a 6-color grid popup (black, red, green, blue, orange, purple). Click outside or select a color to close.

**Highlight picker:** "H" button opens a 6-color pastel grid + remove option. Uses `execCommand('hiliteColor')` on ace_inner doc. Note: EP may wipe highlight on next changeset sync; a proper ep_highlight plugin would be needed for persistence.

**Word count fix:** Root cause identified — EP injects U+200B zero-width spaces between tokens. These are invisible but not matched by `/\s+/`, causing adjacent words to merge (undercount) and being counted as non-whitespace chars (overcount). Fixed by stripping U+200B, U+200C, U+200D, U+2060, U+FEFF before counting, and normalising U+00A0 to regular space.

**Stats bar:** Now shows w · c · l · s (words, chars, lines, sentences). Lines counted via `.ace-line` element count; sentences via `/[.!?]+(?=\s|$)/` match. Each number in a fixed-width `<span>` with `tabular-nums` to prevent layout shift.

**Commit:** 57514f4

## 2026-06-30 — Fix picker init killing IIFE, popup overflow clip

**Root cause of all three bugs (zero counters, buttons not working, EP cleanup not running):**
Color picker code ran BEFORE `setInterval(syncWordCount, 500)` and `iframe.addEventListener('load', ...)`. A null-ref error (`clrPopup.classList` when clrPopup could be null, inside `if (clrTrigger)`) silently stopped IIFE execution, so critical setup never ran.

**Fixes:**
1. Moved picker init to end of IIFE, wrapped in try/catch — errors there can't kill word count or pad load listener
2. Added `if (clrTrigger && clrPopup)` guard (was `if (clrTrigger)` only)
3. Popup: `position:fixed` with JS-set left/top from `getBoundingClientRect()` — `position:absolute` was clipped by `overflow-x:auto` on `.padchrome`

**Yellow auto-highlight:** Likely EP author color showing before cleanup CSS injection runs. Not a code bug from our changes.

**Commit:** e7ef94b


<!-- Archived from InkHeron-Platform/SESSION_NOTES.md on 2026-07-01 -->

## 2026-07-01 - EAP Library mobile + CDN fix

- Built:
  - `eap-library.html`: PDF mobile detection — on iOS/narrow screens, hides iframe and shows "Open PDF" button that opens the URL directly (iOS can't render PDFs in iframes). Viewer bar uses flex-wrap and 40px touch targets. Media query cleans up layout.
  - `eap-library-admin.html`: Mobile sidebar with slide-in transform, backdrop overlay, hamburger button in topbar; nav taps close sidebar.
  - Self-hosted Font Awesome 5.15.4 (CSS + woff2) at `public/static/fa/`. Added `/static/` fastifyStatic route in `src/app.js`. Both pages updated from CDN href to `/static/fa/css/all.min.css`. CDN was blocked by Great Firewall for students.
- Commits: 155b012 (mobile), d786084 (FA self-host), 87ec4b8 (/static/ route)
- Decisions: FA webfonts only include woff2 (modern browsers only — no .woff fallback needed given student device landscape).
- Open / next: Deploy to server to verify on real mobile device.

---

## 2026-07-01 - Network access question

- Asked: Whether Codex was struggling to connect to the network.
- Did: Explained that shell network access is restricted in this environment unless approval is granted, while other browsing tools may still be available depending on the task.
- Decisions: No project code changed.

---
## 2026-06-29 — Unread submission badge + password fixes
- Phase/Step worked: Phase 8 polish
- Built:
  - `GET /api/teacher/notifications` counts submissions since `notifications_cleared_at` in settings table (excluding demo/ghost). `POST /api/teacher/notifications/clear` updates the watermark.
  - Teacher dashboard shows red badge on Assignments tile when count > 0. Clears on assignments page load.
  - Reset password endpoint now always uses `ChangeMe1` (was `generateTempPassword()`). Frontend message updated accordingly.
  - `must_change_password` defaulted to 1 on new student creation. 53 existing students patched in DB.
  - ChangeMe1 shown in purple on roster while `must_change_password = 1`; nothing shown once changed.
- Decisions: Badge clears on page visit (not on per-submission view). Silent clear — no explicit dismiss button needed at this scale.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking. Also: investigate Server酱 pricing for WeChat notifications.
- Gotchas hit: All existing students had `must_change_password = 0` — needed one-off DB patch.

## 2026-06-29 — Fix cross-class student modal contamination
- Phase/Step worked: Phase 8 bug fix
- Built: `GET /api/assignments/:id/students` scoped to `WHERE s.class_id = assignment.class_id` (was returning all classes). `PUT /api/assignments/:id/students` now builds a `classStudentIds` set and silently skips any student IDs from other classes before inserting. Deployed commit `654a335`.
- Decisions: Cross-class IDs are silently dropped on PUT rather than errored — the scoped GET means the UI should never send them; error would only confuse a race condition edge case.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions.
- Gotchas hit: Session resumed from summary after context limit.

## 2026-07-01 - Native InkPad Phase 8 student writing profiles
- Asked: Keep the long-term student writing and voice profile goal built into the native InkPad work.
- Built: Added `015_student_writing_profiles.sql` with student writing profiles, literacy issue stats and literacy evidence. Literacy-code annotations now sync into student profile evidence and update total/open/resolved counts.
- UI/API: Review payloads include `student_profile`, teachers can fetch `/api/native/students/:studentId/profile` and the native review rail shows top tracked profile issues while marking.
- Verified: `node --check src/routes/nativePads.js` and Node 24 `--test test/migration.test.js test/nativePads.test.js` passed 8/8.
- Decision: This phase stores structured evidence only. AI-written summaries, voice analysis and personalised exam practice stay later phases built on these tables.

## 2026-07-01 - Native InkPad Phase 9 backup and recovery
- Asked: Add a backup of student work in case the server goes down and allow a teacher to upload or paste recovered student work.
- Built: Added teacher-only JSON backup export for all native pads or one assignment. Backup includes current pad data, revisions, annotations, paste events, rubric data and profile evidence.
- UI/API: Native review page now has an assignment backup download link, pasted-text recovery and `.txt` upload recovery. Imports can create a manual revision only or replace current pad text.
- Verified: Node 24 `--check src/routes/nativePads.js` and `--test test/migration.test.js test/nativePads.test.js` passed 9/9. Broader stable suite `--test test/etherpad.test.js test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 29/29.
- Decision: Recovery revisions use existing `manual` reason because the schema check does not allow `teacher_import`; detailed source is recorded in `native_teacher_events`.

## Archived from SESSION_NOTES.md on 2026-07-02
## 2026-06-29 — Prompt button + reference passage panel
- Phase/Step worked: Phase 8 student write view polish
- Built:
  - "Task" button in pad chrome opens a slide-down panel showing the assignment prompt. Panel closes/reopens on click; button label toggles between "Task" and "Hide task". No prompt = no button.
  - Reference passage: if an assignment has `passage_text` or a PDF, the write view splits into a left 340px passage panel and a right pad area.
  - Passage text stored in `settings_json.passage_text` (up to 20k chars).
  - PDF stored at `data/passages/{id}.pdf` via `PUT/DELETE/GET /api/assignments/:id/passage-pdf`. PDF endpoint accepts student or teacher sessions (no auth = 401).
  - Content type parser registered for `application/pdf` in assignments plugin.
  - Teacher edit view: new "Reference passage" card with Text tab (textarea) and PDF tab (file input + remove button). `openEdit` HEAD-checks for existing PDF; `saveEdit` includes `passage_text` in settings PATCH, then separately PUT-uploads PDF if a file is selected.
  - Prompt hint text updated: students can read it via the Task button (was "Students do not see this").
- Decisions: PDF uploaded only to the primary assignment in a multi-class group (first in editGroup). passage_text cleared from settings_json if textarea is empty on save — correct, expected behaviour.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions. Also: Server酱 pricing.
- Gotchas hit: SSH key not loaded in agent; needed `ssh-add` + `-i` flag; root user is the correct login.

## Archived from SESSION_NOTES.md on 2026-07-02
## 2026-06-29 — Write view polish (chrome, zoom, author colors, word count, alignment, color swatch)
- Phase/Step worked: Phase 8 write view polish
- Built:
  - Removed decorative dots and spellcheck label from pad chrome. Bar now shows only: Task button (if prompt exists) + word count + Zoom selector.
  - Word count moved into chrome bar; reads text directly from `ace_inner` iframe via `innerText` split, not ep_countable (which was never visible in the wrapper).
  - Zoom now targets `#editorcontainerbox` so formatting toolbar stays fixed; only the writing area scales.
  - Author color suppression: traverse outer iframe → `ace_outer[name]` → `ace_inner[name]`, inject `background:transparent!important` CSS into both. Previous code tried wrong selectors.
  - ep_colors color select: injected CSS makes it a 28px swatch; JS updates `backgroundColor` on change (targets `#color-selection`).
  - ep_align installed via `cd /opt/etherpad-lite/bin && tsx plugins.ts install ep_align`. Permissions on `plugin_packages` were root-owned; fixed with `chown -R inkheron:inkheron`. ep_align now loads and injects alignment buttons (left/center/justify/right) into the toolbar.
  - Etherpad toolbar config added to settings.json (previously fully commented out). Does NOT include alignLeft/Center/Right so ep_align auto-injects via its `eejsBlock_editbarMenuLeft` hook.
- Decisions: ep_countable and ep_headings2 are in `src/node_modules` but not loaded; only `plugin_packages` plugins load. Alignment buttons from ep_align auto-inject (don't add to toolbar config or they fail). Case-insensitive login added in previous session.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions.
- Gotchas hit: ep_align in `src/node_modules` is NOT loaded — only `plugin_packages`. ep_align installed via tsx but permissions were root after install, blocking load. ep_colors template uses `#color-selection` (not `#font-color`).

## Archived from SESSION_NOTES.md on 2026-07-02
- Phase/Step worked: Phase 8 write view fixes (session resumed from context summary)
- Built:
  - Removed ep_align@11.0.40 from plugin_packages (symlink + .versions folder). It was incompatible with EP 3.3.2 and caused `TypeError: U2 is not a function` crash for all students. Uninstall via tsx plugins.ts failed ("Expected at least one argument") — fixed by direct symlink removal.
  - Replaced ep_align with 3 custom alignment buttons (L/C/R SVG icons) in padchrome. Use `execCommand('justifyLeft/Center/Right')` on ace_inner. Visual-only in current session (no changeset persistence without ep_align).
  - Replaced ep_colors dropdown UI with 5 color swatches in padchrome (Black/Red/Green/Blue/Orange). Clicks programmatically set ep_colors' `#color-selection` select and dispatch `change` event, so color persists in Etherpad changesets.
  - Added font size selector (Small/Normal/Large/X-Large) using `execCommand('fontSize')`.
  - Fixed paste blocking: `lastCopyFromPage` flag tracks copy/cut in parent frame (passage panel). Both `lastCopyFromPad` (ace_inner) and `lastCopyFromPage` (parent) are accepted; everything else is blocked when `PASTE_BLOCK=true`.
  - Consolidated two duplicate `getAceInnerDoc` functions into one `getAceInner()`.
  - `onmousedown="return false"` on alignment/color buttons preserves ace_inner selection when buttons are clicked.
  - ep_colors native UI hidden via `#color,#color-selection{display:none!important}`.
- Decisions: ep_align was causing a total Etherpad crash (all pads broken). Alignment persistence sacrificed temporarily; acceptable. ep_colors' changeset mechanism used for color so it persists properly.
- Open / next: Try a compatible ep_align version for persistent alignment. Phase 8.6 — Strengths + Targets upload + AI marking suggestions.
- Gotchas hit: ep_align was a symlink to .versions/ep_align@11.0.40 — needed to remove both symlink and .versions folder. The `grep` returning empty on ep_align caused exit code 1 but was actually success. The changeset null error in logs is a different pre-existing Etherpad bug, not ep_align.


## 2026-06-30 — Fix word count (MutationObserver from parent frame)

- Built: Replaced injected `<script>` approach with MutationObserver set up in parent frame observing `innerdocbody` directly via same-origin cross-frame DOM. The injected script was being blocked by aceInner's CSP (which allows `<style>` but not `<script>` injection). Joins `.ace-line` divs with space before counting so adjacent lines don't merge. Fallback poll reduced 2000ms → 500ms. Commit: 38ca4c4

## 2026-06-30 — Fix Etherpad rate limiting disconnecting students

- Built: Two changes to `/opt/etherpad-lite/settings.json` (not in repo):
  - `trustProxy: false → true` — Etherpad was ignoring nginx's `X-Real-IP` header, treating all students as the same IP
  - `commitRateLimiting.points: 10 → 100` — with all students sharing one IP bucket, 10 changes/sec was blown through instantly by simultaneous Chinese IME typing, causing mass disconnects every ~30s
- Root cause: Alex's specific 30s reconnect loop was everyone's problem; teacher only noticed Alex as the demo student. All students were hitting the shared rate limit.
- Gotcha: `settings.json` is NOT in the InkHeron repo — changes made directly on server. Backup at `settings.json.bak`.
- Commit: none (server-only config file)

## 2026-06-30 — Fix timeslider back nav + false paste events

- Built:
  - **Timeslider opens in new tab**: Changed `window.location.href` to `window.open(..., '_blank')` in review.html. Root cause: Etherpad timeslider uses `history.pushState` while scrubbing; those iframe navigations stack in the parent history, so `history.back()` stepped through timeslider positions instead of returning to review.
  - **Paste plugin rewritten**: Switched from `beforeinput`/`input` + `inputType === 'insertFromPaste'` to the `paste` DOM event. Chinese IMEs (Sogou etc.) route composition text through the clipboard internally — browsers label this `insertFromPaste`, causing false positives. The `paste` event only fires for explicit user paste gestures (Ctrl+V, right-click > Paste), not IME input. Plugin deployed to `/opt/etherpad-lite/local_plugins/ep_inkheron_paste/static/js/index.js` and Etherpad restarted.
- Commit: cce62c2

## 2026-06-30 — Teacher preview-pad route for self-testing

- Built:
  - **`GET /teacher/preview-pad/:padId`** — teacher-only route that renders the full student write view using a teacher Etherpad author session. Sets the EP session cookie, opens the pad in the write shell, disables paste blocking (teacher shouldn't log their own keystrokes). `pasteBlock: false` prevents the student-facing paste event listener from firing.
  - **"Preview pad" button** in `teacher/review.html` sidebar — opens the route in a new tab. Teacher can now test word count, line numbers, toolbar, and all write-view UI without needing a student account active.
- Decision: Teacher edits in preview mode are attributed to the teacher EP author, not the student. Fine for debugging; teacher should not heavily edit student work via preview.
- Commit: be94695

## 2026-06-30 — Etherpad pad already exists error; session persistence; literacy analysis fix

- Built:
  - **Etherpad "already exists" fix**: `createGroupPad` now catches the "already exist" error and returns the existing pad id instead of throwing. Triggered when an assignment was deleted from InkHeron DB but the pad remained in Etherpad. Confirmed fixed by user.
  - **Session persistence**: replaced in-memory session store with SQLite-backed store using existing `db`. Sessions survive restarts, last 30 days. Migration 009_sessions.sql added.
  - **Literacy analysis method name fix**: `service.getText()` doesn't exist on `EtherpadService` — corrected to `service.getPadText()` in both the submit background handler and the new `/analyse` endpoint.
- Commits: 258d417 (sessions), d1b4f60 (method fix), 0a87b9c (pad exists)

## 2026-06-30 — Assignment card actions + manual literacy analysis trigger

- Built:
  - **Assignment list cards** now show Archive/Unarchive and Delete buttons alongside Students/Edit, so the teacher can act on a whole assignment from the list without opening the detail view. Archive toggles `is_archived` via the existing endpoint; Delete calls `DELETE /api/assignments/:id`. Both buttons call `fetchAssignments()` then `renderList()` to refresh in-place.
  - **Manual literacy analysis**: Added "Run analysis" button to the Codes section in `teacher/review.html`. Calls new `POST /api/submissions/:id/analyse` endpoint which reads the Etherpad pad text via `service.getText()`, runs `analyseSubmission()`, and returns the fresh codes. Page reloads after 1 s on success.
  - **New endpoint**: `POST /api/submissions/:submissionId/analyse` in `src/routes/pads.js` — teacher-auth + CSRF-protected. Needed for submissions that predated the auto-coding feature deployed on Jun 30.
- Decisions: Analysis endpoint deletes existing codes and replaces them (handled inside `analyseSubmission` which calls `DELETE FROM submission_codes WHERE submission_id = ?` before inserting). Re-running is safe.
- Commit: 9b118d3

## 2026-06-29 — Add persistent font size; fix undo/redo icons

- Built: Installed ep_font_size@0.3.19 (no ep_plugin_helpers dep). Added font size selector (10/12/14/16/18/24/40pt) to padchrome; routes through ep_font_size's hidden `#font-size select.size-selection` and dispatches `change` so size persists in changesets. Hides ep_font_size native toolbar element via CSS. Fixed undo/redo icons to Unicode ↶↷.

- Built: Replaced broken SVG path arrows on undo/redo with Unicode ↶↷ (&#8630;/&#8631;). Removed font-size `<select>` — `execCommand('fontSize')` gets overwritten by Etherpad's changeset processor within ~1 second because no `ep_font_size` plugin is installed. Font size needs `ep_font_size` plugin to persist; noted for future phase.
- Open / next: If persistent font size is needed, install ep_font_size compatible with EP 3.3.2.

## 2026-06-29 — Fix timeslider (third attempt): #rev/latest hash on pad URL

- Built: Switched timeslider redirect from `/timeslider?embed=1` to `/p/PADID#rev/latest`. The `?embed=1` timeslider is designed to run INSIDE the pad page's own iframe and fails standalone (controls flash then vanish because it can't reach parent socket.io). EP 3.3.2 `padMode.bootstrapFromHash()` reads the `#rev/latest` hash and auto-enters in-pad history mode on load. This is the correct standalone approach.

## 2026-06-29 — Fix timeslider redirect + author color (purple) suppression

- Phase/Step worked: Phase 8 — bug fixes post-toolbar merge
- Built:
  - **Timeslider fix**: EP 3.3.2 changed `/p/PADID/timeslider` to ALWAYS redirect back to the pad unless `?embed=1` is present (for iframe-embedded use). Direct visits are expected to use the in-pad history mode. Fixed by appending `?embed=1` to the redirect in `/api/pads/:padId/timeslider`. Confirmed 200 OK with curl after fix.
  - **Author color fix**: Etherpad injects `.authorColors .author-XXX { background-color: purple }` (2-class specificity) which beat the old `span[class^="author-"]` selector. Replaced with `#innerdocbody span { background: none !important }` (id + element = higher specificity than any class-only rule).
- Decisions: `?embed=1` is the EP 3.3.2 contract for standalone timeslider rendering in an iframe. Do not change this unless EP is upgraded.
- Open / next: Verify author colors are gone in live pad. Phase 8.6.

## 2026-06-29 — Single-row toolbar + paste field name fix

- Phase/Step worked: Phase 8 write view — toolbar consolidation, paste blocking repair
- Built:
  - Merged all formatting into one padchrome row: added B/I/U/S, OL/UL/indent/outdent, undo/redo buttons alongside existing alignment/color/font-size controls. All in padchrome; Etherpad's `#editbar` hidden via `#editbar{display:none!important}` CSS injection in `applyPadUiCleanup`.
  - B/I/U/S, list, indent/outdent, undo/redo wired via `clickEditbarBtn(key)` which finds `[data-key="..."]` in `padDoc` and clicks it — goes through Etherpad's changeset system.
  - Fixed paste blocking field name mismatch: route was reading `settings.paste_block` (never set); assignments store `settings.paste_detection`. Changed to `settings.paste_detection !== false`.
- Decisions: Route all text-format buttons through Etherpad's hidden editbar buttons (not execCommand) so formatting persists in changesets properly.
- Open / next: Verify alignment + paste blocking + B/I/U/S in live pad. Phase 8.6 — Strengths + Targets.
- Gotchas hit: rsync of individual files to a directory destination flattens paths — must rsync to explicit remote file path (`remote:/path/to/file.js`), not just the directory.

## 2026-06-29 — Fix ep_colors crash; ep_align 0.3.121 installed, alignment persistent
- Phase/Step worked: Phase 8 write view — plugin crash fixes
- Built:
  - Identified the real crash source: **ep_colors@0.0.3** not ep_align. Crash was `TypeError: U2 is not a function` in padbootstrap where `U2` = underscore `_`. ep_colors called `_(doInsertColors).bind(context)` but in EP 3.3.2 underscore is an ES module export (Object), not a callable wrapper. Patched line 89 on the server: `_(doInsertColors).bind(context)` → `doInsertColors.bind(context)`.
  - ep_align@11.0.40 was also crashing for the same reason (ep_plugin_helpers dependency may have introduced similar patterns). Replaced with ep_align@0.3.121 which has no such issues.
  - Etherpad now loads 3 plugins cleanly: ep_colors@0.0.3, ep_align@0.3.121, ep_plugin_helpers@0.6.7. No client TypeErrors observed.
  - **Patch location**: `/opt/etherpad-lite/src/plugin_packages/.versions/ep_colors@0.0.3/static/js/index.js` line 89. Note: this patch is NOT in version control — if ep_colors is reinstalled it will revert. The fix is: remove `_(fn)` wrapper, use `fn.bind(context)` directly.
- Decisions: Direct server-side patch rather than forking ep_colors. If ep_colors is ever reinstalled, re-apply patch.
- Open / next: Verify alignment (L/C/R) and color swatches work in pad. Phase 8.6.

## 2026-06-29 — ep_align 0.3.121 installed, alignment now persistent
- Phase/Step worked: Phase 8 write view — alignment persistence fix
- Built:
  - Diagnosed why ep_align@11.0.40 crashed Etherpad 3.3.2: `postToolbarInit` hook uses `editbar.registerCommand()` which exists, but the combination with `ep_plugin_helpers` and some internal interaction triggered `TypeError: U2 is not a function` in padbootstrap.min.js.
  - Installed ep_align@0.3.121 (no `ep_plugin_helpers` dep, uses `padInitToolbar` + `eejsBlock_editbarMenuLeft`). Loads cleanly, no crash.
  - Updated write.js: padchrome L/C/R buttons now click ep_align's (hidden) `.ep_align_left/.ep_align_center/.ep_align_right` buttons programmatically. This routes through ep_align's changeset system so alignment PERSISTS across reloads.
  - Fallback to execCommand if ep_align buttons aren't injected yet.
  - ep_align's toolbar buttons hidden via CSS; padchrome is the only visible alignment UI.
- Decisions: Route through ep_align's DOM buttons rather than execCommand; same result for user, but changeset-based persistence.
- Open / next: Verify alignment works (student opens pad, selects text, clicks L/C/R). Phase 8.6 — Strengths + Targets.
## 2026-07-01 - Rebuild native PDF zoom and marking
- Asked: Replace bad PDF marking, make PDF zoom centre on the document and stop right-side zoom from changing font size.
- Built: Replaced embedded browser PDF with PDF.js page rendering, selectable text layers and locally persisted canvas-based selected-text highlight/underline.
- Built: PDF zoom rerenders pages at true scale and restores scroll centre. Right writer zoom now changes page width instead of transform-scaling the editable DOM.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 11/11. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.

## 2026-07-01 - Fix native PDF zoom and marking
- Asked: Fix PDF zoom turning white, make the left panel wider, reduce wasted PDF space, fix source highlight/underline and keep right zoom from changing document formatting.
- Built: PDF zoom now resizes a stable embedded wrapper instead of reloading the PDF URL, left panel can expand to 78%/1100px, PDF padding is tighter and source text selections are restored before marking.
- Built: Added local PDF highlight/underline rectangle marks as a fallback because embedded browser PDF text is not directly editable.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 11/11. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.

## 2026-07-01 - Embed PDF reference in native writer
- Asked: Show PDF passages inside the actual left panel, keep them scrollable without extending the page, allow PDF zoom and resize the task/reference area.
- Built: Replaced the PDF new-tab link with a contained embedded PDF frame, added PDF zoom controls and added a horizontal drag handle to give either task or reference more vertical space.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 11/11. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: Browser PDF content is contained in an internal scroll frame so the writer page does not grow with the PDF.

## 2026-07-01 - Add native writer assignments back button
- Asked: Add a back button from the native writer to the assignments page.
- Built: Added a small `/student` assignments back link in the native writer header and a render test assertion.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: The button uses the fixed student dashboard route instead of browser history.

## 2026-07-01 - Replace toolbar icons with reference-style SVGs
- Asked: Make the numbered list, bullet list, indent and outdent buttons match the provided reference image and widen the zoom range.
- Built: Replaced the four CSS-built toolbar symbols with direct SVG shapes for dots/numbers, bars and triangles. Widened visual-only zoom to 70-150%.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: The four reference controls now use fixed SVG geometry instead of browser-rendered CSS/text approximations.

## 2026-07-01 - Fix native writer font size and resize affordance
- Asked: Fix broken font size, make the panels obviously draggable, match list/indent icons to the provided standard style and make zoom expand from the centre.
- Built: Font size now restores the editor selection and applies real `font-size:Npx` spans, list/indent icons use filled number/bullet/triangle line forms, the divider has a visible drag grip and zoom uses `transform-origin:top center`.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: Font size remains actual document formatting, while zoom remains visual-only.

## 2026-07-01 - Make native writer zoom visual-only
- Asked: Limit native writer zoom to 80-125% and ensure zoom never changes the actual font size or text positioning.
- Built: Replaced browser `zoom` with transform-based visual scaling inside a sizing frame, capped stored and slider zoom at 125% and refreshed the frame as line count/page height changes.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: Zoom is now a viewport-only aid. Formatting and saved document HTML remain controlled by the actual editor commands, not the zoom slider.

## 2026-07-01 - Refine native toolbar and line-number gutter
- Asked: Keep the left-panel clear button as text, improve the standard-style toolbar icons and remove the coloured line-number gutter.
- Built: Restored `Clear` text in the task/reference marking toolbar, replaced indent/outdent with cleaner arrow-and-line CSS icons and removed the boxed background from line numbers.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` plus `/assets/styles.css` returned 200.
- Decision: Line numbers now sit on transparent background so the writing page is the only framed surface.

## 2026-07-01 - Replace ugly toolbar SVGs and fix line numbers
- Asked: Replace bad-looking custom toolbar SVGs with standard symbols and fix the line-number gutter.
- Built: Removed SVG toolbar icons, replaced them with simpler standard glyph/CSS icons for undo/redo, lists, indent/outdent and alignment; narrowed the line-number gutter.
- Fixed: Line numbers now render only for actual text lines instead of forcing 30 rows and making the page look over-extended.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public health returned 200.

## 2026-07-01 - Improve native writer toolbar icons
- Asked: Replace text-heavy toolbar controls with standard symbols and hide colour grids until clicked.
- Built: Added inline SVG toolbar icons for undo/redo, lists, indent/outdent, alignment, text colour, highlight and eraser; changed text/highlight and left-panel highlight controls to click-open palettes.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public health returned 200.

## 2026-07-01 - Native writer polish and revision return
- Asked: Build the native writer polish batch and teacher return-for-revision.
- Built: Added fixed A4-style page, sans serif default text, save button, zoom slider, line numbers, font size dropdown, text/highlight colours, undo/redo, indent/outdent, active toolbar state and local task/reference marking.
- Built: Added teacher `return-revision` endpoint and review-page button, separate from green pen, allowing edits after deadline.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed writer/routes/review page and public health returned 200.

## 2026-07-01 - Verify Personal Statements import count
- Asked: Check that `Personal Statements Second Draft` has 19 student works.
- Found: Live DB has 19 Etherpad pads and 19 native pads across assignment IDs `3`, `4` and `7`; EAP 1 has 8, EAP 2 has 10 and Audit Class has 1.
- Note: 17 of 19 native pads are non-empty. Empty imported pads are Carina in EAP 2 and Audit in Audit Class.

## 2026-07-01 - Import Etherpad essays to Native InkPad
- Asked: ASAP copy current Etherpad essays into Native InkPad without preserving revision history.
- Built: Added `scripts/import-etherpad-to-native.mjs` with dry-run, `--apply`, no-overwrite default, optional `--overwrite` and assignment-native flipping.
- Verified: Imported live assignments `9`, `8`, `7`, `4` and `3`, creating 21 native pads; tests passed, live counts match and public health returned 200.

## 2026-07-01 - Native writer counters, formatting and resizing
- Asked: Add more formatting options, character and sentence counters, working reader/pad resizing and working zoom.
- Built: Added character and sentence counters, more formatting buttons, persisted simple HTML formatting, draggable reader split, page width controls and zoom controls.
- Verified: Deployed `src/views/nativeWrite.js`, restarted the wrapper, passed syntax/focused native writer checks and live health returned 200.

## 2026-07-01 - Fix native writer horror layout
- Asked: Native writer rendered as a tiny narrow writing strip.
- Fixed: Namespaced native writer CSS and markup, made the reference panel a sane fixed width and forced the writing surface to `width:min(100%,860px)`.
- Deployed: Updated `src/views/nativeWrite.js` on the droplet and restarted `inkheron-wrapper.service`.
- Verified: Syntax check and focused native writer test passed. Public health returned 200 and live logs show `/api/native/pads/1/policy` returning 200 from your browser.

## 2026-07-01 - Fix nginx route for Native InkPad
- Asked: `/native/write/9` showed `Cannot GET /native/write/9` after the native redirect fix.
- Found: Nginx routed `/native/...` to Etherpad on port `9001` because only older wrapper paths were whitelisted for port `3000`.
- Fixed: Updated both live nginx InkPad configs so `/native` and `/static` go to the InkPad wrapper, moved backups out of `sites-enabled`, tested config and reloaded nginx.
- Verified: Public `/native/write/9` now returns wrapper `401 unauthenticated` instead of Etherpad `Cannot GET`, which means logged-in students should reach the native page.

## 2026-07-01 - Fix native assignment opening Etherpad
- Asked: Native assignment still opened Etherpad despite Use Native InkPad being on.
- Fixed: Added a `/write/:assignmentId` guard that redirects native assignments to `/native/write/:assignmentId` before Etherpad pad provisioning; deployed `src/routes/pads.js` and restarted the wrapper.
- Verified: Local direct inject and regression test passed. Live wrapper restarted at 14:06:19 CST, public health returned 200 and logs showed no new missing-table or SQLite 500s.

## 2026-06-30 - Kill EP toolbar flash permanently

- Built: Three-layer suppression. (1) applyOuterCleanup() fires synchronously on iframe load with no delay, so toolbar never renders. (2) MutationObserver on padDoc forces display:none on EP chrome elements the instant EP adds them. (3) aceOuter load listener re-runs inner frame injection when EP reloads ace_outer mid-session, which was the main cause of recurring flashes.
- Commit: 4fa15ee

---

## 2026-06-30 - Fix submit button (Chinese browser blocks confirm())

- Built: Replaced window.confirm() + alert() with double-tap pattern. First click turns button amber and shows "Tap again to confirm" for 3 s; second click submits. Errors show as a fixed toast. Root cause: WeChat and Chinese browsers silently block confirm()/alert().
- Commit: a50d663

---

## 2026-06-30 - Native InkPad revision viewer

- Asked: continue the Native InkPad batch.
- Built: native review page now lets teachers click a revision snapshot, inspect its saved text in the main paper pane, then return to current marked text.
- Verification: native pad tests passed 6/6 and native review inline script parsed.
- Open / next: run final focused suite for the full batch.
- Gotchas hit: kept this as a simple snapshot viewer, not a full scrubber yet.

## 2026-06-30 - Native InkPad range marking tools

- Asked: continue the Native InkPad batch.
- Built: native teacher review page now has range annotation controls for inline comments, literacy-code marks and highlights. Literacy code metadata stores code/category/label.
- Verification: native pad tests passed 6/6 and native review inline script parsed.
- Open / next: native revision viewer affordance.
- Gotchas hit: mapped annotation types to CSS classes explicitly so inline/code/highlight marks render distinctly.

## 2026-06-30 - Native InkPad autosave version guard

- Asked: continue the Native InkPad batch.
- Built: native autosave now accepts `expected_version` and rejects stale saves with `409 version_conflict` plus current pad data. Student editor tracks the saved version and reports conflicts instead of overwriting newer text.
- Verification: native pad tests passed 6/6. `nativePads.js` and `nativeWrite.js` syntax checks passed.
- Open / next: review UI controls for literacy codes and highlights.
- Gotchas hit: an ad-hoc parser command failed because `nativeWrite.js` is an ES module; proper `node --check` passed.


## 2026-07-02 - A4 paper, tighter padding, page-break line
- Asked: reduce editor side padding, make the pad a true A4 ratio, add a faint dotted horizontal line at each A4 page break.
- Built: editor stage padding cut 32px to 12px. Editor column set to exactly --page-width (794) so the paper is a true A4 794x1123 border-box (was 768 wide due to the line-number column eating width). Added a faint dotted page-break line every page-width*1.414 via two layered CSS backgrounds (thin line + white dash mask), behind text, scales with zoom.
- Verified: node --check passes, wrapper active after deploy. Live look for Brendan.

## 2026-07-02 - Editor zoom scales like the PDF, PDF highlight blend fix
- Asked: (1) PDF highlight was hiding the words. (2) Make the writing pad zoom behave like the PDF window.
- Fixed highlight: it painted a solid opaque background over the canvas glyphs. Now uses mix-blend-mode:multiply and the text layer dropped its z-index so it shares the canvas stacking context and blends like a highlighter pen. Underline was already fine. Commit 3a0ddbf area.
- Fixed editor zoom: previously scaled page width (reflowed text). Now the page shell uses the CSS zoom property so the whole page scales uniformly and the stage scrolls, matching the PDF pane. syncZoomFrame no longer manually sizes the frame.
- Verified: node --check passes, render checks confirm the new CSS/JS, wrapper active after deploy. Live feel for Brendan to confirm.
- Commits: highlight blend + editor zoom (see git log).

## 2026-07-02 - Native PDF reference rebuilt with PDF.js
- Asked: PDF reference must be viewable, evenly zoomable, and support real text highlight and underline like the editor pad. Explicitly NOT an overlay layer with draggable coloured shapes (the reverted earlier attempt).
- Built: Replaced the browser-native PDF iframe in nativeWrite.js with PDF.js canvas rendering plus a selectable transparent text layer per page.
- Zoom: slider re-renders every page at the new scale (fit-to-width base), crisp, no iframe reload or scroll jump. Saved zoom kept in localStorage.
- Marks: highlight and underline wrap the selected text-layer range in a styled span (background for highlight, bottom border for underline), aligned to the words. No overlay shapes.
- Persistence: marks stored as page-relative character offsets (not pixels) in localStorage key nativePdfMarks:<assignmentId>, reapplied after each render so they survive zoom and reload.
- Verified: node --check on the file and on the extracted browser module both pass; template renders valid HTML with all new elements and zero iframe tags; live pdfjs .mjs assets serve as application/javascript; wrapper active after deploy. Live browser highlight/zoom feel is for Brendan to confirm.
- Commit: 3a0ddbf
- Asked: For Lang essays, allow grading on the internal rubric and separately show what the student would score on the AP Lang rubric. Students must see both.
- Built: Added `rubric_kind` migration so assignment rubrics can be separated into `internal` and `exam` tracks without overwriting each other.
- Built: Added AP exam rubric creation and scoring endpoints, teacher review panels for internal rubric and AP Lang exam estimate and student feedback display for both rubric tracks.
- Verified: `node --check src/routes/nativePads.js` and `node --test test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

## 2026-07-02 - AP 3-row rubric templates
- Asked: Make rubric templates work with the AP 3-row rubric.
- Built: Added `mode: "ap"` rubric parsing. AP templates normalize into three scoreable rows: Thesis, Evidence and Commentary and Sophistication.
- Built: Feedback page now includes an AP 3-row JSON template and labels saved AP rubrics as `AP 3-row`. Assignment setup hints mention AP support.
- Verified: `node --check src/feedback/assets.js` and `node --test test/feedbackAssets.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

## 2026-07-02 - Holistic and analytic rubric templates
- Asked: Make sure the rubric module works with both holistic and analytic rubrics.
- Built: Rubric assets now parse `mode: "analytic"` as multiple criteria and `mode: "holistic"` as one `Overall` scoreable criterion with bands.
- Built: Feedback page now shows analytic and holistic JSON templates and labels saved rubric assets by mode. Assignment setup hints explain the difference.
- Verified: `node --check src/feedback/assets.js` and `node --test test/feedbackAssets.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

## 2026-07-02 - Feedback PDF and DOCX uploads
- Asked: Expand feedback uploads to include Word docs and PDFs, excluding old `.doc`.
- Built: Added server-side `/api/feedback-assets/extract` multipart extraction for TXT, CSV, JSON, DOCX and selectable-text PDF files.
- Built: Feedback page upload now sends files to the extractor and fills the content box with extracted text before saving.
- Verified: `node --check` passed for touched server files and `node --test test/feedbackAssets.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

## 2026-07-02 - Deploy feedback area
- Asked: Feedback area was not visible live and `/teacher/feedback` errored, so deploy it.
- Deployed: Copied migration 016, feedback asset routes/helpers, app route registration and teacher dashboard/feedback/assignment pages to the droplet.
- Fixed: Corrected a deploy path mistake for `src/app.js` and removed the stray remote `src/routes/app.js` copy created during deploy.
- Verified: Production migration applied `016_feedback_assets.sql`, wrapper restarted active/running, root returned 200 and `/teacher/feedback` returned protected-route 401 when unauthenticated.

## 2026-07-02 - Feedback asset library
- Asked: Add a home feedback area where rubric templates, strengths and targets can be uploaded for different assignment types.
- Built: Added `/teacher/feedback`, a Feedback tile on teacher home and teacher-only `/api/feedback-assets` routes for listing, saving and archiving rubric or strengths/targets assets.
- Built: Added `feedback_assets` migration, parser helpers, assignment setup dropdowns for saved strengths/targets and rubric templates and native review now uses the selected saved feedback table.
- Verified: `node --test test/migration.test.js test/feedbackAssets.test.js test/assignments.test.js test/nativePads.test.js` passed 30/30.

## 2026-07-02 - Simple and advanced assignment setup
- Asked: Make assignment setup simple by default, with heavier options behind Simple and Advanced.
- Built: New assignment now shows the core setup first and moves outside paste, strengths and targets, spellcheck, green pen and default rubric creation into a collapsed Advanced options section.
- Built: Edit assignment now follows the same pattern, with submit behaviour visible and advanced native settings collapsed.
- Verified: `node --test test/assignments.test.js` passed 13/13.

## 2026-07-02 - Native review pane suggestions
- Asked: Make the grader window more useful and less half-finished, with tools and suggestions available at a click.
- Built: Native review now receives the strengths and targets library, shows a Suggested targets panel and can append a suggested target directly into the general comment box.
- UI: Widened the review side rail and added an editor-style paper header hint while preserving existing annotations, rubric scoring, recovery and revision tools.
- Verified: `node --check src/routes/nativePads.js` and `node --test test/nativePads.test.js` passed 14/14.

## 2026-07-02 - Greenpen rewrite assignment flow
- Asked: Replace confusing feedback-return action with Greenpen rewrite that creates a new native assignment carrying work and feedback.
- Built: Added teacher endpoint `/api/native/assignments/:assignmentId/greenpen-rewrite`. It creates a new native assignment, copies current native pad text, annotations, assignment roster overrides, rubric criteria and passage PDF when present.
- UI: Native review now shows `Greenpen rewrite` and prompts for a rewrite assignment name, defaulting to `Greenpen rewrite: <original title>`.
- Verified: `node --check src/routes/nativePads.js` and `node --test test/nativePads.test.js` passed 14/14.

## 2026-07-02 - Assignment setup rubric and feedback table controls
- Asked: Add rubric setup and strengths/targets table selection to assignment setup.
- Built: New assignment and edit assignment settings now include a default strengths/targets table selector and a default rubric creation/reset control.
- Built: New assignments can create the default native rubric immediately for every selected class. Edit settings can create/reset the default rubric across the assignment group.
- Verified: `node --check src/routes/assignments.js` and `node --test test/assignments.test.js` passed 13/13.

## 2026-07-02 - Native assignment and review cleanup
- Asked: Fix the PDF regression, move paste blocking into assignment settings, remove Etherpad choice from teacher assignment pages, stop showing autosaves as an always-open list, preserve assignment filters, fix timestamps and hide non-current student assignments.
- Built: Native writer PDFs are true embedded PDF documents again, not PDF.js-rendered page canvases. Removed fake PDF highlight/underline controls from the PDF pane.
- Built: New/edit assignment pages are native-only in the teacher UI and now expose Outside paste: Allow, Log only or Block. Assignment saves update existing native pad policies.
- Built: Student paste blocking now permits copy/paste that originates inside the InkPad screen and logs or blocks outside paste only.
- Built: Assignment filters persist when returning from detail view and clear when going back to teacher home. Student and teacher timestamp display now parses server UTC correctly.
- Built: Native review now hides autosaves behind a Revision history button instead of dumping the full list in the rail.
- Live data: Archived live assignment IDs 5, 6, 8, 9 and 10. Active student-visible native Personal Statements remain IDs 3, 4 and 7 with 19 native pads.
- Verified: Node 24 `--check` passed for touched server/view files. `--test test/assignments.test.js test/nativePads.test.js` passed 26/26. Deployed, restarted wrapper and public `/` returned 200.
## 2026-07-02 — Fable batch: phases B and D2, Sonnet handoff, review mockups

- Asked: run the agreed Fable batch — baseline, Phase B, Phase D2, Sonnet handoff notes for C/D3, review-window mockups.
- Branch `analysis-ai` off main. Baseline confirmed: 66/70, only the 4 known failures.
- Phase B (01f5d3a): `runLiteracyAnalysis` fills `ai_literacy_suggestions` (Doer haiku per paragraph, quotes stored as exact pad slices so offsets never drift, dedupe, delete-then-insert pending rows in a transaction). `verifyFindings` in checker.js: deterministic verbatim check plus one batched gemini-flash defensibility call; checker failure is non-fatal (flag `checker_unavailable`). Both take injectable `{ chat }` for tests. 8 tests.
- Phase D2 (78502f6): `scoreRewrite` upserts `implementation_scores`. Deterministic word-LCS diff computed raw and normalized; change that vanishes under normalization = cosmetic, giving `cosmetic_ratio` and `has_substantive_change`. AI judgement per feedback item, GATED: an unchanged flagged span can never be "addressed" and a cosmetic-only rewrite can never be `meaningful`, whatever the model says. 5 tests.
- SONNET_HANDOFF.md (cb39fe3): full template for phases C and D3 including the 10 established conventions. Decision recorded there: Phase C triggers in background on finish-marking via `runInBackground`.
- Review redesign mockups in `mockups/review-redesign/`: direction-a.html (marking desk: essay + right rail, dashed quiet AI-suggestion cards) and direction-b.html (guided flow: stepper Read → Suggestions → Feedback → Rubrics, one suggestion at a time, sticky finish bar). Both self-hosted tokens, category-only hover, no grade estimate anywhere. Screenshot-verified on port 3466 (`inkheron-mockups` launch config).
- Suite after all commits: 83 tests, 79 pass, same 4 baseline failures.
- Next: teacher picks a mockup direction; Sonnet does C, D3 and the chosen redesign.
- Follow-up (e154ebf): added direction-b-flow.html (the guided flow shown as a 5-step storyboard: Read → Suggestions → Feedback → Rubrics → Finish, with the next-student loop as the payoff) and direction-c.html, a left-field "margin" concept: essay as a printed page, teacher codes stamp into a right margin in ink, AI suggestions arrive as dashed pencil ghosts with ✓/✕, full code tray (his real literacy codes) fixed at the bottom. Both screenshot-verified.

## 2026-07-02 — Submit button shows "Submitted" and greys out
- Asked: after a student submits, the submit button should display "Submitted" and be greyed out.
- Done: in nativeWrite.js the button now renders the done label (Submitted / Resubmitted) and stays disabled when the pad is locked; the click handler also sets the button text to the done label on a successful submit. Greying already handled by `.niw-btn:disabled{opacity:.5}`.
- Also this session: merged remove-etherpad then analysis-backend to main (fast-forward); confirmed the key settings place already exists at /teacher/settings (both keys, masked, working); rendered strengths/targets on the student feedback page (was returned by the endpoint but not shown); fixed the stale branch reference in FABLE_HANDOFF.md.
- Verified: rendered the view for all pad states, button label/disabled correct each time.

## 2026-07-02 — Analysis backend foundations + Fable handoff
- Asked: make the analysis backend work accurately. Build everything planned but never implemented (literacy coder, Server酱, etc). Division agreed: I build the non-AI foundations and seams, Fable builds the AI reasoning (phases B/C/D) and redesigns the teacher review window. AI suggestions hidden until teacher accepts.
- Branch `analysis-backend` (off remove-etherpad). Built:
  - 6 additive migrations (019-024, no data touched): native_feedback_items (structured strengths/targets), score_snapshots (rubric/AP history), ai_literacy_suggestions (hidden findings), native_pads.rewrite_of_pad_id (link rewrite to original), implementation_scores, ai_grade_estimates (marker preference). An existing 018_applied_feedback_table.sql had appeared since the earlier audit, so mine start at 019 to avoid a collision.
  - Wiring: serverChan notify on submit/resubmit; feedback-items CRUD surfaced in teacher review + student feedback; suggestion accept (promotes hidden AI finding to a real literacy_code annotation + feeds profile) / reject; score_snapshots appended on finish-marking (self-describing with criterion labels); recordTeacherScores fills teacher_score+delta on hidden AI estimates; greenpen rewrite sets rewrite_of_pad_id.
  - literacyCoder.js retargeted off the inert submission_codes table; its prompt/parse helpers kept for Fable to reuse.
  - Seam stubs (documented no-ops, clean returns so keyless tests pass): runLiteracyAnalysis + verifyFindings (B), generateProfileSummary (C), scoreRewrite (D2), estimateRubric (D3).
  - FABLE_HANDOFF.md: full contract per seam plus the review-window redesign brief.
- Decisions: hidden-suggestion model per the vision (no anchoring). Left teacher-review UI wiring for Fable's redesign rather than building UI Fable will discard; student feedback view wiring is mine.
- Verified: migrations apply on fresh DB and are idempotent; app boots; new test/analysisBackend.test.js 6/6 pass; full suite 66 pass / 4 fail, all 4 pre-existing baseline failures (EAP upload, classes CRUD, roster, student login), no new regressions.
- Open / next: Fable builds B/C/D + review redesign per handoff. This work is on analysis-backend; remove-etherpad still not merged to main. SESSION_NOTES well over 400 lines, archive oldest soon.

## 2026-07-02 — Two rubrics + two strengths/targets per assignment
- Asked: let the teacher attach up to 2 uploaded rubrics and up to 2 uploaded strengths/targets tables per assignment. Remove the "Create default rubric" option (uploaded rubric or vibe grade only). AP Lang exam estimate should only appear in the reviewer for AP Lang classes.
- Backend: settings gained feedback_tables[] (max 2), rubric_assets[]/rubric_names[] (positional, slot 1 = internal, slot 2 = secondary). Added 'secondary' rubric_kind plus secondary-rubric and secondary-rubric-scores endpoints. Migration 018 adds native_pads.applied_feedback_table; new applied-feedback-table endpoint sets which table applies per essay. Review/feedback responses now return both rubrics by name, exam_rubric.visible gated by isApLangClassName(class), both feedback tables and the applied choice.
- UI: new + edit assignment now have two rubric dropdowns and two strengths/targets dropdowns; removed the create-default and manual AP toggles; AP exam estimate auto-applied when the class name is AP Lang. Reviewer scores both rubrics under their names, shows the AP section only for AP Lang, and has a per-essay table selector that swaps suggestions and saves the choice. Student feedback view shows both rubrics and gates AP.
- Backward compatible with legacy feedback_table and existing internal/AP rubrics.
- Verified: full suite 30/30 with Node 24 (local node is 20, tests need node:sqlite). Migration applied on server, column present, wrapper active, teacher route 401 (auth) as expected.
## 2026-07-02 — Fable batch 2: auto-accept policy, voice layer, anomaly detection, D mockups, Opus handoff

- Policy change (teacher decision, now CLAUDE.md §8.1): literacy codes are formative for L2 learners, not grading factors; AI findings auto-apply as marks at Checker confidence >= 0.75; contested stay pending; disagree endpoint retracts mark + profile evidence. Doer prompt retuned from conservative to flag-everything. Truncation salvage added (dense paragraphs no longer lose all findings to a cut JSON bracket). Commit 18046c6.
- Stylometric voice layer (b88f3ee): migration 025 `style_metrics` + `native_feedback_items.student_checked`; `styleMetrics.js` computes ~24 length-normalized features per submit (rhythm, MATTR vocabulary, subordination/coordination, passive proxy, transitions, hedging, first person); `aggregateStyleProfile` gives mean/sd/trend per feature.
- Voice anomaly detector (02b507d): `detectStyleAnomaly` z-scores an essay against the student's own history, length features excluded, framed as conversation evidence not proof. Feeds the homework-vs-watched provenance story.
- Direction D mockup (A/C hybrid at real 41-mark density: grouped auto-marked card, contested "needs you" pile, AI-suggested strengths/targets, half-point dual rubrics), student view (category filter chips, target tick-off, dual gauges), profile dashboard v2 (per-100-words normalization, provenance chips per essay, anomaly banner, hover+click metric explainers, student-readable per-issue narrative, AP per-genre profile tabs locked until 2 essays of a type). All screenshot-verified. Commits e154ebf/969c1f6.
- Docs: CLAUDE.md §8.1; FABLE_HANDOFF superseded note; SONNET_HANDOFF extended (feedback suggester seam, target tick-off endpoint, essay_type + supervision settings fields, normalization rule); OPUS_HANDOFF.md created (three pages from the three mockups); TEST_PORTAL_SPEC.md pins FRQ = native pad so exam writing reuses the whole pipeline and feeds profiles.
- Next: teacher pastes prompts into Sonnet (backend) and Opus (frontend); Fable reviews after both land.
## 2026-07-04 — Green pen v2 (teacher feedback round)

- Panel moved to the RIGHT of the editor (gp-shell grid; left task/reference panel hidden in rewrite mode so the page gets the room). New button at the top of the panel opens /native/greenpen-source/:padId in a new tab: the ORIGINAL assignment's prompt, passage text and embedded passage PDF (student-owned rewrite pads only).
- Mark clearing rule changed: a mark now survives only if ~6 chars of surrounding context are intact on top of the quote. Fix the word OR restructure the sentence around a kept word and the mark clears (teacher point: students keep a comfortable verb and rewrite the frame; nagging a fixed sentence is wrong; the implementation scorer still judges honestly at resubmit). Verified live: rewrote the sentence around flagged "have", kept the word, mark cleared, six untouched marks stayed.
- Visuals: marks are now underline PLUS a light background wash, one colour per CODE via CSS vars (Sp amber, Gra maroon, VT purple, P blue, WW teal, RO orange, Caps pink, Exp slate, and the rest); filter chips are per-code with colour swatches and counts, filtering dims non-matching marks in place.
- Commit 14c6aed. Suite still 121/125 with the known 4.

## 2026-07-04 — Improvement batch: green pen in the pad, resolver, fallback, surfacing

- Teacher design decision: NO side-by-side original in green pen. Marks render inside the editable rewrite text itself; fix the flagged text and the mark clears on the next re-check. Suggester architecture stays Doer+Checker (dual independent generation rejected as merge-complexity for marginal gain; fallback lever is upgrading the suggester Doer tier).
- Resolver hardening (3c64803): exact-id intents must match the live list exactly or fail; tilde/alias ids deprioritized; weak fuzzy matches now return null instead of falling back to an arbitrary first row. Region fallback in callChat: on a 403 region error, Doer families fall back to deepseek, checker families to qwen (still different families), logged loudly.
- Checker calibration (d416842): literacy checker prompt now demands honest confidence spread; also review endpoint exposes implementation_score on scored rewrites and native-review shows a Green pen result card (codes/targets/comments addressed, cosmetic share, link to original).
- Green pen in the pad (a6dc320): GET /api/native/pads/:padId/greenpen-context (student, own rewrite pad; category-only marks with 24-char context, feedback items with checked state, comments). nativeWrite.js: gp-mode sidebar card (progress counter, category filter chips, targets tick-off wired to toggle-check, strengths, comments), mark engine that relocates quotes in the live editor via context scoring (short quotes need >= 3 context chars so a fixed "is" does not re-pin to a twin), idle re-check with caret preservation, sanitizer unwraps [data-gp] so decorations never enter a saved document. Browser-verified end to end on a seeded dev server (launch config inkheron-gp-dev, port 3467): 7/7 marks placed correctly, fixing "structered" cleared exactly that mark, tick persisted to DB, saved document_json clean.
- Suite: 125 tests, 121 pass, same 4 known baseline failures.
- Next: deploy analysis-ai to the droplet, run one real assignment with production models (haiku/gemini), watch checker confidence spread.

## 2026-07-04 — Live smoke test with a real essay and OpenRouter key

- Ran the full pipeline on a real L2 personal statement (sociology, ~640 words) with real model calls, driven from a scratchpad instance (key stored via the settings API, DB and key file deleted afterwards; teacher advised to revoke the temp key).
- Region finding: from mainland China OpenRouter returns 403 region-blocked for Anthropic, Google and OpenAI models; DeepSeek and Qwen work. All failures were clean no-ops (never-throw contract held). Production intents stay haiku/gemini for the Singapore droplet; local dev from CN needs deepseek/qwen intents. Consider a region fallback in openRouter.js later.
- Pipeline result (Doer deepseek-chat-v3.1, Checker qwen3-vl-32b): 64 literacy findings, 64/64 offsets exact, sensible codes (Gra 23, Caps 10, Exp 10, VT 7...), checker confidences 0.9-0.95 so all auto-accepted, ~19k tokens in 12 calls, ~4 min wall time. Style metrics, feedback suggestions (2 strengths + 5 targets, all reasonable), profile summary grounded in per-100-words rates: all good.
- Bug found and fixed (5616b14): estimateRubric wrote 0 rows because deepseek answered with the criterion LABEL and band NAME ("Ideas and development"/"Strong") instead of numeric ids; the guard dropped everything while returning ok. Fix: hardened prompt, normalizeCandidate maps labels back to ids/scores, return now includes written count. Live re-run wrote 3 estimates (4/3/4) with grounded rationales. Suite 120 tests, 116 pass, known 4 failures.
- Watch item: checker rubber-stamps at 0.9-0.95 confidence, so nothing lands in the contested pile. Monitor on the droplet with gemini as checker; if it persists, make the checker prompt force calibrated doubt.

## 2026-07-04 — Fable review of Sonnet + Opus batches

- Reviewed all 20 commits since 969c1f6. Suite: 119 tests, 115 pass, only the 4 known baseline failures.
- Contract checks all hold: ai_grade_estimates touched only inside markerProfile.js (never in routes or pages, anchoring intact); class median excludes demo/ghost via realStudentsWhere; copy rules (B1-C1, no em/en dashes, no Oxford commas) inside both new system prompts; D3 prompt carries the grammar-is-not-a-grading-factor framing; checker drop thresholds at 0.8 per spec; disagree, half-point rubrics and target tick-off wired in the rebuilt pages.
- Judgement call from Opus approved: the student progress ring counts targets ticked, not per-mark fixes — per-mark fix state does not exist until the implementation scorer runs on a resubmit. Follow-up for a later batch: once implementation_scores exists for a rewrite, feed addressed_json counts into the feedback view to show the marks-based "N of M fixed" number honestly.
## 2026-07-03 — Sonnet: phase D3 hidden AI rubric estimate

- Phase/Step worked: SONNET_HANDOFF.md phase D3, `estimateRubric` in `src/services/markerProfile.js`.
- Built: reads `native_pads.plain_text` + `assignment_rubric_criteria`/`assignment_rubric_bands` grouped by `rubric_kind`; one Doer (haiku) call per rubric_kind scoring strictly against the given bands, explicitly told grammar/spelling/punctuation are not grading factors for L2 learners (CLAUDE.md §8.1); deterministic guard drops any score outside that criterion's band min/max regardless of checker availability; Checker (gemini flash) additionally drops estimates it judges out of range or ungrounded; delete-then-insert into `ai_grade_estimates` in a transaction, `teacher_score`/`delta` left NULL for `recordTeacherScores` to fill later. `recordTeacherScores` untouched. 8 tests (happy path across two rubric_kinds, re-run no duplicates, deterministic guard without checker, checker-flagged drop, checker-failure non-fatal, missing-rubric skip, empty-text skip, doer-failure writes nothing). Commit d12bc1b.
- Decisions: already wired at submit per handoff (`src/routes/nativePads.js` ~line 1114), no route change needed for D3.
- Open / next: phases C and D3 both done. Next: feedback suggester seam + migration 026, student target tick-off endpoint, essay_type/supervision settings fields.
- Gotchas hit: none.

## 2026-07-03 — Sonnet: phase C student profile summariser

- Phase/Step worked: SONNET_HANDOFF.md phase C, `generateProfileSummary` in `src/services/profileSummarizer.js`.
- Built: reads `student_literacy_issue_stats`, `student_literacy_evidence`, `native_feedback_items` targets, `score_snapshots`, and `aggregateStyleProfile` (styleMetrics.js) for one student; issue rates converted to per-100-words (never raw counts, per the normalization rule); one Doer call grounded in that evidence returns `writing_summary`/`voice_summary`/`targets` (voice_summary restricted to only what the stylometric numbers show); one Checker call verifies each of the three fields is supported, dropping to empty/fallback at confidence >= 0.8; upserts `student_writing_profiles`. Wired into `finish-marking` in `src/routes/nativePads.js` via the existing `runInBackground` helper. 6 tests (happy path, upsert idempotency, checker-flagged field dropped, checker-failure non-fatal, empty-evidence skip without a model call, doer-failure writes nothing). Commit 07e284c.
- Decisions: "per-field" Checker verdict interpreted as the three top-level JSON keys, not per-target-item, matching the handoff's "drop to fallback for that field" language.
- Open / next: feedback suggester seam + migration 026, student target tick-off endpoint, essay_type/supervision settings fields.
- Gotchas hit: none.

## 2026-07-04 — Fix: inkpad root showed the EAP landing after deploy

- The deploy shipped the repo's public/index.html (the EAP portal landing) over inkpad.inkheron.app's root, which had been running an older page. Root cause: one public/ dir, two domains, a single static root route.
- Fix (host-aware root in src/app.js, tested): requests with a host starting inkpad. get a rebuilt student/teacher chooser (new public/inkpad-home.html, matching the page signout expects); every other host keeps the EAP landing. Hot-deployed, verified live on both domains plus /teacher-login.
- Future deploys are now safe for both portals from the same tree.

## 2026-07-04 — Production deploy + live validation on the droplet

- Deployed analysis-ai (committed tree only, via git archive + tar) to /opt/inkheron-platform (the systemd inkheron-wrapper app behind inkpad.inkheron.app, port 3000, Node 24). DB backed up first (inkheron.db.pre-analysis-202607041050). Migrations 019-026 applied cleanly on restart, live 200. Note: /opt/eap-platform (pm2, port 3466) is a SEPARATE older copy serving eap.inkheron.app; not updated this round.
- Live validation on a ghost student (GHOST-VALIDATION class, ghost.validation, is_ghost=1 so invisible to stats): full pipeline with production models from Singapore. First run exposed two live bugs: (1) resolver picked gemini-3.1-flash-lite-IMAGE as checker; (2) gemini rubber-stamped 46/46 findings at 0.9-1.0 despite the calibrated prompt, leaving the contested pile empty.
- Fixes (committed + hot-deployed): resolver penalizes modality variants (image/audio/video/vision/-vl-) unless asked; checker now ALWAYS flags the least-confident ~10% of batches >= 5 as 'least_confident' so they stay pending. Second run: checker = gemini-3.5-flash, 46 findings, 39 auto + 7 contested, 42 s and ~17k tokens per essay end to end. Estimates hidden (3 rows), suggester produced 3 strengths + 5 targets.
- Validation artifact kept for teacher inspection: assignment "PIPELINE VALIDATION (ghost)" id 15, pad 55 on production. Older runs deleted.
- Deferred deliberately: marker-profile payoff view (no delta data until a term of marking) and class-level dashboard (Opus job once real profiles exist).

## 2026-07-04 — Green pen v3: student code explainers

- Clicking a code chip in the right panel now both filters the marks to that code (others dim) and opens an explainer card: "WW = Wrong word", what it means in B1-C1 English and a Quick fix hint. All 20 codes covered in GP_CODE_INFO in nativeWrite.js. Fixed a latent key collision: symbol codes ^ // and the tick previously all normalized to the same CSS key; now caret/para/tick with their own colours. Browser-verified (AA/Adj chip shows the card, only "more clear" stays coloured). Commit dfc7793, suite 121/125 known 4.



## 2026-07-03 — Opus: teacher review page rebuilt from direction-d
- Asked: build the three redesign pages (Opus handoff) on branch analysis-ai from the mockups in mockups/review-redesign, verify with preview tools, commit in small steps.
- Built page 1: `public/teacher/native-review.html` fully rebuilt to direction-d (calm desk). Wired to the existing `GET /api/native/pads/:padId/review` plus `feedback-suggestions` and `/api/assignments/:id/dashboard` (for the N-of-M marked counter and prev/next unmarked navigation).
  - Calm underline marks coloured by literacy category (surface amber, grammar maroon, format blue), contested pending suggestions dotted coral, inline comments green. Hover shows category only.
  - Right rail: auto-marked summary grouped by code with per-mark find + disagree (retract via suggestions/:id/disagree), Needs-you contested pile (keep/change/not-an-error, A/D keys), strengths and targets (AI Use/Edit/Reject + teacher add/delete), tabbed rubric (internal + AP Lang) with clickable whole AND half points and expandable band text.
  - Inline comments: select essay text to a popover that saves an inline_comment annotation. Finish marking calls finish-marking then jumps to the next unmarked pad.
- Verified in preview at 1440px: half-point score persists server-side (AP 4.5/6), disagree retracts a mark (23 to 22 annotations), AP tab renders, essay marks render calm. Seeded a demo AP Lang class + Chen Yuxi marked pad (scratchpad seed, not committed) to drive real endpoints.
- Next: student feedback view (student-view.html), then profile dashboard + new writing-profile endpoint.

## 2026-07-03 — Student signout returns to role chooser
- Asked: signout on InkPad should land on the screen where you choose student or teacher.
- Cause: student-dashboard signout redirected to /login (student login) directly.
- Fix: redirect to / instead. The InkPad root (deployed index.html "Writing portal") already offers Student sign in and Teacher sign in. Note: the deployed inkpad index.html differs from the repo copy (repo index is the EAP workspace chooser), so index.html was NOT redeployed.
- Teacher pages still sign out to /teacher-login (unchanged, per scope).
- Verified: / serves the chooser (curl), wrapper active after deploy.

## 2026-07-03 — Fix passage PDFs failing to load in student pads
- Reported: attached PDFs not showing in pads, "the PDF could not be loaded".
- Root cause: the `application/pdf` content-type parser in assignments.js had no `bodyLimit`, so it inherited Fastify's 1 MB default and rejected any PDF over ~1 MB with 413 before the handler ran (handler was written to allow 10 MB). Most real passage PDFs exceed 1 MB, so they never saved and the student pad showed nothing / a load error. Reproduced: 500 KB uploads OK, 1.5 MB and 3 MB 413. Also confirmed the client render path itself is fine by loading a seeded PDF in a real browser (canvas rendered).
- Fix: set `bodyLimit: 11 * 1024 * 1024` on the parser so the handler's 10 MB check is the effective gate. After: 1.5/3/9 MB upload OK, 12 MB rejected. Added a regression test in assignments.test.js (13/13 pass).
- Also: added an `inkheron` entry to .claude/launch.json (Node 24, port 3472) for browser previews.
- Open / next: HEADS UP for the user — nginx on the droplet has its own default 1 MB `client_max_body_size`; it must be raised (e.g. 12m) on the server or large PDFs still 413 at the proxy despite this app-side fix.

## 2026-07-03 — Sonnet: full suite verification, SONNET_HANDOFF complete

- Phase/Step worked: SONNET_HANDOFF.md "Definition of done" — full `npm test` run under Node 24 across all six pieces (phase C, phase D3, feedback suggester + migration 026, tick-off endpoint, essay_type/supervision fields).
- Built: nothing new, verification only. First full run surfaced one real regression: `test/migration.test.js` hardcodes the migration file list and per-table column list, and migration 026 (added earlier this session) wasn't registered there. Fixed by adding `026_ai_feedback_item_suggestions.sql` to the expected file list and an `ai_feedback_item_suggestions` entry to `expectedColumns`. Commit d78bc41. Re-run: 114 passing, only the 4 known baseline failures remain (EAP library admin upload, student login timing, classes CRUD, roster page teacher-only) — matches the handoff's stated baseline exactly, no other regressions.
- Decisions: none.
- Open / next: SONNET_HANDOFF.md fully implemented (phase C, phase D3, feedback suggester seam, tick-off endpoint, essay_type/supervision fields, all committed separately with SESSION_NOTES entries). Nothing outstanding from this handoff.
- Gotchas hit: migration.test.js's schema canon list must be updated whenever a new migration file is added — easy to forget since it's a separate file from the migration itself.


## 2026-07-05 — SONNET_HANDOFF_2 item 3: one-click export to admin gradebook

- Phase/Step worked: SONNET_HANDOFF_2.md item 3.
- Built: new `src/services/adminExport.js` (`exportAssignmentToAdmin`) and `POST /api/assignments/:id/export-to-admin` in `src/routes/assignments.js`. Reads grade-importer's `GET /api/sync?since=0` once (this is also the auth check, since `/api/sync` is the only key-gated route in that app), matches the assignment by name+class and students by normalized display name, mints a new assignment id (max existing id + 1) and a new student id (grade-importer's own `PREFIX-SUFFIX` scheme from class name + display name) for anything unmatched, then `POST /api/sync` once with the combined `{students, assignments, scores}` payload. Rows are filtered to `is_demo = 0 AND is_ghost = 0` and to students with a non-null score before export. Settings screen gained two new fields: `admin_export_url` (plain text, own read/write helpers in `settingsStore.js`, defaults to `https://admin.inkheron.app`) and `admin_export_key` (masked secret, reusing the existing `secretSettingKeys` pattern, no test-connection button since grade-importer has no lightweight test endpoint).
- Decisions: read grade-importer's `app.py`/`database.py` source directly rather than guessing its API, to avoid colliding assignment/student ids in its own space (confirmed `apply_sync_data` does `ON CONFLICT(id) DO UPDATE`, so a guessed id can silently overwrite an unrelated row). Export payload carries only `english_name`/`class_filter`/`score` fields, no mention of AI, marking method, or InkHeron internals. Errors from the upstream app (401, network failure, non-2xx) are caught and returned as a friendly 400/502 JSON response, never thrown to a 500.
- Verified: `node --test test/assignments.test.js` — 17/17 pass, including 2 new tests (payload excludes ghost/demo/unscored students and any AI-related wording; upstream 401 surfaces as a friendly error). Full suite `node --test "test/*.test.js"` — 129/133 pass; the 4 failures (`app.test.js` EAP library admin 401 check, `auth.test.js` password_hash exposure, `identity.test.js` classes/students CRUD, `identity.test.js` roster page content) are pre-existing baseline failures unrelated to any file touched here — none of them exercise settings, assignments export, or adminExport.js.
- Open / next: item 4 (AI-mention audit on student-facing surfaces) still pending. Noted a pre-existing gap (not introduced here, not in scope for this handoff): `fetchDashboardRows`/the CSV export from item 1 do not filter out demo/ghost students from the teacher dashboard view — worth a separate task later.
- Gotchas hit: `node --test test/` (bare directory) fails with `MODULE_NOT_FOUND`; use `node --test "test/*.test.js"` instead. Commit `defd94f`.

## 2026-07-05 — SONNET_HANDOFF_2 item 2: conversational tone pass on feedback prompts

- Phase/Step worked: SONNET_HANDOFF_2.md item 2.
- Built: replaced the "Copy rules" line in both `feedbackSuggester.js` DOER_SYSTEM_PROMPT and `profileSummarizer.js` DOER_SYSTEM_PROMPT with an instruction to write like a friendly teacher talking directly to the student (use "you", contractions, short sentences, low C1), plus the exact stiff/wanted example pair from the handoff. Kept the no em/en dash, no Oxford comma, metric-only rules and the 3-6 word title-length constraint. Did not touch literacy CODE labels or the CHECKER prompts (checker only verifies support, not tone).
- Decisions: applied the identical wording to both services rather than writing two different tone instructions, since the handoff specified "same tone instruction" for profileSummarizer's writing_summary/voice_summary/targets.
- Verified: `node --test test/feedbackSuggester.test.js test/profileSummarizer.test.js` — 15/15 pass. No test hardcodes the prompt text, and these are AI prompt strings that only affect live model output, so not independently browser-verifiable without a real OpenRouter key.
- Open / next: items 3-4 (admin gradebook export, AI-mention audit) still pending.
- Gotchas hit: none. Commit `cf19da5`.


## 2026-07-05 — SONNET_HANDOFF_2 item 5: batch feedback release

- Phase/Step worked: SONNET_HANDOFF_2.md item 5 (first of the three remaining items after "go finish the other 3 things").
- Built: migration `027_feedback_released_at.sql` adds `assignments.feedback_released_at TEXT`. New `settings_json.feedback_release` field ('immediate' default | 'batch'), exposed as a select in `new-assignment.html` right after Supervision. New `POST /api/assignments/:id/release-feedback` (teacher, CSRF) stamps `feedback_released_at` and fires `notifyTeacher` once (skips re-notifying on repeat calls), returns `{released: true}`. In batch mode, while `feedback_released_at IS NULL` and the pad is `marked`/`green_pen_open`/`resubmitted`: `GET /api/native/assignments/:id/feedback` returns a minimal `{pad, feedback_released: false, message}` body instead of feedback/annotations/rubrics; `GET /native/write/:assignmentId` (the green-pen rewrite page) 403s with `feedback_not_released`; and the `save`/`submit` pad routes also 403 for a `green_pen_open` pad, as defense-in-depth against an already-open editor tab. `native-feedback.html`'s `boot()` now checks `feedback_released === false` and shows the friendly message instead of calling `render()`. Immediate mode (the default) is untouched — confirmed by a dedicated test.
- Decisions: reused the existing `notifyTeacher` ServerChan helper rather than inventing a new notification type (spec only said "fires the ServerChan notify", no new content specified). Did not add a teacher-dashboard "release feedback" button — the handoff text for item 5 names no HTML file to change (unlike item 1), so wiring the backend + the one field the spec did name (new-assignment settings) is as far as this item goes; flagging the missing trigger UI as an open item below rather than building it unprompted. Mid-edit I initially let item 6 scope (a `semester` field) creep into the same `buildSettingsJson` edit — caught it before running tests and backed it out so this commit is item 5 only.
- Verified: `node --test test/assignments.test.js test/nativePads.test.js` — 38/38 pass, including new tests `feedback_release defaults to immediate and is validated when given`, `release-feedback stamps feedback_released_at once and is idempotent`, `batch feedback_release holds feedback and green pen rewrite until teacher releases`, `immediate feedback_release (default) is unaffected by the batch gate`. Full suite `node --test "test/*.test.js"` — 134/138 pass, same 4 pre-existing baseline failures as before (EAP library admin 401 check, login password_hash exposure, classes/students CRUD, roster page content) — unrelated to this change. `migration.test.js`'s hard-coded migration-file list and `assignments` column list were updated for the new migration/column. Also checked the new form field live in the browser via the `inkheron-verify` preview server: field renders in the right position, and a real `POST /api/assignments` through the running app round-trips `feedback_release: 'batch'` correctly.
- Open / next: items 6 (semester tags) and 7 (report snippet endpoint) still pending. No teacher-dashboard UI button exists yet to trigger `/release-feedback` — teacher would need to call the API directly (e.g. via a future assignments.html button) until that's requested.
- Gotchas hit: none beyond the item-5/item-6 scope mixing caught and reverted before testing. Commit `0bbaa29`.

## 2026-07-05 — SONNET_HANDOFF_2 item 4: AI-mention audit on student-facing surfaces

- Phase/Step worked: SONNET_HANDOFF_2.md item 4 (last of the four in-scope items).
- Built: grepped `native-feedback.html`, `nativeWrite.js`, `student-dashboard.html`, `student-change-password.html`, `login.html`, `inkpad-home.html`, `index.html` for "AI"/"model"/"checker"/"suggestion" wording. No visible copy leaked anything (the one "model texts" hit on `index.html` is the ELT term for an exemplar essay, not an AI model). The real leak was in the JSON itself, not rendered text: `native_feedback_items.source` (`'ai'` vs `'teacher'`) and a `literacy_code` annotation's `metadata.source`/`metadata.suggestion_id` (`'ai_auto'` from `autoPromoteSuggestions`, `'ai_accepted'` from the teacher-accept endpoint) were being sent verbatim to the student's own session in three routes: `GET /api/native/assignments/:id/feedback`, `POST /api/native/pads/:padId/feedback-items/:itemId/toggle-check`, and `GET /api/native/pads/:padId/greenpen-context`. Neither field is rendered anywhere in `native-feedback.html`/`nativeWrite.js` (confirmed by grep) — the only consumer of `source` is the teacher's `native-review.html` ("AI" vs "Added by you" tag), which is fine to keep. Added `studentSafeFeedbackItem`/`studentSafeFeedback`/`studentSafeAnnotation` wrappers in `src/routes/nativePads.js` and applied them at exactly those three student-facing call sites; teacher-facing routes (`/review`, `/feedback-items` GET, `/suggestions`) are untouched.
- Decisions: stripped at the API-serialization layer only, not the database — `ai_auto`/`ai_accepted` stay in `metadata_json` and `native_feedback_items.source` stays in the DB column, since teacher tooling and the existing `autoAccept.test.js` DB-level assertions depend on them. This keeps the fix minimal (three call sites) rather than touching `publicAnnotation`/`publicFeedbackItem` globally, since those are shared with teacher routes.
- Verified: new test `student-facing feedback and marks never reveal AI as the source` in `test/nativePads.test.js` — seeds an AI-sourced feedback item and an auto-promoted literacy annotation, drives a pad through submit → finish-marking → green-pen, and asserts the student's `/feedback` and `/toggle-check` JSON bodies contain no `"source"`/`ai_auto`/`ai_accepted`/`suggestion_id` anywhere, while confirming the teacher's `/feedback-items` view still reports `source: 'ai'`. `node --test test/nativePads.test.js` — 17/17 pass. Full suite `node --test "test/*.test.js"` — 130/134 pass, same 4 pre-existing baseline failures as before this change (unrelated: EAP library admin 401 check, login password_hash exposure, classes/students CRUD, roster page content).
- Open / next: all four items from SONNET_HANDOFF_2.md are now done and committed. Items 5-7 (batch feedback release, semester tags, report snippet endpoint) remain out of scope unless asked. Also still open: the pre-existing gap noted in item 3's entry, that `fetchDashboardRows`/the CSV export do not exclude demo/ghost students from the teacher dashboard (not introduced this session, not in scope here).
- Gotchas hit: none. Commit `72696fc`.
