# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

## 2026-07-26 — Switched the default Doer to Kimi K3

- Changed the backend Doer default and teacher settings fallback to the exact OpenRouter model id `moonshotai/kimi-k3`, added Kimi K3 as the first Doer option and retained the different-family checker guard. Updated the model-flow test and verified it passes on the required Node 24 runtime. A saved production setting still needs an explicit update during deployment.

## 2026-07-26 — Planned reconciled literacy taxonomy implementation

- Inspected the final Kimi K3-adjudicated files: 67 codebook entries, 1,471 confirmed examples, 225 review candidates and 203 exclusions. The confirmed corpus contains 1,376 kept labels, 90 recodes, one split annotation and four added missed errors; review candidates contain 164 demotions, 60 retained candidates and one added missed review item. All confirmed and review codes exist in the codebook, IDs are unique across both sets and 65 codes have confirmed examples. Prepared a staged implementation plan covering a central registry, backward-compatible storage, prompt/checker upgrades, hierarchical review UI, student/profile/export updates, grouped evaluation, shadow mode and controlled rollout. No grading code changed.

## 2026-07-26 — Audited expanded literacy-code workbook

- Inspected and visually verified all three sheets in `Codex_Literacy_Code_Dataset_Standalone.xlsx` without modifying it. The workbook contains 1,893 annotations from 39 students, 1,833 confirmed labels, 60 review candidates and a consistent 66-code taxonomy. All dataset codes exist in the codebook, codebook occurrence/student counts reconcile exactly, IDs and exact annotations are unique and only 46 approximate sentence numbers are blank. Recommended a phased rollout using Tier 1 and Tier 2 codes first, hierarchical UI, exact-code checker validation, grouped holdout evaluation and legacy-code preservation rather than a one-step 66-code replacement.

## 2026-07-26 — Optimistic Needs-your-attention checkpoint

- Made contested literacy decisions update before the network save completes. Keep and change place a provisional mark immediately, reject removes the contested highlight immediately, repeat clicks are blocked and failed saves restore only the affected suggestion before reconciling with the server. This targeted rollback avoids undoing a second rapid decision. Added static ordering, rollback and JavaScript syntax tests; focused tests passed 4/4 on Node 24.
- Full suite passed. Deployed static page commits `f21b2e9` and `843d59c` without restarting the service, after backing up the live file as `.bak-attention-843d59c`. Production hash matches, the wrapper stayed active and the internal login health check returned 200 in 8 ms. Production browser navigation timed out, so the deployed page was verified by hash, static behavior contracts and the full integration suite.

## 2026-07-26 — Compact review payload checkpoint

- Added an opt-in compact form of the teacher review response and switched the marking page to it. It omits unused full-text revision history, comparison data, student profile and feedback options while preserving the existing full API contract. On local seeded data the response fell from 2,446 bytes to 1,054 bytes and route time fell from 6.43 ms to 1.99 ms. Integration and full-suite tests passed on Node 24. Localhost browser QA was blocked by the browser security policy, so verification used API injection, JavaScript parsing and direct payload measurement.
- Deployed commits `5ea8c16`, `0a1d6b4` and `d653eea` to production after backing up both runtime files with suffix `.bak-performance-d653eea`. Production hashes match, the wrapper is active, public and internal health checks return 200, unauthenticated compact review correctly returns 401 and the post-restart error journal is empty.

## 2026-07-26 — Review mutation performance checkpoint

- Replaced full review reloads after minor marking actions with local updates from the mutation responses. Changing or removing codes, adding or editing comments, resolving literacy suggestions, accepting or rejecting feedback suggestions, adding or removing feedback items, switching feedback banks and scoring rubric criteria now use one save request and redraw only affected UI. Preserved rail scroll position, added saving states to code changes and kept the cached queue accurate after finishing an essay. Static interaction and JavaScript syntax tests passed 7/7 on Node 24.

## 2026-07-26 — Review loading performance checkpoint

- Reduced initial review loading from three serial data requests to two concurrent review requests followed by the assignment queue only when it is not already cached. The queue is cached per assignment in session storage for five minutes so moving between essays avoids downloading the same class dashboard repeatedly. Added a static performance contract test. Focused tests passed on Node 24; the system Node 20 cannot run the existing `node:sqlite` tests.

## 2026-07-26 — Repaired and monitored Ubuntu maintenance updates

- Diagnosed the custom nightly updater's repeated status 125 failure: GNU `timeout` rejected the invalid duration `3h45m`, so the wrapper had never run updates after installation. Replaced it with a valid 45-minute ceiling, five-minute package lock wait, `dpkg --configure -a` recovery, low CPU and idle disk priority plus a 55-minute systemd limit. Added `--with-new-pkgs` so kernel metapackages can bring required dependencies without allowing removals. Backed up the live updater and database, then monitored two successful passes while InkHeron remained active and `/login` returned 200. All packages are current, `dpkg` is clean, the retry marker is absent and no units are failed. Kernel 6.8.0-136 is installed; the droplet still runs 6.8.0-124 until a separately approved planned reboot. Repair commits: `b902734` and `39614f0`.

## 2026-07-26 — Fixed assignment header spacing

- Reworked the assignment detail header so the title occupies a full-width row, feedback status aligns beside it and all actions sit in a separate wrapping toolbar with Archive and Delete grouped at the end. Mobile actions stack at full width. Browser QA passed at the supplied 2048 px screenshot width and at 390 px with no overflow or console errors; full suite passed 186/186. Committed as `d53e80a` and deployed only `public/teacher/assignments.html`. Production hash matched and the previous page is backed up as `/opt/inkheron-platform/public/teacher/assignments.html.bak-header-spacing-20260725T184710Z`.

## 2026-07-26 — Moved essay downloads to assignment-level selection

- Removed downloads from the individual review page and added `Download essays` beside the assignment-level actions. The modal independently loads all essays for the selected assignment or grouped classes, supports per-student checkboxes, Select all, Clear, Raw or Reviewed state, single DOCX, selected DOCX ZIP and selected compiled PDF. Added selected-pad export routes with strict ID validation and real-student filtering. Browser QA passed with three students and no console errors; full Node 24 suite passed 186/186. Committed as `3a90630` and deployed only the two pages and two export backend files. Production service is active, deployed hashes match and backups use suffix `20260725T183156Z`.

## 2026-07-26 — Diagnosed teacher login redirect failure

- After the essay export deployment, a persisted student session caused `teacher-login.html` to redirect to `/teacher`, which correctly returned 403. Confirmed the service and database were healthy. Added a regression-tested fix so only teacher sessions bypass the teacher login form; focused authentication tests passed 10/10 and the preceding full suite passed 184/184. Committed the fix as `f37d195`, then deployed only `teacher-login.html` after explicit approval. Production returned 200 and the deployed hash matched; the previous page is backed up as `/opt/inkheron-platform/public/teacher-login.html.bak-login-fix-20260725T180511Z`.

## 2026-07-26 — Deployed essay export downloads

- Deployed commit `50b010b` to `/opt/inkheron-platform` after backing up the production database to `/opt/inkheron-platform/data/backups/inkheron.db.pre-essay-export-20260725T171657Z`. Installed production dependencies and restarted `inkheron-wrapper`; the service is active and `/login` returns 200. Verified the individual DOCX, assignment ZIP and compiled PDF routes are present and authentication-protected. The pre-deploy suite passed 184/184 tests. npm reported four high-severity dependency audit findings, which were not changed during this scoped deployment.

Entry format:
```
## 2026-07-25 — Essay export downloads completed

- Finished the teacher review download menu with two states (Raw submission and Commented and reviewed) and three formats (individual DOCX, class ZIP of DOCX files and compiled class PDF). Reviewed DOCX exports use true Word comments on highlighted spans and include strengths, targets and general comments. Reviewed PDFs use numbered inline markers plus a review summary. Visual QA passed for rendered DOCX and PDF samples. The in-app browser blocked localhost, so UI behaviour was verified through static page contracts, syntax checking and endpoint integration tests. Full Node 24 suite: 184/184 passing. Restored `pdfjs-dist` as an explicit dependency because npm exposed the existing PDF upload extractor's undeclared runtime dependency. Not deployed.

## 2026-07-25 — Essay export backend checkpoint

- Added teacher-only essay export services and routes for raw submit snapshots or reviewed copies. Supports individual DOCX, assignment ZIPs of DOCX files and compiled PDFs. Reviewed DOCX files carry true Word comments anchored to marked spans plus review summaries. Demo and ghost students are excluded. Added structural endpoint tests covering authorization, source-state separation, Word comment wiring, ZIP contents and PDF validity; 2/2 feature tests pass on Node 24.

## 2026-07-25 — Compiled raw Personal Statement second drafts

- Asked to extract the pre-review Personal Statements Second Draft essays and combine them into one Word document. Used the latest `reason = "submit"` revision for each active EAP student, excluding the Greenpen rewrite, archived assignments, demo/ghost users and one 17-word Audit Class test record. Compiled 39 essays and 23,285 source words into `Personal Statements Second Draft - Raw Submissions.docx` without commentary, annotations or corrections. Rendered and visually inspected all 70 pages, then verified the DOCX ZIP structure. The document contains student data and was deliberately not committed to Git.

## 2026-07-25 — Confirmed read-only production database access

- Asked whether Codex could access student essays on the droplet. Confirmed SSH access to `root@167.172.71.219` and opened `/opt/inkheron-platform/data/inkheron.db` with SQLite read-only mode. Verified the submissions and native writing tables exist without reading any student content or changing production.

## 2026-07-24 — Deployed the UI-only fixes to production

- Teacher asked to deploy only the UI changes (not the spelling/marking change). Built branch deploy-ui = analysis-ai + the two UI commits (submit confirmed state, grading UI: full sentence + rubric targets + toolbar offset). Spelling change deliberately excluded. Suite 181/181 green.
- Drift found: production /opt/inkheron-platform/src/views/nativeWrite.js carried an uncommitted testReturnUrl/exam-mode block (Back-to-test banner + link) that was never in the repo. Deploying the repo version blindly would have deleted that live feature. Fix: merged the submit-button change ONTO the live file (preserving exam mode), verified the diff was only my 5 changes, and committed that merged file back so the branch matches production.
- Deploy method: SSH to root@167.172.71.219, backed up db to data/backups/inkheron.db.pre-uideploy-20260724-013428 and both files to .bak-20260724-013428, scp'd the two files in, chown inkheron, systemctl restart inkheron-wrapper, curl /login = 200. Deployed file hashes verified against intended. Only nativeWrite.js and native-review.html changed; no migrations, no marking change, data untouched. native-review.html on prod matched analysis-ai exactly before deploy.
- Still NOT deployed: the British/American spelling change (branch mobile-grading-fixes). Repo drift beyond nativeWrite.js may exist; the GitHub deploy clone (/opt/inkheron-repo) is still not set up, so this was a targeted file deploy, not deploy.sh.

## 2026-07-23 — GitHub backup and a safe GitHub-based deploy path

- Backed up the whole parent Claude/ monorepo to the private GitHub repo brendansmit/InkPad (SSH, all 7 branches). data/*.db stays gitignored so no live data is in Git. Two gaps noted to the teacher: 6 nested git repos back up as pointers only, and Grammar Arcade/Gramm-Builder.zip (103 MB) exceeds GitHub's 100 MB limit and was ignored.
- Branch reality: analysis-ai == test-greenpen (84bd382) is the clean complete production line (migrations 001-032, includes the TOEFL feature). toefl-estimate is NOT a release branch: it carries a whole-repo backup snapshot commit plus two unreviewed migrations 033/034. Deploy from analysis-ai only.
- Added deploy/deploy.sh + deploy/DEPLOY.md on analysis-ai (pushed, 050c139). Deploy = back up db, fetch+reset a SEPARATE repo clone to origin/<branch>, rsync only src/migrations/public into /opt/inkheron-platform, npm ci --omit=dev if package.json changed, systemctl restart inkheron-wrapper (migrations self-apply on boot via openDatabase, additive only), curl /login. data/ is never synced or cleaned. One-time droplet setup (deploy key + clone) is in DEPLOY.md. Did NOT deploy (Fable-only).

## 2026-07-07 — Audited Codex MCQ/import run: pass, awaiting deploy word

- Audited 25c918e..075b54f against CODEX_MCQ_HANDOFF.md: all new routes (topics, bulk-import, append-questions) teacher-session gated with CSRF on mutations; answer_index/model_answer only in teacherQuestion payloads and the existing reveal_answers release gate; service edits are a uniform swap of the hardcoded checker intent to readCheckerIntent(db) for the model picker; migration 032 registered. Suite 181/181 on Node 24 at pinned 075b54f.
- test-greenpen and analysis-ai pinned to 075b54f. Deploy archive built (/tmp/d4.tar.gz, src migrations public, 120 paths). NOT deployed: waiting for the teacher's explicit deploy word. Note 082ac44 touches grade-importer (separate app, not in the InkHeron archive).

## 2026-07-07 - Bulk MCQ import, test setup, nav, settings and grade-importer sync key

- Asked: implement CODEX_MCQ_HANDOFF.md in Part A to G order, commit after each part, pull/re-read active files first, keep teacher mutation routes teacher+CSRF, avoid hardcoded OpenRouter ids, keep assets self-hosted and add section 9 tests.
- Did: added migration 032 for question topics/tags/origin, topic/search/quiz filters, bulk MCQ import from CSV/paste/docx with Doer parsing and answer-null warnings, selectable question-bank UI with shift-range and import, multi-section quiz builder with per-section shuffle, Tests dashboard entry, assignments ?type=test filter, curated Doer/Checker settings with stored ai_checker_intent and different-family guard, and grade-importer current sync-key Show/Copy controls.
- Commits: 5221f54, 81bc1f1, 6b7c0d5, 9400f6a, 5ab65d1, 057d21c, 082ac44. Grade-importer deployed via ./grade-importer/deploy.sh using the current shared sync key; PM2 restarted and nginx reloaded.
- Verified: PATH=/Users/brendansmit/.nvm/versions/node/v24.18.0/bin:$PATH npm test passed 181/181. Inline scripts checked for question-bank, new-test, settings, dashboard, assignments and grade-importer.
- Notes: this checkout has no git remote, so git pull could not run after the initial sandbox retry. The current branch has no upstream. Existing unrelated dirty files remain untouched, including package.json/package-lock.json and grade-importer/grades.db.

## 2026-07-07 — Codex handoff: bulk MCQ import + test portal / nav / settings brief

- Asked: teacher out of usage; wants a complete paste-ready brief for Codex to build bulk MCQ import (paste + file) straight into a quiz, AI topic/tag on filing, question-bank filter by quiz/topic, per-question toggle + shift-range select + add-selected-to-quiz, a proper sections editor, a dedicated Tests dashboard button, merge duplicate Classes/Students nav, a curated Doer/Checker model picker in Settings (strong-cheap Chinese + cheaper Western), and reveal/copy for the grade-importer sync key.
- Did: wrote InkHeron-Platform/CODEX_MCQ_HANDOFF.md — full self-contained build brief grounded in the real codebase (test_questions schema, tests.js endpoints/helpers, settings.js + settingsStore doer/checker intents, openRouter callChat/resolveModel, teacher/index nav, grade-importer sync_key). No app code changed this session.
- Key facts surfaced: checker intent is hardcoded 'google gemini flash' in 3 files (checker.js, profileSummarizer.js, feedbackSuggester.js); doer intent is a stored setting; admin gradebook export key == grade-importer sync_key (current value in notes); next migration number is 032; DeepSeek has no V6 (latest V3.2, which 'deepseek chat v3' resolves to).
- Flagged: tests.js/new-test.html/question-bank.html are under active concurrent development in this repo; Codex must pull latest and re-read before editing.

## 2026-07-07 — Audited TOEFL build, fixed the card, verified end-to-end

- Audited Sonnet's toefl-estimate branch: routes all teacher-session + CSRF, wall test present (padRelease asserts no "toefl" in student feedback payload), demo/ghost excluded from anchors, checker can only blank, range kept ordered, migration 031 registered. Suite 176/176.
- Sonnet's worry about /api/students/:id/writing-profile was the known ugrep gotcha: the route exists (nativePads.js:2167) and the page boots fine.
- Found and fixed one real bug (1681636): loadToefl() ran before the card was in the DOM, so getElementById returned null and the card hung on "Loading…" forever. Moved the call to after append.
- Verified end-to-end on a local server (port 3474, fresh DB, seeded 2 submitted essays): card renders, Record real score works ("Real scores on record: 24"), Generate without an OpenRouter key fails gracefully (alert + button re-enabled). Live-model happy path untestable locally; teacher clicks Generate on production where the key exists.
- test-greenpen and analysis-ai fast-forwarded to 1681636. NOT deployed: awaiting explicit go-ahead.

## 2026-07-07 — Built teacher-only TOEFL writing estimate (branch toefl-estimate)

- Asked: build the TOEFL estimate per SONNET_TOEFL_HANDOFF.md exactly, off test-greenpen, keep the suite green, no deploy.
- Migration 031_toefl_estimates.sql: toefl_estimates (history kept, newest wins) and known_toefl_scores (teacher-entered real scores 0-30, class anchors). Registered in migration.test.js.
- src/services/toeflEstimator.js: Doer/Checker modelled line for line on profileSummarizer. Evidence = literacy issue rates per 100 words, rubric trajectory, aggregateStyleProfile (overall + by_essay_type), word counts, real classmate scores as anchors (demo/ghost excluded via realStudentsWhere). Output is a range, checker can only blank fields, reversed ranges reordered, skips cleanly under 2 style essays.
- src/routes/toefl.js (registered in app.js): GET latest+history+known scores, POST generate+store, POST record known score. All requireTeacherSession, POSTs requireCsrfToken, 404 on unknown student.
- UI: teacher-only "TOEFL estimate" card on student-profile.html with range, bands, confidence, rationale, Generate/Refresh, real-score input, fixed disclaimer. Hidden in student mode.
- The wall: added assertion to padRelease.test.js that a released student feedback payload contains no "toefl". New estimator/route tests cover shape, range ordering, checker blanking, skip, known-score insert + evidence inclusion, auth 401, 404, bad score.
- Suite 176/176 green on Node 24 (was 168, +8). Not deployed. Committed in small steps.

## 2026-07-07 — Softened AP register prompt; TOEFL handoff written

- Teacher feedback: the register guidance must not prescribe how the essay types should sound unless grounded in AP theory; phrase as tendencies ("this essay type usually leans toward..."). Rewrote the profileSummarizer Doer prompt: tendencies not rules, describe never prescribe, deviations are observations to think about, not faults (20f4c19).
- TOEFL predictor will be built by Sonnet or Opus, not Fable: wrote SONNET_TOEFL_HANDOFF.md (25a4520) — branch toefl-estimate, migration 031 toefl_estimates + known_toefl_scores, Doer/Checker estimator modelled on profileSummarizer, teacher-only routes, profile-page card with disclaimer, hard wall test that no student payload ever contains "toefl". Fable audits and deploys after.

## 2026-07-07 — Genre-aware voice analysis for AP Lang

- Asked: make the voice/writing analysis AP Lang aware — synthesis, rhetorical analysis and argument each demand a different voice; track more and convey more. Also plan (not build) a teacher-only TOEFL writing score predictor.
- Found: the fingerprint was genre-blind. essay_type existed on assignments but style_metrics ignored it: aggregation blended all types, anomaly detection compared across genres, the AI voice summary described one blended voice.
- Built (commit 1a44ac7): 7 new deterministic register features (attribution verbs, rhetoric terms, concession markers, quoted evidence, second person, contractions, nominalizations, all per 100 words); migration 030 adds essay_type to style_metrics with backfill from assignment settings; aggregateStyleProfile returns by_essay_type fingerprints; detectStyleAnomaly uses same-type history when >= 3 same-type essays exist (returns baseline: same_type|all_types) so a genre shift no longer reads as an anomaly; profileSummarizer evidence gains per-type fingerprints and per-type score trajectory, and the Doer prompt teaches the three AP registers and asks for voice-shift assessment and type-tagged targets.
- Tests: 3 new in styleMetrics.test.js; suite 168/168 on Node 24. NOT deployed.
- TOEFL predictor: plan delivered in chat, not built. Awaiting go-ahead.

- Deployed in two steps to inkpad.inkheron.app (git archive of committed tree only, DB backed up before each: inkheron.db.pre-testgp-202607071620 and .pre-gpscore-202607071633, /login 200 both times, journal clean):
  1. 9e21cc9: Codex part 1 (green pen for tests), part 2 (section passages + within-section LCG shuffle, f227add, spot-checked against spec: correct files, seed (studentId*104729)+sectionIndex, both shuffle tests, additive, no migration), mobile native review UI, AI review reset for strengths and targets.
  2. ab1e4ef: green pen score hold + separate gradeable rewrite assignment on release (see entry below). ab1e4ef is the cleaned redo of f2db8bc, which had swept ~12k lines of unrelated files (data/passages PDFs, other projects) into the commit; ab1e4ef drops them.
- Each deployed commit was independently verified in an isolated git worktree: npm test 165/165 on Node 24 at both 9e21cc9 and ab1e4ef.
- analysis-ai fast-forwarded to ab1e4ef = test-greenpen. Everything through ab1e4ef is now DEPLOYED.
- Gotcha for next time: two sessions were editing this working tree at once; refs moved mid-deploy twice. Staged my own hunk via git apply --cached and pinned every verify/deploy to a commit hash, never a branch.

## 2026-07-07 — Green pen: hold scores at finish-marking, create a separate rewrite assignment on release

- Asked (teacher, real marking): finish-marking was releasing the score immediately; scores must stay hidden until "Release to class". And on release OR per-student "Send feedback", auto-create a NEW assignment for the green-pen rewrite that is graded separately (own rubric, renamed later). Teacher chose: create on release OR send feedback (idempotent).
- Model change (updates CLAUDE.md §6): finish-marking now always lands the pad on 'marked' and reveals nothing. The green-pen rewrite is a SEPARATE assignment, not an in-place reopen of the same pad.
- Backend (nativePads.js): new exported ensureGreenpenRewriteForStudents(db, sourceAssignmentId, teacherId, studentIds) — idempotent, finds the existing rewrite assignment via rewrite_of_pad_id links (survives assignment edits, no settings field to strip), creates it on first release, adds only students not already present. Extracted copyEssayPadIntoRewrite (seeds a fresh 'writing' pad with the student's essay + copied teacher marks as reference). finish-marking → 'marked'; under immediate release it also creates the rewrite (no separate release click in immediate mode); batch defers to the release endpoints. Per-pad release-feedback and class-wide /api/assignments/:id/release-feedback both call ensure and return {rewrite_assignment}. toggle-check extended so target tick-off works on the separate rewrite pad (items resolve to the original).
- UI: native-review finish toast now "Marked. Score held until you release to the class."; Send feedback and Release to class toasts report the rewrite assignment created.
- Tests: migrated the in-place green-pen tests (feedbackTickOff, three nativePads flows) to the separate-assignment model; suite 165/165 on Node 24. Browser + API smoke on inkheron-verify confirmed: batch finish-marking holds and creates no rewrite, release creates "Greenpen rewrite: ..." with the essay seeded, appears on the student dashboard.
- Not deployed: still local on analysis-ai. Needs droplet pull + pm2 restart. NOTE for teacher: existing assignments already sitting in green_pen_open from the old flow keep working; the new behaviour applies to newly finished marking.

## 2026-07-07 — Run AI review now replaces AI strengths and targets too

- Asked: re-running AI review must clear the previous AI marks (accepted or rejected AI marks count as AI, only hand-placed marks are the teacher's) and also reset strengths and targets. Finished students (Alex, Aurora) must be untouched.
- Literacy codes already behaved this way (a102088, deployed). Added retractAiFeedbackForPad in nativePads.js: on re-run it deletes accepted AI suggestions and the source 'ai' feedback items they were promoted to, plus pendings; rejected suggestions stay on record; teacher-written items are never touched. Wired into reanalyzePad. New test in autoAccept.test.js.
- Retract only fires on a pad the teacher re-runs, so finished students stay untouched unless the assignment-wide reanalyze endpoint is used, which re-runs everyone.
- NOTE: another session is editing this working tree concurrently (assignments.html, assignments.js, nativePads.js, two test files). Staged only my hunk of nativePads.js via git apply --cached. Commit 2a6c36e. Suite 165/165 green in the shared working tree.
- Not deployed yet; rides along with the pending test-greenpen merge decision.

## 2026-07-07 — Pared-down mobile student roster

- Asked: on mobile, the student assignment roster needs a pared-down default, an expand toggle, a floating search bar and a floating top button.
- Did: mobile roster cards now show only student, Submitted, score and actions by default; `Review essay` is the large primary full-width button, with `Profile` and `Unassign` as smaller paired buttons.
- Did: added a sticky mobile `Show details` toggle for paste/exam details, a bottom floating student search and a floating `Top` button.
- Verified: assignments inline script syntax OK; `test/assignments.test.js` passed 20/20 on Node 24. Not deployed yet.

## 2026-07-07 — Mobile assignment review flow

- Asked: the assignment list and student essay list were still not mobile-friendly; the review page fix was too narrow.
- Did: updated `public/teacher/assignments.html` so the assignment list header/actions stack on mobile, assignment cards expose usable full-width action buttons, the assignment detail controls stack and the student roster gets a dedicated mobile card view with prominent Review essay/Profile/Unassign actions.
- Did: added a visible roster loading state so slow network/server restart does not look like a dead blank table.
- Verified: assignments inline script syntax OK; `test/assignments.test.js` passed 20/20 on Node 24. Live `https://inkpad.inkheron.app/assets/teacher/assignments.html` is still the old file and does not contain this commit yet.

## 2026-07-07 — Checked mobile review deployment

- Asked: check whether the mobile native-review UI fix has been deployed.
- Did: fetched `https://inkpad.inkheron.app/assets/teacher/native-review.html` and confirmed the live HTML contains the mobile markers from commit `56d2a10`: `@media (max-width:760px)`, two-column tablet rail, `placeFloating`, `ontouchend`, larger button targets and scrollable rubric scale.
- Verified: live static asset returned 200, protected `/teacher/native-review` returned 401 unauthenticated as expected, live asset `last-modified` was Tue, 07 Jul 2026 08:15:34 GMT.

## 2026-07-07 — Mobile native review UI

- Asked: make `/teacher/native-review*` usable for grading and feedback on a phone or iPad.
- Did: made the review page responsive: tablet becomes a single paper column with a two-column control rail, phone becomes one column, appbar controls wrap, essay text and touch targets are larger, rubric score buttons scroll horizontally and feedback/comment inputs avoid mobile zoom.
- Did: clamped selection, comment and code-change popovers inside the viewport and added a touch-end selection hook for mobile text selection.
- Decisions / gotchas: left unrelated existing edits in `public/teacher/native-review.html` intact; browser visual verification was blocked by the in-app browser safety preference for `127.0.0.1:3480`.
- Verified: inline script syntax OK with Node 24; seeded a temp DB and served the page locally; `test/nativePads.test.js` was 16/19 with the three existing green-pen state failures unrelated to this UI change.

## 2026-07-07 — Audit of Codex test-greenpen run: part 1 done, part 2 missing

- Audited branch test-greenpen against CODEX_TESTGP_HANDOFF.md and the nine ground rules.
- Part 1 (green pen for tests) is implemented in commit 7da2c0d: rewrite becomes type 'essay' with the test config stripped, pads seeded FRQ text first then SRQ Q+A blocks, FRQ annotations copied with valid offsets, rewrite_of_pad_id = FRQ pad or NULL, Green pen rewrite button on /teacher/test-review. Two new inject tests cover composite seeding, greenpen-context and the SRQ-only case. Suite 162/162 green on Node 24.
- nativeEnabled() was broadened to treat any type 'test' assignment as native-enabled; redundant (test settings already set native_inkpad true) and gated routes are teacher-only, so accepted.
- Part 2 (section passage_text plus within-section question shuffle, LCG seed (studentId*104729)+sectionIndex) was NOT built. No changes to src/routes/tests.js or the take-test page anywhere on the branch; the only passage_text hits are the old essay-level passage feature. Codex only added the part 2 spec text to the handoff doc.
- Not merged, not deployed. Waiting on the teacher: ship part 1 alone or send Codex back for part 2 first.

## 2026-07-06 — Reject any mark + configurable Doer model (DeepSeek default)

- Reject button in the click-a-mark popover: AI-suggestion marks route through the disagree endpoint (feeds calibration and blocks re-analysis resurrection); other marks use the existing DELETE annotations route, which now also records the rejection when a suggestion links to the annotation.
- Doer model is now a setting: ai_doer_intent (settingsStore read/writeDoerIntent, exposed in GET/PATCH /api/settings). Default flipped from 'anthropic claude haiku' to 'deepseek chat v3' on the teacher's call, with my agreement: DeepSeek found more genuine errors in the live smoke (64 vs 46), is trained heavily on Chinese-English usage (better calque/MT instincts), and is cheaper. All six Doer services (literacyCoder, markerProfile, implementationScorer, feedbackSuggester, profileSummarizer, reportSnippet) read the setting per call. Checker stays gemini flash (different family, CLAUDE.md §8 intact). Change models any time by PATCHing ai_doer_intent, e.g. 'moonshot kimi k2' or back to 'anthropic claude haiku'.
- Suite 162/162. Deployed (DB backup pre-doer), wrapper active.

## 2026-07-06 — Learning loop: teacher corrections calibrate the marking prompts

- New src/services/promptCalibration.js: buildCalibration(db) mines the three correction signals already recorded (rejected/disagreed suggestions = false positives; teacher-added literacy_code annotations = misses; annotation_updated events with code_from/code_to = confusion pairs, now logged with before/after codes and the quote) and renders a hard-capped CALIBRATION block ("the teacher rejected findings like these, do not flag similar", "the teacher had to add these by hand, watch for similar", "the teacher often changes Exp -> WW"). Appended to BOTH the Doer and Checker system prompts on every run, so accuracy improves for this teacher with every essay marked, no training step, ~zero cost.
- Also fixed a shell-tooling scare: the session's grep wrapper (ugrep --ignore-files) silently skipped nativePads.js making it look gutted; /usr/bin/grep confirmed the file intact. Use /usr/bin/grep or git grep in this repo.
- Suite 160/160. Committed 188cc70, deployed (DB backup pre-calib), wrapper active.

## 2026-07-06 — Test Portal (Codex build) audited, merged, deployed

- Audited Codex's test-portal branch against all nine CODEX_TESTPORTAL_HANDOFF ground rules. PASS:
  auth on every endpoint (teacher+CSRF / student session with own-row checks via ensureStudentTestAssignment);
  studentQuestion strips answer_index and model_answer with a key-walking leak test; results require
  submitted_at AND feedback_released_at, correct answers only shown when reveal_answers is explicitly true;
  server-side timer enforcement (due_at, seconds_allowed + 30 s grace) on answers and submit; deterministic
  per-student MCQ shuffle; focus events recorded; roster uses realStudentsWhere; migrations additive (029 in
  canon); no edits to services, the editor or the AI pipeline. Standout: submitFrqPad re-injects through the
  REAL /api/native/pads/:id/submit with the student's session, so FRQ essays get revisions, state machine and
  the full AI marking chain untouched.
- Fast-forward merged test-portal into analysis-ai, suite 156/156, deployed to /opt/inkheron-platform
  (DB backup pre-testportal), migration 029 applied, wrapper active, live 200.
- Teacher flow: /teacher/question-bank to build the bank, /teacher/new-test to assemble and assign,
  /teacher/test-review to mark SRQs and see totals (FRQ links into native-review). Students: dashboard shows
  a Test pill linking to /native/test/:assignmentId.

## 2026-07-06 — Deploy sweep + Codex Test Portal handoff

- Deployed everything committed since the round-3 deploy (10 commits from parallel sessions: re-run replaces prior AI marks via retractAiMarksForPad, anchored sidebar comments, neon chartreuse needs-you colour, reanalyze-all script, launcher/deploy-dashboard updates). Suite 152/152 before deploy, DB backed up (pre-deploy5), wrapper active, live 200.
- Wrote CODEX_TESTPORTAL_HANDOFF.md: self-contained Test Portal MVP spec for Codex on a NEW branch test-portal off analysis-ai. Key decisions: a test IS an assignment (type 'test', structure in settings_json.test), bank in test_questions, attempts/responses/focus-events tables in migration 029, ONE FRQ max delivered through the existing native pad so the whole marking+AI pipeline applies untouched, MCQ auto-scored server-side, SRQ teacher-scored, results gated on the existing release-feedback mechanism, deterministic per-student MCQ shuffle, server-side timer enforcement, §5 pooling stays off. Hard guardrails: additive only, no edits to services/editor/pipeline, explicit staging, answer keys never reach students pre-release (test required), Fable reviews before merge/deploy.

## 2026-07-06 — New session: queued marking-room issues

- Asked: fresh chat (old context 600k+); log three issues from the latest deployment.
- Did: added to POLISH_QUEUE.md Open: (1) needs-you colour still not standing out (verify 5c3bbcf is deployed, else stronger colour), (2) list teacher comments in the sidebar for edit/delete, (3) BUG: inline comments not anchoring to the highlighted text. No code changes yet, awaiting go-ahead.
- Also this session: fixed AI re-run stacking (Gra.Gra / Sp.Sp). New `retractAiMarksForPad` in nativePads.js deletes prior AI-auto annotations with profile-stat recompute and clears spent suggestion rows before every analysis run (reanalyze route and submit path); rejected suggestions are kept and identical re-found findings stay vetoed. Regression test added; suite 152/152 on Node 24. Commit 4e79e26. Server-side clear of Alex's pad + deploy blocked by SSH permission, handed commands to teacher.
- Needs-you colour: teacher said #fde047 still blends in; changed to neon chartreuse #ccff00 in native-review.html. Verified on a seeded local server (inkheron-verify, port 3473), screenshot checked. POLISH_QUEUE item moved to Done.
- Comment anchoring bug: offsetsWithin counted hidden .tip tooltip text inside marks, so every prior mark shifted saved offsets right. Now measured via cloned ranges with tips stripped. Verified in browser: comment on "study" saved at exactly 90-95 with three marks earlier in the text.
- Your comments sidebar card: lists inline comments with find/Edit/Delete; new DELETE /api/native/annotations/:id (recomputes literacy stats when deleting a code mark) with tests. Edit and delete exercised live through the UI. Suite 152/152.

## YYYY-MM-DD — <short title>
- Phase/Step worked: 
- Built: 
- Decisions: 
- Open / next: 
- Gotchas hit: 
```

---

## 2026-07-07 — Test Portal part 2: section passages and section shuffle

- Asked: "go check and do part 2" after the audit found `CODEX_TESTGP_HANDOFF.md` Part 2 missing.
- Built: `settings_json.test.sections[]` now preserves optional `passage_text`; `/teacher/new-test` has a passage textarea for MCQ, SRQ and FRQ sections; `/native/test/:assignmentId` renders passage text above each section in a readable serif block; `/teacher/test-review` shows section passages in a collapsed details block.
- Built: student take payload now shuffles question order within each non-FRQ section only when shuffle is true, using deterministic seed `(studentId * 104729) + sectionIndex`. Section order never changes; teacher review stays in authoring order; shuffle=false preserves authoring order.
- Verified: `node --test test/tests.test.js` passed 8/8, including passage payload/no-answer-leak, stable reload order, different per-student section-question order and shuffle=false authoring order. No deploy.
- Commit: `f227add` (`Add test section passages and section shuffle`).
- Full suite: Node 24 `npm test` ran 164 tests, 161 pass / 3 fail. The failures are pre-existing dirty-worktree `nativePads.js` semantics: finish-marking now returns `marked`, while three older native pad tests still expect `green_pen_open`. Part 2 touched only `src/routes/tests.js`, `public/teacher/new-test.html`, `public/native-test.html`, `public/teacher/test-review.html` and `test/tests.test.js`; those files are clean and committed.
- Open / next: reconcile the dirty `nativePads.js` finish-marking behaviour with its tests in the owning session, then rerun full suite. No deploy.

## 2026-07-07 — Test green-pen rewrites

- Asked: on branch `test-greenpen` from `analysis-ai`, follow `CODEX_TESTGP_HANDOFF.md` exactly; do not deploy; never `git add -A`.
- Built: test assignments are now eligible for the existing greenpen-rewrite endpoint. Test rewrites are created as essay assignments with test config stripped, draft submit behaviour, native InkPad on, green pen off, `greenpen_rewrite` true, `source_assignment_id`, `feedback_release: batch`, `supervision: in_class` and prompt "Rewrite your test answers using your feedback." For tests, rewrite pads are seeded from FRQ text first, then SRQ prompt/answer blocks in section order. FRQ annotations copy with identical offsets; `rewrite_of_pad_id` points to the FRQ pad when present and stays NULL for SRQ-only tests. Students with no written answers get no rewrite pad.
- UI: `/teacher/test-review` now shows a "Green pen rewrite" button once at least one attempt has been submitted and calls the existing rewrite endpoint.
- Verified: targeted `node --test test/nativePads.test.js test/greenpenContext.test.js test/tests.test.js` passed 27/27; full Node 24 `npm test` passed 158/158. No deploy.
- Commit: `7da2c0d` on `test-greenpen` contains the implementation and tests, though its commit title is mismatched ("Add section passages and within-section question shuffle to Codex handoff"). Left history intact rather than rewriting.

## 2026-07-07 — Test Portal MVP schema checkpoint

- Asked: build the Test Portal MVP on branch `test-portal` from `analysis-ai`, following `CLAUDE.md`, `TEST_PORTAL_SPEC.md` and `CODEX_TESTPORTAL_HANDOFF.md`.
- Did: created migration `029_test_portal.sql` for `test_questions`, `test_attempts`, `test_responses` and `test_focus_events`; registered the new tables and migration file in `test/migration.test.js`.
- Verified: Node 24 `npm test` command accidentally ran the full suite and stayed 152/152 green after the schema change.
- Commit: `a2bc626` (`Add test portal schema`).
- Did: added isolated `src/routes/tests.js` plus route registration in `src/app.js`: question bank CRUD, test assignment creation, student start/take/answer/focus/submit/results, teacher review and SRQ scoring. FRQ submit calls the existing native pad routes so native submit semantics still own the pad lock and background work.
- Verified: `node --test test/tests.test.js` passes 3/3, covering answer-data secrecy, deterministic shuffle, timer rejection, MCQ auto-scoring, focus events, release gating, teacher scoring, wrong-role denial and other-class denial.
- Commit: `48364c5` (`Add test portal backend routes`).
- Did: added teacher pages for question bank, new test and test review, plus the student take-test page. `student-dashboard.html` now links tests to `/native/test/:assignmentId`; `teacher/assignments.html` links test cards to `/teacher/test-review` and exposes Question bank / New test. Added page-route shell tests.
- Verified: `node --test test/tests.test.js` passes 4/4; student-facing test files contain no `AI` wording and no em/en dashes.
- Commit: `48197e7` (`Add test portal pages`).
- Open / next: run the full suite, fix any regressions, final log. No deploy.

## 2026-07-06 — Opus ROUND3 items 2 to 5: rubric tabs, feedback banks, layered marks, selection toolbar
- Item 2 (4c32a20) rubric tabs: native-review.html cardRubric() now builds rubricTabs() — a scorable tab for every rubric_kind that has criteria (internal, secondary, exam), each labelled with its real name from settings.rubric_names, exam still gated on is_ap_lang. setScore looks up the per-kind endpoint (rubric-scores / secondary-rubric-scores / exam-rubric-scores). Verified in browser: all three tabs render, secondary and exam scores persist to their columns.
- Item 3 (269dcee) feedback bank switcher: strengths/targets card regains a "Feedback bank" select (each table plus "All tables"), persisting per pad via the applied-feedback-table PUT then reloading. assets.js feedbackOptionsForAssignment gained an 'all' scope that merges every configured table (dedupe by title); the PUT and review payload now accept 'all'. feedbackSuggester loads the pad's applied bank and passes its options in the evidence; Doer prompt now says to prefer bank items adapted to the essay, invent only when nothing fits. New test asserts the Doer prompt carries the chosen bank and switching (incl 'all') changes what is sent.
- Item 4 (19e1e85) layered marks: literacyCoder Doer prompt rule 9 (errors can overlap, report BOTH the clause and each word finding). native-review.html and native-feedback.html renderEssay replaced the non-overlapping "sp.s >= lastEnd" filter with segment rendering: split at every mark boundary, each segment carries ALL covering marks, widest = outer underline, narrowest = inner word mark with a faint wash and lowered underline, hover lists all labels, click opens the innermost code changer. nativeWrite.js green-pen wraps the widest quote first so word marks nest inside clause marks (surroundContents needs contiguous text). Tests: two overlapping findings both auto-promote and both appear nested in the review payload; static guards on both renderers, the prompt and the green-pen order. Verified in browser both teacher and student views.
- Item 5 (30d432d) selection toolbar: selecting text now shows a small toolbar near the selection on mouseup WITHOUT touching selection or focus (Cmd/Ctrl+C keeps working). [Comment] opens the existing comment popover; [Mark error v] reveals a code dropdown (ALL_CODES) and POSTs a literacy_code annotation at the selection offsets with metadata source 'teacher', landing in Auto-marked groups and profile evidence. Toolbar closes on outside click or selection collapse. Verified in browser: select, Mark error, Gra lands as a 4th auto-mark.
- Item 1 was already committed last session (f3aed59); left as-is.
- Suite: 151 tests, 0 failures on Node 24 (the old "known 4" stay fixed). Did NOT deploy per handoff.
- Gotchas: git root is the parent Claude/ dir, staged explicit InkHeron paths only. Verify DB seeded via scratchpad seed.mjs into the inkheron-verify launch DB path; local node is 20 but tests and the app need node:sqlite from v24.

## 2026-07-06 — Opus ROUND3 item 1: contested pile only flags real doubt
- src/services/checker.js: the forced least-confident ~10% quota now selects only among findings the checker rated confidence < 0.9. If every judged finding is >= 0.9, nothing extra is flagged, so the teacher stops re-reviewing marks the checker was already sure of. Genuine flags (code_questioned, not_verbatim, MT manual review) are untouched. Quota size still ceil(judged * 0.1), tiny batches (< 5) still exempt.
- test/literacyCoder.test.js: existing test still asserts the lone 0.8 in a batch of 0.9s is flagged; added an assertion that a batch of six 0.9s produces zero least_confident flags. literacyCoder suite 9/9.

## 2026-07-06 — Fix semester filter squeezing out the search box

- Phase/Step worked: bug report from a screenshot of the assignments list search row.
- Built: `.search-row select` in `assignments.html` had no explicit width, so it inherited the page-wide `select{width:100%}` rule as its flex-basis (`flex:0 1 auto` resolves basis from `width` when set to `auto`). With the search input at `flex:1` (basis 0), nearly all the row's space landed on the select instead of the input, so the semester dropdown filled almost the whole row and the search box collapsed to a sliver. Fixed by giving `.search-row select` `flex:0 0 auto;width:auto;max-width:170px`, so it shrink-wraps to its content and the input's `flex:1` can claim the remaining space as intended.
- Decisions: capped at 170px rather than removing width entirely, so the dropdown stays a fixed, predictable size next to the now-dominant search box.
- Open / next: none.
- Gotchas hit: could not browser-verify this one — the Chrome extension (claude-in-chrome) and computer-use were both disconnected this session, so I verified via the flexbox sizing math and CSS specificity/cascade instead of a live screenshot. Worth a quick manual look next time you're in the app. Commit `256dab8`.

## 2026-07-05 — Opus HANDOFF_2 item 5: student-facing AI-mention audit
- Audited every surface I touched plus the broader student-facing set (native-feedback.html, student-dashboard.html, login/change-password, nativeWrite.js green-pen panel, and the student-version of student-profile.html) for "AI", "model", "checker", "machine", "auto-mark", model names and OpenRouter. No student-visible machine-marking language found.
- Only near-hits: "sentence machinery" (a writing-craft metaphor for subordination in a teacher-side tooltip) and gpTimer/gpRecheck (green-pen timer variable names). Neither implies machine marking. No change needed.
- The Report snippet button and the anomaly/provenance cards are teacher-only and hide in the profile's "Student version"; the class-insights page is teacher-only with no student variant. Sonnet's item-4 audit already stripped AI-origin markers from the feedback and marks payloads; this pass confirms my new/changed pages did not reintroduce any.
- No commit for this item (verification only); logged here per the definition of done.

## 2026-07-05 — Opus HANDOFF_2 item 7: report snippet UI
- student-profile.html: added a teacher-only "Report snippet" button in the top bar that opens a modal. The modal POSTs /api/students/:id/report-snippet (Sonnet's endpoint), shows a loading line while generating, then puts the returned paragraph in an editable textarea. Copy button (clipboard, with execCommand fallback) and Regenerate button. A missing key or any failure shows the endpoint's friendly message instead of the paragraph. Nothing is stored; the teacher edits client-side. The button carries the teacher-only class so it disappears in "Student version".
- Captured the CSRF token in boot() (was not stored before) for the POST.
- Verified in preview: button opens the modal, calls the endpoint, and with no local OpenRouter key shows "Add an OpenRouter API key in settings before generating report snippets." in the sub line with Copy/Regenerate/Close all present; modal closes; button hidden in student version.

## 2026-07-05 — Opus HANDOFF_2 item 6: batch release UI on the detail header
- assignments.html detail header: for assignments whose settings_json.feedback_release === 'batch', a "Feedback: held" chip plus a "Release to class" button appear. The button confirms ("Release feedback to all marked students?") then POSTs /api/assignments/:id/release-feedback for every unreleased batch assignment in the detail group, toasts the result and flips the chip to "Feedback released <time>". Immediate-mode assignments (the default) show no control.
- The other item-6 pieces were already delivered by the concurrent Sonnet session and verified present: new-assignment.html has the Feedback release select (Immediate/Batch) and the Semester select (prefilled from current_semester), and the assignments list has the semester filter (All/S1/S2) wired into the query and saved filter state.
- Verified in preview: temporarily flagged assignment 2 as batch, saw "Feedback: held" + Release button, released it (server stamped feedback_released_at, chip switched to "Feedback released ...", button hid), then restored the assignment to immediate mode and confirmed the control disappears.

## 2026-07-05 — Opus HANDOFF_2 item 4: export to gradebook button
- assignments.html detail header: added "Export to gradebook" next to the existing "Export CSV" (kept). It calls POST /api/assignments/:id/export-to-admin and toasts the result ("Exported N scores" or the endpoint's friendly error). The button is disabled with a hint title ("Set an admin export key in Settings first") when the key is not configured, probed via /api/settings admin_export_key.is_set on detail open.
- The score column ("12 / 15" with Released/Held pill), AP exam-score column, and status pills (marked/green_pen_open/resubmitted) were already delivered by Sonnet's dashboard fix; verified they render (Chen Yuxi shows 10.5 / 15 Released, exam 4 / 6, Green pen).
- Verified in preview at 1440px: button present and disabled with hint (no key set locally), CSV button intact, scores and Profile link render in the row.

## 2026-07-05 — Opus HANDOFF_2 item 2: teacher dashboard navigation
- public/teacher/index.html: added an "Analysis" section with two tiles. "Student profiles" has a class picker that loads students from /api/students?class_id and links each to /teacher/student-profile?student_id. "Class insights" lists one link per class to /teacher/class-insights?class_id. Both driven by /api/classes and /api/students, empties handled.
- public/teacher/assignments.html: added a "Profile" link next to Review in each student dashboard row, to /teacher/student-profile?student_id=<id>, so marking flows into the profile in one click.
- Verified in preview: dashboard picker lists AP Lang G9 + Repro Class, student links resolve to the right ids, class-insights links resolve; dashboard row exposes student_id so the Profile link renders.
- Note: item 4's score/exam columns and status pills were already present (Sonnet dashboard fix); only the export button remains for item 4.

## 2026-07-05 — Opus HANDOFF_2 item 3: class insights page + endpoint
- New endpoint `GET /api/classes/:classId/insights` (teacher session) in an isolated route module `src/routes/classInsights.js` (kept out of the co-edited nativePads.js). Every aggregate excludes demo/ghost via realStudentsWhere. Returns: recurring codes with students-affected and class rate per 100 words (sorted by students affected), class err/100 trend by essay index, green-pen fix rate from implementation_scores addressed_json, average internal rubric total per assignment over time, marker profile (mean delta per rubric_kind+criterion from ai_grade_estimates WHERE teacher_score IS NOT NULL, gated to render only at >= 10 scored deltas), and per-student mini rows.
- New page `public/teacher/class-insights.html` + route `/teacher/class-insights` in app.js. Follows student-profile.html design language: headline sentences ("1 of 5 students have open Grammar issues"), stat strip, recurring-error meters (category coloured), err and rubric sparks, green-pen and marker cards with friendly empties, and a students table linking to each profile. Class switcher in the top bar.
- Verified in preview at 1440px and 1024px against the seeded AP Lang class; a sparse class (Repro, 1 student, no marks) returns empties with no NaN. Marker profile shows "collects as you mark" (0 deltas), green-pen shows its empty message.

## 2026-07-05 — SONNET_HANDOFF_2 item 7: report snippet endpoint

- Phase/Step worked: SONNET_HANDOFF_2.md item 7 (last of the three remaining items — all seven items now done).
- Built: new `src/services/reportSnippet.js` (`generateReportSnippet`), a Doer-only service (no Checker, spec did not ask for one) following the established injectable-chat, never-throw pattern. Gathers its own grounded evidence directly from the DB (err/100 first-vs-last trend from `native_pads`/`student_literacy_evidence`, top codes with fix rates from `student_literacy_issue_stats`, stylometric trends via the existing `aggregateStyleProfile`, the student's current writing_summary/voice_summary/targets from `student_writing_profiles`, rubric trajectory first-vs-last from `score_snapshots`). One Doer call (haiku) turns that into `{snippet}`: one 60-100 word warm plain-English paragraph, told explicitly to pick only the 2-3 numbers that matter, never mention AI/tools/checkers, no em/en dashes, no Oxford commas. New route `POST /api/students/:studentId/report-snippet` (teacher session + CSRF) in `nativePads.js`, right after the existing writing-profile dashboard endpoint. Returns `{snippet}` on success; any failure (bad studentId, unparseable model output, or a chat error such as a missing OpenRouter key) returns a clean 400 `{error: message}` with no raw error text or AI-service internals leaked. Nothing is stored anywhere; the teacher edits the returned text client-side (no UI built — this handoff item only specced the endpoint).
- Decisions: kept the service self-contained (its own SQL queries) rather than importing `loadWritingProfileDashboard` from `nativePads.js`, to avoid a circular import (that function's route file would need to import the new service for the route, and the service importing back from a route file inverts the normal service/route dependency direction). The grounded-data categories match the spec exactly even though the query shapes are new, not literally reused from the dashboard endpoint's code.
- Verified: `node --test test/reportSnippet.test.js` — 4/4 pass (snippet returned with a fake chat; clean error message on a simulated missing-key failure, with the raw `openrouter_api_key` string asserted absent from the teacher-facing message; clean error for a nonexistent student; the real HTTP route returns 400 with a clean message when no OpenRouter key is configured, 401 with no session, and never touches any table). Full suite `node --test "test/*.test.js"` — 140/144 pass, same 4 pre-existing baseline failures as items 5 and 6 (EAP library admin 401, login password_hash exposure, classes/students CRUD, roster page content). Not browser-verified — this item is a backend endpoint only, no UI was specced or built for it, so there is nothing to click.
- Open / next: **all seven SONNET_HANDOFF_2 items (1-7) are now done, tested and committed separately.** A future item would be the teacher-facing UI to call this endpoint and edit/copy the snippet (e.g. a button on the student-profile page) — not requested here.
- Gotchas hit: first draft imported `loadWritingProfileDashboard` from the route file into the service, which would have created a route<->service circular import; caught it before running tests and rewrote the service to gather its own evidence instead.

## 2026-07-05 — SONNET_HANDOFF_2 item 6: semester tags

- Phase/Step worked: SONNET_HANDOFF_2.md item 6 (second of the three remaining items).
- Built: `settings_json.semester` ('S1'|'S2', tag only) on assignments, defaulted from a new teacher-level `current_semester` setting (plain key/value row, no migration needed — same pattern as `admin_export_url`). `readCurrentSemester`/`writeCurrentSemester` added to `settingsStore.js`; `GET`/`PATCH /api/settings` now read/write `current_semester` alongside the existing secrets and export URL. Settings screen got a "Current semester" select (default S1). `new-assignment.html` got a "Semester" select prefilled from `/api/settings` on load; `POST /api/assignments` defaults `settings.semester` to `current_semester` when the caller omits it, and validates any explicit value. `GET /api/assignments` accepts `?semester=S1|S2|all` (default all); untagged legacy assignments (no `semester` key in their `settings_json` at all) always show under `all`. Added a "semester" select to the assignments list-view search row (`assignments.html`), wired into `fetchAssignments()`'s query string and the existing `saveFilterState`/`restoreFilterState` sessionStorage round-trip, same pattern as the archive toggle. No deletion or auto-clear logic anywhere, per spec.
- Decisions: `buildSettingsJson` only writes the `semester` key when the value is valid — it does NOT default it itself, since that function has no DB access. The default-from-teacher-setting only happens once, at `POST /api/assignments` create time; edits via `PATCH` preserve whatever semester (or absence of one) the assignment already had, since the existing `settings_json` is spread before the incoming partial settings. This means editing an old untagged assignment's other settings does not retroactively tag it — consistent with "tag only, never auto-clear or purge".
- Verified: `node --test test/assignments.test.js test/settings.test.js` — 31/31 pass, including new tests `semester tag defaults from current_semester, filters, and leaves untagged assignments under all` and `current_semester defaults to S1 and can be updated, ignoring invalid values`. Full suite `node --test "test/*.test.js"` — 136/140, same 4 pre-existing baseline failures as item 5 (EAP library admin 401, login password_hash exposure, classes/students CRUD, roster page content). Also browser-verified live via `inkheron-verify`: settings page shows/saves the semester select and persists to the settings table; new-assignment page prefills the select from the saved teacher default (S2 after changing it); created one assignment with no explicit semester (defaulted to S2) and one with an explicit override (S1); the assignments-list semester filter correctly narrowed the list to just the S1-tagged one.
- Open / next: item 7 (report snippet endpoint) still pending. No batch-archive-by-semester bulk action was built — spec says to reuse the EXISTING per-assignment archive toggle, now that the list can be filtered by semester first.
- Gotchas hit: `preview_click`/`preview_fill` on select/submit-button elements silently failed to trigger the underlying DOM events a couple of times during verification (no network request fired); dispatching the `change`/`submit` events directly via `preview_eval` reliably worked and confirmed the real app behaviour was correct — a preview-tooling quirk, not an app bug. Commit `927cc13`.

## 2026-07-05 — Opus HANDOFF_2 item 1: back button on the marking page
- Added a compact "← Assignments" link at the far left of the native-review.html top bar. On load it points to /teacher/assignments?id=<assignment id> (from the review payload), falling back to /teacher/assignments before the payload arrives.
- Verified in preview at 1024px: link resolves to ?id=2 for the seeded pad and the top bar stays on one row with all controls visible.
- Note: this commit also carries the "Run AI review" button added in the previous session (it was left uncommitted then because native-review.html was being co-edited; the file's uncommitted diff is now all mine).

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
