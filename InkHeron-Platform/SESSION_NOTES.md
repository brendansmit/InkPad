# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

Entry format:
```
## YYYY-MM-DD — <short title>
- Phase/Step worked: 
- Built: 
- Decisions: 
- Open / next: 
- Gotchas hit: 
```

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
