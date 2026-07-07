# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

Entry format:
```
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

## 2026-07-05 — SONNET_HANDOFF_2 item 1: dashboard scores bug fixed

- Phase/Step worked: SONNET_HANDOFF_2.md item 1 (dashboard bug, do first).
- Built: `fetchDashboardRows` in `src/routes/assignments.js` now LEFT JOINs a `rubric_totals` subquery (SUM/COUNT of `native_rubric_scores` per pad, split by `rubric_kind` via CASE-WHEN) so each row carries internal and exam totals plus per-kind scored-criteria counts. New `loadRubricMax(db, assignmentId, rubricKind)` sums each criterion's max band value once per assignment (the "/ 15" denominator). `publicDashboardRow` now takes `{rubricMax, isApLang}` context and returns `score`/`score_max`/`exam_score`/`exam_score_max`/`is_ap_lang`/`grade_state` (`released` once state is marked/green_pen_open/resubmitted, else `held`), `score` is `null` until at least one criterion is scored (tracked via the COUNT alongside the SUM, not just checking SUM > 0). `GET /api/assignments/:id/export.csv` carries the same fields as new columns. `assignments.html` renders `score / score_max` in the Score column and adds an Exam score column that shows `exam_score / exam_score_max` only when `row.is_ap_lang`, else `-`.
- Decisions: `isApLangClassName` duplicated locally in `assignments.js` rather than extracted into a shared module, matching the existing (non-DRY but consistent) pattern already repeated 4x in `nativePads.js`. `rubricMax` computed once per request (assignment-wide), not per row, since it does not vary by student. `is_ap_lang` stamped on every row (not just once at the class level) so a merged multi-class assignment view can show '-' correctly per row even when only some of its classes are AP Lang.
- Verified: `node --test test/assignments.test.js` — 15/15 pass (2 new tests: rubric totals releasing on finish-marking, AP Lang exam column gating). Browser-verified on a scratch DB via the `inkheron-verify` preview server (port 3473, `INKHERON_DB_PATH` pointed at a scratchpad file, not the real `data/inkheron.db`): seeded an AP Lang class + G9 class, scored one AP student's internal (4/5) and exam (4/6) rubrics and finished marking, left a second AP student unscored, scored and finished-marked a G9 student (1/2, no exam rubric). Dashboard and CSV both rendered correctly: scored rows show "N / M" with a Released pill, unscored rows show "-", exam score column populates only for the AP Lang assignment and shows "-" for G9.
- Open / next: items 2-4 from SONNET_HANDOFF_2.md (tone pass, admin gradebook export, AI-mention audit) still pending.
- Gotchas hit: the shared "inkheron" launch.json config (port 3472) was in use by another chat session; added a separate `inkheron-verify` config (port 3473) pointing at its own scratch `INKHERON_DB_PATH` rather than touching the shared config or the real teacher database. Commit `f9ae0d6`.

## 2026-07-05 — Round-3 review and production deploy

- Reviewed all six round-3 commits. Spot checks pass: contested quota now only among findings the checker rated below 0.9 (a batch of all-0.9s contests nothing); every loaded rubric kind renders a scorable tab; feedback-bank switcher restored and the suggester prompt carries the chosen bank with "prefer the bank, invent only when nothing fits"; layered marks (word errors nested inside structure errors) in Doer prompt and all three renderers with tests; selection toolbar (Comment / Mark error) replaces the auto comment popover so highlight-to-copy works and the teacher can tag missed errors with any code.
- Suite 151/151 green. Deployed full tree to /opt/inkheron-platform (DB backed up pre-round3), wrapper active, both domains 200.

## 2026-07-05 — Batch default everywhere + per-student Send feedback

- Teacher confirmed nothing has been released yet, so the server-side fallback for assignments without a feedback_release field is now ALSO 'batch' (assignments.js): everything holds until released, old and new alike.
- Per-student release: migration 028 adds native_pads.feedback_released_at; POST /api/native/pads/:padId/release-feedback (teacher, CSRF, only for marked/green_pen_open/resubmitted pads) opens feedback for that one student; the gate (isBatchFeedbackHeld + the student feedback endpoint) honours the pad-level stamp over the class hold. Review page: "Send feedback" button beside Finish marking, shown only on batch assignments still held, flips to "Feedback sent" once used.
- Test updates for the default flip (three seeds now opt into immediate; default test asserts batch). Suite 145/145 green. Deployed, migration 028 applied, wrapper active.

## 2026-07-05 — Batch release is now the default for new assignments

- Teacher decision: "all at once" is the default feedback release mode. Flipped the new-assignment form default (the form always sends an explicit value, so the server-side immediate fallback still grandfathers old assignments; nothing in flight changes behaviour). Deployed (static page only, no restart needed).

## 2026-07-05 — Round-2 review, baseline failures cleared, production deploy

- Reviewed all 22 round-2 commits (Sonnet items 1-7, Opus items 1-7, plus Sonnet's unrequested but sound nativeReanalyze.js: teacher-triggered AI re-run for pads submitted before the pipeline existed; teacher+CSRF, verified). Contract points hold: adminExport filters is_demo/is_ghost and ships names+numbers only, classInsights uses realStudentsWhere everywhere, release gating covers both feedback and green pen.
- Cleared the 4 "known baseline failures" for good. Three were stale tests asserting pre-redesign behaviour (must_change_password now defaults true for teacher-created students; roster page heading changed; EAP admin page title changed after its rewrite). The fourth was a REAL gap the test was right about: /library/admin served the admin page unauthenticated; route now requires a teacher session. Suite: 144/144 green, first time.
- Deployed the full committed tree to /opt/inkheron-platform (DB backed up as inkheron.db.pre-round2-*). Migration 027 applied, wrapper active, inkpad/eap live 200, class-insights correctly 401 without a session.
- State: everything requested through round 2 is live in production.

## 2026-07-04 — Teacher feedback round 2: diagnosed dashboard bug, wrote round-2 handoffs

- Diagnosed the "finish marking changes nothing" report: rubric clicks DO save (PUT rubric-scores per click) and finish-marking DOES set state, but fetchDashboardRows in assignments.js never joins native_rubric_scores and publicDashboardRow still maps legacy statuses, so the dashboard and CSV cannot show any of it. Fix specced precisely in SONNET_HANDOFF_2.md item 1.
- SONNET_HANDOFF_2.md: dashboard scores fix, conversational low-C1 tone pass on feedbackSuggester + profileSummarizer prompts, one-click export to admin.inkheron.app gradebook (read ../grade-importer code for the real API; payload = names and numbers only, never AI wording), student-facing AI-mention audit.
- OPUS_HANDOFF_2.md (run after Sonnet): back button on native-review, teacher dashboard navigation to student profiles, NEW class-insights page + /api/classes/:classId/insights endpoint (recurring codes by students-affected, class err/100 trend, fix rate, rubric averages, marker-profile deltas only where teacher_score exists and >= 10 samples), assignment dashboard score column + Export to gradebook button.
- Deploys stay with Fable (handoffs forbid the models from touching the droplet).
- Teacher picked three extras, added to the same handoffs (items 5-7 in each): batch feedback release (settings feedback_release immediate/batch, migration 027 feedback_released_at, release-feedback endpoint gating student feedback AND green pen), semester tags S1/S2 (tag + filter only, no purge ever, batch archive later via the existing archive toggle), and a parent report snippet (reportSnippet.js Doer service + profile-page modal, 60-100 warm plain words, never stored, never mentions AI).

## 2026-07-04 — Accuracy layer, MT code, click-to-change

- False-positive accuracy layer: Doer rule 1b (judge by how the sentence reads; natural informal usage is not an error) and the Checker now receives the FULL SENTENCE per finding (new sentenceAround helper) with an explicit instruction that natural everyday phrasing is NOT defensible even if a style guide objects.
- New code MT = direct translation from Chinese (word-for-word calque of a saying/idiom/structure). In VALID_CODES, prompt, labels, category grammar, gp colour teal, student explainer. MANUAL_REVIEW_CODES gate in autoPromoteSuggestions: MT NEVER auto-applies, it always lands in the Needs-you pile regardless of checker confidence.
- Click-to-change: clicking any placed literacy mark on the review page opens a popover (quote + 21-code select) that PATCHes /api/native/annotations/:id with merged metadata; evidence re-sync and old-code stat recompute were already in the endpoint. Browser-verified on the seeded dev server: changed "goes" Gra to MT, label/category updated, ai_auto source preserved, MT group appears in Auto-marked rail.
- Suite 129 tests, 125 pass, known 4. Commit 5fdbac4. Hot-deployed all five changed files to /opt/inkheron-platform, wrapper active, 200.
- Teacher correction, same day: MT was too broad. Narrowed to mistranslated NAMES and FIXED EXPRESSIONS only (book/film/show titles, proper nouns, sayings, idioms rendered literally when an established English version or natural equivalent exists), explicitly RARE (a few per essay at most). Chinese-influenced grammar/structure stays Gra/STR/WO/Exp, never MT. Prompt, labels ("Mistranslated name or saying"), student explainer and review-page code list updated; redeployed.

## 2026-07-03 — Cache heavy PDF.js assets to harden PDF loading on flaky networks
- Reported: passage PDFs failed to load on school computers (both Safari and Chrome), then worked ~10 hours later elsewhere. Both browsers failing rules out a browser code bug; the client render path works fine locally. Pattern points to the school network, not the code.
- Finding: static assets were served `cache-control: public, max-age=0`, so the 1.24 MB PDF.js worker was revalidated over the network on every pad load. On a slow or filtered school network that per-load fetch of a big file can intermittently fail, then succeed later. Filenames are not hashed, so they were never cached.
- Fix (src/app.js): `cacheControl:false` on the /assets and /static registrations plus a `setHeaders` that sets `max-age=31536000, immutable` for vendored heavy assets (`/static/pdfjs/`, fonts) and `max-age=0, must-revalidate` for everything else. So the worker downloads once and is then immune to network flakiness, while app HTML/CSS/JS still revalidates so deploys land immediately. Verified headers per asset; app+assignments tests green apart from the known EAP baseline failure.
- Note: best-supported hypothesis, not a confirmed root cause. If it recurs on the school computers, still need the Console error and Network status of passage-pdf + the two .mjs files. The earlier >1 MB upload bodyLimit fix and the nginx client_max_body_size heads-up still stand.

## 2026-07-03 — Opus: fix assignment start/due dates staying locked
- Reported: an assignment stays locked even after its start date and time has passed.
- Root cause: the create and edit forms sent the raw `datetime-local` value (the teacher's LOCAL wall clock, no timezone, e.g. `2026-07-05T14:00`) and it was stored verbatim. Every server gate compares against `new Date().toISOString()` (UTC) with a plain string comparison (`opens_at > now` in nativePads.js:1201 and deriveStatus in assignments.js). A Hangzhou (UTC+8) start of 14:00 is 06:00 UTC, but the naive string "14:00" string-compares as greater than the UTC "06:00", so the pad stays `not_open_yet` for the full 8-hour offset. The client's own `parseServerDate` already assumed stored dates were UTC, so the create/edit path was the odd one out.
- Fix: convert the datetime-local value local -> UTC ISO before sending, in both send sites — `public/teacher/new-assignment.html` (create) and `public/teacher/assignments.html` (edit), via a small `localToIso(v)=new Date(v).toISOString()`. Stored values are now unambiguous UTC ISO, matching every server comparison and parseServerDate.
- Verified end to end against the real student open gate (`GET /api/native/assignments/:id/pad`): old naive-local past start -> 403 not_open_yet (the bug); same start stored as UTC ISO past -> 200 open; future start -> 403. No server logic changed.
- Open / next: EXISTING assignments already saved on the droplet still hold naive-local strings and stay wrong. They need either a one-time migration (treat stored naive dates as UTC+8 -> subtract 8h, append Z) or the teacher re-entering the start/due time once on each. Flagged to the user.

## 2026-07-03 — Opus: profile dashboard + writing-profile endpoint
- Built the new backend read model `GET /api/students/:studentId/writing-profile` (teacher session) in nativePads.js: headline err/100 first vs last, per-essay strip with essay_type/supervision provenance and per-pad `detectStyleAnomaly` flags, recurring-code per-100 series with resolved counts and trend, `aggregateStyleProfile` vs a real-student class median (via realStudents helper, excludes demo/ghost), and score history grouped by rubric_kind and essay_type. Route added.
- Built page 3: new `public/teacher/student-profile.html` from the profile-dashboard mockup, plus a `/teacher/student-profile` route in app.js. EAP + AP-per-type tabs (locked under 2 essays), anomaly banner, headline stats, essay strip with provenance badges and flagged borders, recurring-errors bars, voice fingerprint vs class median with click explainer, voice-in-words findings with an evidence quote, scores-over-time spark and AP-by-type cards. The "Student version" button hides the anomaly banner and provenance strips client-side (both teacher-only per the handoff); the endpoint itself returns the full teacher payload.
- Fixed: the two review/feedback page tests in nativePads.test.js asserted the OLD page markup (pasteMode, revision-panel, Open rewrite, etc). Updated both to assert the redesigned pages' real structure. npm test under Node 24: 115 pass, only the 4 known baseline failures remain.
- Verified in preview at 1440px and 1024px: full dashboard renders, anomaly on E6 (homework), spark bars render, Student version hides anomaly + provenance.
- Decision: profile-page provenance and anomaly are teacher-only and hidden via a body class in student mode rather than a server variant, matching "renders the same data with teacher-only cards removed".

## 2026-07-03 — Opus: student feedback view rebuilt from student-view
- Built page 2: `public/native-feedback.html` rebuilt to the student-view mockup. Reads `GET /api/native/assignments/:assignmentId/feedback` (student session, assignment id from the URL path).
  - Focus bar category chips (All / Spelling and words / Grammar / Punctuation) with live counts; clicking a chip dims the other categories (.mk.dim). Marks hover reveals category only, never the fix.
  - Targets panel with per-target checkbox tick-off wired to `POST .../feedback-items/:id/toggle-check`; ticked targets strike through and update the "N of M targets done" ring in the focus bar. Checkboxes disabled unless the pad is green_pen_open.
  - Strengths with explanations, try-now pills on targets, internal rubric score bars plus an "If this were the AP exam" AP bar for AP classes, and the fixed line that grammar marks are practice not the grade. Green pen CTA links to the rewrite pad when green pen is open.
- Decision: the focus-bar progress ring counts targets ticked (the only student-driven state the backend tracks) rather than a per-mark fixed count, which no endpoint supports. Phrased as "N of M targets done".
- Verified in preview at 1280px: Grammar filter shows 11 marks and dims 12, target tick-off persists server-side (2 to 3 done).
- Next: profile dashboard + new writing-profile endpoint.

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
