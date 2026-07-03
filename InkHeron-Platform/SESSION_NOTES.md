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

## 2026-07-03 — Cache heavy PDF.js assets to harden PDF loading on flaky networks
- Reported: passage PDFs failed to load on school computers (both Safari and Chrome), then worked ~10 hours later elsewhere. Both browsers failing rules out a browser code bug; the client render path works fine locally. Pattern points to the school network, not the code.
- Finding: static assets were served `cache-control: public, max-age=0`, so the 1.24 MB PDF.js worker was revalidated over the network on every pad load. On a slow or filtered school network that per-load fetch of a big file can intermittently fail, then succeed later. Filenames are not hashed, so they were never cached.
- Fix (src/app.js): `cacheControl:false` on the /assets and /static registrations plus a `setHeaders` that sets `max-age=31536000, immutable` for vendored heavy assets (`/static/pdfjs/`, fonts) and `max-age=0, must-revalidate` for everything else. So the worker downloads once and is then immune to network flakiness, while app HTML/CSS/JS still revalidates so deploys land immediately. Verified headers per asset; app+assignments tests green apart from the known EAP baseline failure.
- Note: best-supported hypothesis, not a confirmed root cause. If it recurs on the school computers, still need the Console error and Network status of passage-pdf + the two .mjs files. The earlier >1 MB upload bodyLimit fix and the nginx client_max_body_size heads-up still stand.

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

## 2026-07-02 — Fable batch 2: auto-accept policy, voice layer, anomaly detection, D mockups, Opus handoff

- Policy change (teacher decision, now CLAUDE.md §8.1): literacy codes are formative for L2 learners, not grading factors; AI findings auto-apply as marks at Checker confidence >= 0.75; contested stay pending; disagree endpoint retracts mark + profile evidence. Doer prompt retuned from conservative to flag-everything. Truncation salvage added (dense paragraphs no longer lose all findings to a cut JSON bracket). Commit 18046c6.
- Stylometric voice layer (b88f3ee): migration 025 `style_metrics` + `native_feedback_items.student_checked`; `styleMetrics.js` computes ~24 length-normalized features per submit (rhythm, MATTR vocabulary, subordination/coordination, passive proxy, transitions, hedging, first person); `aggregateStyleProfile` gives mean/sd/trend per feature.
- Voice anomaly detector (02b507d): `detectStyleAnomaly` z-scores an essay against the student's own history, length features excluded, framed as conversation evidence not proof. Feeds the homework-vs-watched provenance story.
- Direction D mockup (A/C hybrid at real 41-mark density: grouped auto-marked card, contested "needs you" pile, AI-suggested strengths/targets, half-point dual rubrics), student view (category filter chips, target tick-off, dual gauges), profile dashboard v2 (per-100-words normalization, provenance chips per essay, anomaly banner, hover+click metric explainers, student-readable per-issue narrative, AP per-genre profile tabs locked until 2 essays of a type). All screenshot-verified. Commits e154ebf/969c1f6.
- Docs: CLAUDE.md §8.1; FABLE_HANDOFF superseded note; SONNET_HANDOFF extended (feedback suggester seam, target tick-off endpoint, essay_type + supervision settings fields, normalization rule); OPUS_HANDOFF.md created (three pages from the three mockups); TEST_PORTAL_SPEC.md pins FRQ = native pad so exam writing reuses the whole pipeline and feeds profiles.
- Next: teacher pastes prompts into Sonnet (backend) and Opus (frontend); Fable reviews after both land.

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
