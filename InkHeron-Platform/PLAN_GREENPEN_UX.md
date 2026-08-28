# Plan: Greenpen rewrite UX (diff view, hidden marks, student access toggle)

Branch: `rewrite-scoring`. Three independent features. Work in small commits, one feature per commit minimum, run `npm test` after each. Deploy stays via deploy/deploy.sh from this branch.

## Codebase facts the implementer needs

- Rewrite pads are marked by `native_pads.rewrite_of_pad_id` (points at the original pad). Created in [nativePads.js:887](src/routes/nativePads.js) (`createGreenpenRewriteAssignment` / `ensureGreenpenRewriteForStudents`). Rewrite assignment settings carry `greenpen_rewrite: true`.
- Teacher review page is [public/teacher/native-review.html](public/teacher/native-review.html), fed by `GET /api/native/pads/:padId/review` ([nativePads.js:2213](src/routes/nativePads.js)). Marks render in `renderText()` around line 391 (segments, `stack-outer`, `wash` classes). A green-pen verdict card (line 565) already exists on scored rewrites with an "Open original" link and `implementation_score.original_pad_id`.
- Student write view is [src/views/nativeWrite.js](src/views/nativeWrite.js) (server-rendered). `greenpen` flag = `Boolean(pad.rewrite_of_pad_id)`. Marked-work student view is [public/native-feedback.html](public/native-feedback.html).
- Rewrites are ALREADY excluded from the literacy profile and stylometric fingerprint (`isRewritePad` guard, [nativePads.js:337](src/routes/nativePads.js), teacher decision 2026-07-29). See decision point below.
- Settings live in the `settings` key/value table via [settingsStore.js](src/services/settingsStore.js), API `GET/PATCH /api/settings` ([settings.js](src/routes/settings.js)), UI [public/teacher/settings.html](public/teacher/settings.html).
- Student dashboard [public/student-dashboard.html](public/student-dashboard.html): only "actionable" assignments render as links; the "By due date" timeline rows (`timelineRow`) are plain divs, so students currently cannot open submitted work at all. The write view itself already renders read-only when `pad.state` is locked ([nativeWrite.js:45](src/views/nativeWrite.js)).

## Feature 1: Draft-vs-rewrite diff in teacher review (Opus)

Goal: when reviewing a rewrite pad, the teacher can see at a glance what changed from the first draft.

1. Backend: in the `/review` payload, when `pad.rewrite_of_pad_id` is set, add `original_draft: { pad_id, plain_text, submitted_at }` loaded from the original pad (same student, `plain_text` column). Also expose `rewrite_of_pad_id` in `publicNativePad` if it is not already in the payload.
2. Frontend (native-review.html): add a view toggle in the header, only visible on rewrite pads: **Rewrite | Compare to draft 1**.
   - Compare mode replaces the essay body with a word-level diff of original vs rewrite: deletions struck through in muted red, insertions in green-pen green, unchanged text plain. Implement a small LCS word-diff inline (tokenise on whitespace, keep punctuation attached); no external library.
   - Above the diff, a one-line summary: "N words added, M removed, K% of the draft changed".
   - Keep the existing verdict card; the diff complements it.
3. Tests: extend [test/rewriteMarkCascade.test.js](test/rewriteMarkCascade.test.js) or a new `test/greenpenDiff.test.js` covering the endpoint addition (original_draft present only on rewrite pads, absent otherwise, 404-safe when original missing). Diff function: extract to a small shared module if practical so it can be unit-tested (insert/delete/replace/identical cases).

## Feature 2: Hide grammar marks on rewrite pads (Opus)

Goal: a greenpen rewrite is the final version; no literacy-code marks cluttering either the teacher review or the student's returned view. Analysis still runs underneath.

1. Teacher review: in `renderText()` and the mark side panels, when the pad is a rewrite, do not render literacy_code mark spans or the auto-marked group panel. Inline/general comments and rubric scoring stay. Add a small note near the verdict card: "Marks hidden on rewrites - analysis still recorded".
2. Student side: in native-feedback.html (and the locked write view if it paints marks), suppress literacy_code marks when the pad is a rewrite. The greenpen WRITING view keeps showing the ORIGINAL draft's marks in its side panel (`/greenpen-context`) - that is the whole point of green pen; do not touch it.
3. AI marking (`nativeReanalyze`) continues to run on rewrites and store annotations/suggestions - hidden, not disabled.
4. **DECIDED (2026-08-28)**: split the July exclusion.
   - Style fingerprint (styleMetrics.js): rewrites stay fully excluded. A rewrite is scaffolded writing and says nothing about natural voice.
   - Grammar/literacy profile: a literacy_code mark on a rewrite aggregates ONLY when its span overlaps text the student changed or added, i.e. an insertion region of the word-level diff between the original draft and the rewrite (reuse the Feature 1 diff, so build Feature 1's diff module first). Marks on unchanged carried-over text and corrections of previously flagged errors fall outside insertion regions and stay excluded, so old mistakes are never double-counted. Adjust the `isRewritePad` guard in syncLiteracyEvidence accordingly: instead of a blanket skip, compute the diff once per pad (cache offsets) and test span overlap. Retraction paths (deleteAnnotationCascade) must recompute stats the same way.
5. Tests: rewrite pad review payload/rendered flags; confirm annotation storage still happens; profile exclusion behaviour per the decision.

## Feature 3: Settings toggle - students can view submitted work (Sonnet)

Goal: a single teacher-controlled switch. When ON, students can open any of their past submitted/marked work read-only and copy text out.

1. Settings store: add `readStudentWorkAccess(db)` / `writeStudentWorkAccess(db, bool)` (key `student_work_access`, default off) in settingsStore.js, wire into GET/PATCH `/api/settings` alongside `current_semester`.
2. Settings UI: a labelled toggle on teacher settings.html: "Students can view their submitted work" with a one-line explanation.
3. Student dashboard: `/api/student/assignments` already returns all statuses. When the setting is on (expose it in that endpoint's response), make timeline rows for the student's own essays with a submitted/marked/released/resubmitted pad clickable to the write view.
4. Read-only view: the write view already locks the editor for non-writing states. Verify a student can open a locked pad without state corruption (check `provisionNativePad` and the `feedback_not_released` guard - a submitted-but-unmarked pad must open read-only, not 403). Ensure text selection and copy work in the locked editor (no `user-select` blocks; paste logging is irrelevant here). When the setting is OFF, opening a locked pad a student has no rewrite reason to see should behave as today.
5. Server-side enforcement: the write route should check the setting, not just hide links - a student with a bookmarked URL must get the same answer either way.
6. Tests: new `test/studentWorkAccess.test.js` - setting default off, PATCH round-trip, student route allows/denies by setting, teachers unaffected.

## Order and commits

1. Feature 3 (isolated, lowest risk) - commit.
2. Feature 1 backend - commit; Feature 1 frontend - commit.
3. Feature 2 after the decision point is answered - commit.
Log each to SESSION_NOTES.md. Run the full test suite before finishing.
