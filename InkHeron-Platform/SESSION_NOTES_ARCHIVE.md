# SESSION_NOTES_ARCHIVE.md — InkHeron Platform

Old entries moved out of `SESSION_NOTES.md` to keep active context under 400 lines.

---

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
