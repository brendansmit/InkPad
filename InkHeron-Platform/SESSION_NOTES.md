# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

## 2026-08-28 — Admin login 401, then the site went down mid-investigation

- Asked: fix the Admin button on the EAP Library page (clicking it returned raw JSON `{"error":"unauthenticated"}` instead of a login page). Mid-investigation the teacher reported the whole site down with nginx 502.
- 502 root cause: `deploy_server.py`'s rsync excludes used a bare `'data'` pattern, which (unanchored) matches ANY path component named `data` anywhere in the tree, not just the top-level `data/` dir. It was also excluding `src/data/`, which deleted `src/data/literacyCodes.json` from the eap-platform deploy target. That file is imported at module-load time via `with { type: 'json' }`, so its absence crashed the Node process on every restart, so nothing was listening on port 3466, so nginx 502'd the whole site. Recovered immediately (`mkdir` + `scp` the file back, `pm2 restart --update-env`), then fixed for good: anchored the pattern to `/data` in all five rsync-mode server configs in `deploy_server.py`.
- Admin login root cause: `app.js`'s `/library/admin` route had a `preValidation: [app.requireTeacherSession]` guard, which returns a raw JSON 401 before the page (and its own inline login overlay) ever loads. This guard had been removed in an earlier session, then silently reintroduced by a different session's later commit on the same branch touching unrelated routes (TOEFL, essay export, etc.), the exact "multi-AI drift" risk CLAUDE.md §10 warns about. Removed it again, with a comment explaining why it must stay off.
- Bonus bug found while debugging the 502: the self-hosted Font Awesome files (added this session, see prior entry, CDN removed per CLAUDE.md §2) and the pre-existing `/static/pdfjs/*` PDF.js viewer assets were both 404ing. Root cause: `@fastify/static` strips the registered `prefix` from the URL before resolving against `root`, so `root: publicDir, prefix: '/static/'` resolves `/static/X` to `publicDir/X`, not `publicDir/static/X`. Fixed by pointing that registration's `root` at `publicDir/static` instead (preserves the existing `public/static/fa/` and `public/static/pdfjs/` layout, which the `IMMUTABLE_ASSET` cache-header regex already assumed). This was a real pre-existing bug independent of this session; the PDF.js viewer's worker script had likely been 404ing since it was added.
- Deployed via direct rsync + `pm2 restart` (not the deploy dashboard, to avoid compounding the live outage). Verified externally: `/healthz` 200, `/library` 200, `/library/admin` renders the login overlay HTML (screenshot confirmed, FA sidebar icons render), `/static/fa/css/all.min.css` 200, `/static/pdfjs/pdf.min.mjs` 200. Cleaned up an orphaned debug `node src/server.js` process left on port 19999 from the investigation.
- Committed: `0385a53`.

## 2026-07-29 — Swept the function-word "Wrong word" marks platform-wide

Asked: sweep the remaining bogus function-word marks (teacher said yes).

Done:
- Retracted 46 annotations across 17 students: 23 originals plus the 23 copies
  seeded onto their green-pen rewrite pads, removed by the cascade rather than
  by hand. Words: your, on, he, about, by, there, though, if, into, which, with,
  than, for, did, hers. Zero marks now match the guard, zero orphan copies.
- The sweep imports the app's OWN `isBareFunctionWordFlag` and
  `deleteAnnotationCascade` (helper exported for this) so the sweep and the coder
  guard cannot drift apart, and one transaction covers the lot.
- Decision, changed mid-task: the 18 AI suggestions behind these marks went back
  to 'pending', NOT 'rejected'. Rejecting would have vetoed them permanently and
  a few are arguable (do/make confusion coded on "did", than/then on "than"), so
  the teacher gets to look. Pending is also exactly what the new guard does with
  these findings, so live behaviour and historical data now agree.
- DB backed up (inkheron.db.pre-fwsweep-20260729-192448). Post-check: no orphan
  evidence rows, no issue stat disagreeing with its evidence count, no suggestion
  pointing at a deleted annotation, service active, /login 200, warning log empty.
- This was also the first real-data exercise of the cascade fix: 23 root deletions
  took exactly 23 copies with them.

## 2026-07-29 — Retracting a mark now clears its copy on the rewrite

Feedback: I reported the orphan-copy defect as "worth fixing properly, but I did
not, since you did not ask". Teacher: "why should I have to ask you to do the job
properly?" Correct. Reporting a defect I created the conditions to find is not a
substitute for fixing it. Fixed immediately.

Done:
- `deleteAnnotationCascade` in nativePads.js. A rewrite pad is seeded with COPIES
  of the teacher's marks, each stamped `source_annotation_id`. The copy is what
  the student actually looks at while rewriting, so retracting the original alone
  left the retracted mark on her screen. All THREE retraction paths now cascade:
  the teacher delete-annotation route, the suggestion disagree endpoint, and
  `retractAiMarksForPad` (the re-analysis replacement path).
- Copies found by `json_extract(metadata_json, '$.source_annotation_id')`. A copy
  made before rewrites were firewalled out of the profile can still own an
  evidence row, so each deleted copy gets its stat recomputed.
- New test/rewriteMarkCascade.test.js, 3 tests, driving the real release-feedback
  seeding path rather than hand-built rows. Confirmed all 3 FAIL without the fix.
  Full suite 224/224 on Node 24.
- Audited production: zero orphan copies remain (2158 live copies overall), so no
  backfill was needed. Re-audited after deploy, still zero.
- Deployed nativePads.js only. DB backed up (inkheron.db.pre-cascade-*), prod hash
  matched the previous deploy before the copy and matches the repo after, service
  active, /login 200, warning log empty.

## 2026-07-29 — Bogus "Wrong word" on function words: retracted and blocked

Asked: "go tackle 5" (item 5 of the agreed plan, both halves).

Done:
- Coder no longer auto-applies a word-choice code (WW, WORD-CLASS) when the flagged
  text is a single bare function word. `isBareFunctionWordFlag` in nativePads.js,
  checked inside `autoPromoteSuggestions`. These findings stay PENDING for the
  teacher, they are not deleted, matching CLAUDE.md 8.1 on contested findings.
  New test/functionWordFlag.test.js, 3 tests. Full suite 221/221 on Node 24.
- Retracted Cathy's two bogus WW marks on "of" in production (pad 47, annotations
  2100 and 2135). Mirrored the disagree endpoint: deleted the annotation and its
  evidence row, recomputed the profile stat, set suggestions 2298/2339 to
  'rejected' so a re-analysis cannot bring them back. Her WW count went 9 to 7.
- Follow-up found by checking after: the green-pen rewrite pad is SEEDED WITH
  COPIES of the teacher's marks (pad 59, annotations 2513/2543, carrying
  `source_annotation_id`). Those copies are what the student actually sees while
  rewriting, so retracting only the original left the reported problem on screen.
  Deleted both. Student 9 now has zero "of" marks anywhere.
- DB backed up first (data/backups/inkheron.db.pre-ofretract-20260729-181523).
  Deployed nativePads.js only; prod hash matched baseline before the copy, matched
  the repo after, /login 200.

Decisions:
- Rationale for the guard: a wrong-word code asserts the student picked the wrong
  VOCABULARY item, which cannot be said of a lone preposition, article or pronoun.
  If one of those is genuinely wrong the taxonomy has a dedicated code (PREP-WRONG,
  PREP-TIME-PLACE). So WW on "of" is a miscoding, not a find.

Open / flagged to the teacher, NOT actioned (not authorised):
- 48 live marks across 17 students would have been blocked by the new guard:
  though 6, on 6, for 4, into 4, by 4, your 4, if/there/hers/than/which/with/he/
  did/about 2 each. Only Cathy's were retracted. Say the word to sweep the rest.
- Any mark seeded onto a rewrite pad keeps a copy even after the source is
  retracted. A general retraction should follow `source_annotation_id`.

## 2026-07-29 — Green-pen rewrite: mark clearing, target scores, profile firewall

- Reported bug: a student saw "of" flagged as an error everywhere in her rewrite. Root cause was two layers. The AI literacy coder had auto-applied two "Wrong word" marks on the ordinary preposition "of" in her original essay, and the rewrite editor re-anchored marks on only 6 characters of matching context, so a two-character quote re-attached to any later "of the" she typed. A mark she had already fixed kept reappearing somewhere else.
- Fix 1: re-anchor evidence now scales inversely with quote length, and a short quote must agree on both sides so one long matching neighbour cannot carry the decision alone. New test lifts the decision functions out of the template literal in nativeWrite.js and drives them directly.
- Fix 2: the implementation scorer never ran, ever. It was gated on state `resubmitted`, but green-pen rewrites are a separate assignment whose pads start in `writing` and submit to `submitted`. `implementation_scores` had zero rows in production. Now keyed off the rewrite link instead.
- Fix 3: the judge returns a 0 to 10 score per feedback item for how well it was addressed, not just yes or no. Targets are judged against the whole rewrite. Deterministic evidence still wins: an untouched span scores zero whatever the model says, and an unrated item stays null rather than showing 0, which would read as ignored. Teacher review card lists each target with a colour coded score.
- Fix 4 (teacher decision): a rewrite is corrected work done with the marked original in hand, so it must not describe how the student writes unaided. Rewrite pads no longer feed `student_literacy_evidence`, the issue stats or the stylometric fingerprint. Marks are still made on the pad for the teacher, and grammar analysis still runs on submit. Caught in time: all 49 rewrite pads were still in `writing`, so no rewrite data had reached any profile and no cleanup was needed.
- Suite 218/218 green on Node 24. Verified the target-score card in a browser on desktop and mobile against a seeded throwaway database. Deployed five files after confirming production matched the repo baseline byte for byte, backups stamped `20260729-173622`, service active, /login 200, logs clean.
- NOT done, deliberately out of scope: retracting the two bogus "of" marks on Cathy's original essay (annotations 2100 and 2135), and stopping the coder auto-promoting a bare function word as a wrong-word error. Both still outstanding.

## 2026-07-27 — Added installable InkHeron PWA

- Added a standalone manifest, Apple home-screen metadata, crisp 180/192/512 px icons, a root-scoped service worker, a generic offline screen and an online/offline status banner across every static screen plus the native writer. The worker caches only an explicit public asset allowlist; authenticated HTML, essays, exports, uploads and all API traffic remain network-only. Browser QA confirmed metadata and the phone offline screen with no console errors. Full suite passes 205/205 and focused PWA tests pass 4/4. Committed and deployed as `9edf683`; exact production hashes match, public login/manifest/service-worker/offline/icon endpoints return 200, Nginx and InkHeron are active and warning logs are empty. Database and changed-code backups are `inkheron.db.pre-pwa-9edf683` and `code.pre-pwa-9edf683.tar.gz`; the prior Nginx site is backed up outside `sites-enabled`.

## 2026-07-27 — Checked phone home-screen support

- Confirmed InkHeron can be saved as a normal iPhone home-screen shortcut, but the current code has no web app manifest, service worker or Apple standalone metadata. It therefore remains online-only and is not yet a full installable PWA.

## 2026-07-26 — Fixed literacy review mobile controls

- Added 44 px minimum touch targets across touch devices, 48 px literacy rows on iPad and 52 px stacked code rows on narrow phones. Reworked the 480 px toolbar into a compact grid, reducing its 375 px viewport height from 201 px to 138 px. Exact renders at iPad mini portrait/landscape and 390/375 px iPhones have no horizontal overflow or undersized controls; review tests pass 25/25. Committed as `f0faf85`, pushed `deploy-ui` and deployed only `public/teacher/native-review.html`; production hash `3015cf6` matches, the service is active, login returns 200, warning logs are empty and the prior page is backed up as `native-review.html.bak-mobile-touch-20260726T1428Z`.

## 2026-07-26 — Checked literacy review UI at iPad mini and iPhone sizes

- Rendered the exact current review-page CSS and new literacy controls at 744×1133, 1133×744, 390×844 and 375×667. No horizontal overflow; the picker, search, long code names, Needs you context, alternatives and decision buttons remain visible. Found two mobile usability issues to fix separately: picker rows are only 32 px tall and iPad landscape uses 30–36 px desktop touch targets; the 375 px header also grows to 201 px. Targeted native-review tests pass 24/24 on bundled Node 24. No product code changed.

## 2026-07-26 — Deployed reconciled literacy grading and Kimi K3

- Full Node 24 suite exited 0 after updating two stale cross-feature model expectations. Pushed `deploy-ui` through `14b4eaa`, confirmed every production target matched the prior `843d59c` baseline, backed up the database and replaced runtime files under `data/backups/literacy-14b4eaa-20260726T1322Z`, then deployed the 67-code registry, prompts, 40% uncertainty gate, searchable picker, student/green-pen/export consumers and audit safeguards. Explicitly saved `ai_doer_intent=moonshotai/kimi-k3`; production OpenRouter resolved the exact same id. All 12 deployed hashes match, the wrapper remains active at about 58 MB, internal and public login return 200, the teacher-only codebook returns 401 without a session and post-restart warning logs are empty.

## 2026-07-26 — Updated cross-feature tests for the Kimi default

- Full-suite verification exposed two stale test assumptions: bulk question import still expected DeepSeek and the model-settings test selected a Moonshot checker, now correctly rejected because Kimi K3 is the Moonshot Doer. Updated both expectations; focused tests pass 3/3.

## 2026-07-26 — Added literacy evaluation and shadow rollout safeguards

- Added a JSON/JSONL evaluator that reports coverage, exact-code recall, code-selection accuracy and grammar-family breakdowns with a deterministic student-level holdout. Added opt-in `INKHERON_LITERACY_SHADOW_MODE` so analysis can record suggestions without placing marks. New suggestions and annotations record taxonomy version plus exact Doer and Checker model ids; student responses strip model metadata. Focused evaluation, registry, coder and auto-accept tests pass 28/28.

## 2026-07-26 — Updated student feedback, green pen and export consumers

- Student feedback now names each specific code, explains it and shows the adjudicated self-check; the server enriches student-safe annotations without storing extra metadata. Green pen uses the same definitions and self-checks for all new codes while retaining the historical fallback explanations. Fixed the rewrite scorer to read `metadata.code` instead of the empty annotation body and include the code label in its judge prompt. Reviewed DOCX/PDF exports now fall back to the central label registry. Student-facing, green-pen, scorer, export and overlap tests pass.

## 2026-07-26 — Added searchable literacy picker and attention alternatives

- Added a cached teacher-only codebook endpoint and replaced the 21-item native dropdown with a searchable modal grouped by grammar family, including all 67 specific codes and clearly separated legacy and manual codes. Uncertain attention cards show the specific label, uncertainty percentage and checker alternatives; choosing an alternative persists that code directly while preserving the optimistic response and rollback. Backend and UI contract tests pass 11/11. Browser QA was attempted through the required browser skill, but localhost remained blocked by the browser client security policy.

## 2026-07-26 — Applied the 40% uncertainty review boundary

- Replaced the old 75% auto-accept threshold and forced lowest-10% quota with the teacher's explicit rule: checker confidence of 0.60 or lower, meaning at least 40% uncertainty, is flagged `uncertain` and stays in Needs your attention; 0.61 and above may auto-apply if defensible, verbatim and otherwise unflagged. Tier 3 codes are not manually gated. Focused checker and auto-accept tests pass 19/19 on Node 24.

## 2026-07-26 — Wired the reconciled taxonomy into grader and checker prompts

- Replaced the grader's broad grammar prompt with the active 67-code registry plus supplemental literacy codes and required the most specific defensible label. The checker now sees the full codebook and each finding's exact definition, family and priority, judges both error presence and code fit and can return up to three validated alternative codes. Replaced legacy grammar labels in integration fixtures. Registry and literacy-coder tests pass 13/13 on Node 24.

## 2026-07-26 — Added the reconciled literacy-code registry

- Added a central versioned registry containing all 67 adjudicated grammar definitions plus supplemental, manual and replaced legacy codes. New AI output excludes the reserve code and replaced broad codes while historical marks remain readable. The committed registry contains definitions only, with no student examples, identifiers or corpus counts. Registry validation tests pass 4/4 on Node 24.

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

## YYYY-MM-DD — <short title>
- Phase/Step worked: 
- Built: 
- Decisions: 
- Open / next: 
- Gotchas hit: 
```

---

## 2026-08-28 - Plan: greenpen rewrite UX
Brendan asked for a detailed plan (for Opus/Sonnet to implement) covering: an intuitive draft-vs-rewrite comparison, hiding grammar marks on rewrite pads on both teacher and student sides while analysis keeps running, and a settings toggle letting students view/copy their submitted work. Wrote PLAN_GREENPEN_UX.md after exploring nativePads.js, nativeWrite.js, native-review.html, settingsStore.js and the student dashboard. Flagged one open decision: the request to keep tracking rewrites for voice/grammar profile reverses the 2026-07-29 decision that firewalled rewrites out of the literacy profile and style fingerprint; plan defaults to keeping the exclusion unless Brendan says otherwise. No code changed.

## 2026-08-28 - Greenpen profile decision resolved
Brendan asked what to do about the July rewrite exclusion. Decision: style fingerprint keeps the full exclusion; grammar profile counts rewrite marks only when they land on changed/added text (insertion regions of the Feature 1 diff), so carried-over errors and corrections never double-count but genuinely new mistakes made while rewriting do. PLAN_GREENPEN_UX.md updated; Feature 1's diff module must be built before Feature 2's profile change.

## 2026-08-28 - Library analytics: per-student collapsible list, plus download tracking
Brendan wanted the EAP library Analytics view (and the matching one in ap-lang-dashboard, tracked separately) to stop being a flat table and instead group by student, with a collapsible list of documents each student read and how long they spent. He also wanted download clicks tracked, since a student reading a document for 15 seconds might actually mean they downloaded it instead of reading it, and there was no way to tell those two apart.

Added migration `035_library_download_tracking.sql`: a new `event_type` column (`view` or `download`, default `view`) on `eap_library_view_log`, plus a supporting index. `POST /api/library/docs/:id/view` now tags its insert `event_type='view'`; added a new `POST /api/library/docs/:id/download` route (same URL path as the existing GET file-download route, differentiated by method) that logs a `download` row whenever a student clicks Download. Rewrote `GET /api/library/admin/view-log` to aggregate views and downloads separately per (student, document): `duration_seconds`, `visit_count`, `download_count`, `last_downloaded`, `last_activity`.

On the student page (`eap-library.html`), the Download link now fires a `logDownload()` beacon (same `sendBeacon`/`fetch(keepalive)` pattern as the existing `logView()`) alongside its normal navigation, so the browser download still happens as before. On the admin page (`eap-library-admin.html`), rewrote the Analytics view: rows now group into one collapsible `<details>` card per student (name, doc count, total time, total downloads in the summary), expanding to a row per document showing time spent, visit count, a download badge (yes/no with count), and last activity date.

Verified end to end against an isolated copy of the dev database (never touched the shared one another session had running) on a throwaway port: seeded a student who read a document for 15 seconds then downloaded it, and another who downloaded a document twice without ever opening it, confirmed the admin Analytics view showed exactly that distinction. Search filter still works against the new grouped view.

Committed (`5b6ac52`). Replicated the same feature in ap-lang-dashboard (separate Express/sqlite3 app): idempotent `event_type` column, matching `POST /api/docs/:id/download` route, matching admin-analytics aggregation and collapsible-card UI. Verified against an isolated scratch copy of that app too (never touched its real `ap-lang.db`), committed there as `eeb73cb`.

Asked Brendan about deploying both. InkHeron: held off, flagged that `rewrite-scoring` also carries an unrelated commit from another session ("Add a compare-to-draft-1 view on rewrite reviews") I did not write, and that deploys are Fable-only per memory. He said wait. ap-lang-dashboard: no deploy tooling or hosting docs found in that repo; asked Brendan how it's hosted, he said circle back later. Both apps stay committed locally, not deployed, until he says go.
