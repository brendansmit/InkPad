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
