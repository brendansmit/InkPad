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

## (template — delete this block once real entries exist)

## 2026-06-25 — Buildbook foundation created
- Phase/Step worked: pre-build setup
- Built: CLAUDE.md, buildbook/INDEX.md, this file. Student + teacher UI mockups already exist.
- Decisions: Writing portal is day-one; Tests portal later. SQLite. Node/Fastify wrapper.
  Singapore droplet. Porkbun DNS-only. Hashed passwords, teacher-reset only. Word count always on.
  Targets coach (explain), grammar codes answer-free, strengths expand. Paste detection day-one.
- Open / next: write remaining phase files (1–8), then begin Phase 1.
- Gotchas hit: none yet. (Watch: nginx WebSocket headers for Etherpad; custom paste plugin is the
  main time-risk.)
