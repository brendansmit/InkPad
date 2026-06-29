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
