# Native InkPad Sidecar

Native InkPad is being built beside Etherpad. Etherpad remains the default editor until this sidecar is tested enough to replace it for new assignments.

## Switch

- Native routes only activate for assignments whose `settings_json` includes `"native_inkpad": true`.
- Existing `/write/:assignmentId` and `pads` routes remain Etherpad.
- Test native assignments use `/native/write/:assignmentId`.

## Phase 1 Foundation

- Own tables: `native_pads`, `native_pad_revisions`, `native_paste_events`.
- Student API can create, load, autosave and submit a native pad.
- Autosaves store structured JSON plus plain text for review, search and recovery.
- Revisions are snapshots, not real-time collaboration history.

## Phase 2 Review Foundation

- `native_pads.version` increments on save so comments and codes can attach to a document version.
- `native_pad_policies` stores live per-pad controls, starting with paste mode and spellcheck.
- `native_annotations` stores general comments, inline comments, literacy code marks and highlights with text ranges.
- `native_teacher_events` records teacher actions for later debugging.
- Student editor polls policy and can allow, log or block paste without a page reload.

## Phase 3 Dashboard Integration

- Student assignment API returns `native_inkpad` and `write_url`.
- Student dashboard uses `write_url`, so native assignments open `/native/write/:assignmentId`.
- Teacher assignment dashboard returns `pad_kind` and `review_url`.
- Teacher dashboard review buttons use `review_url`, so native pads open `/teacher/native-review?pad_id=...`.
- Teacher new/edit assignment screens include an experimental Native InkPad toggle.

## Phase 4 Save Safety

- Native autosave accepts `expected_version`.
- Stale saves return `409 version_conflict` with the current pad instead of overwriting newer text.
- Student editor tracks the saved version and shows a conflict message if another tab has newer work.

## Phase 5 Review Marking Tools

- Native review page can add inline comments, literacy-code marks and highlights from selected text ranges.
- Literacy-code annotations carry metadata for code, category and label.
- Review rendering marks inline comments, code marks and highlights with different styles.

## Phase 6 Revision Viewing

- Native review page revision list has `View` buttons.
- Teachers can inspect saved snapshots in the main paper pane and return to the marked current text.

## Phase 7 Rubrics

- Assignment rubrics store criteria, descriptors, weights and score bands.
- Native review payloads include rubric criteria and per-pad rubric scores.
- Teachers can create a default rubric, mark whole or half scores and add score notes.
- Rubric scoring is stored separately from grades so it can later feed student feedback packages and progress profiles.

## Phase 8 Student Writing Profiles

- `student_writing_profiles` creates the long-term student profile record for writing and voice summaries.
- Literacy-code annotations now create structured profile evidence for the student.
- Profile issue stats track total, open and resolved evidence counts per code/category.
- Native review payloads include the student profile and the review page shows the current top issue counts while marking.

## Phase 9 Backup and Recovery

- Teachers can download a JSON backup of all native pads or one assignment's native pads.
- Backups include current pad text, document JSON, revisions, annotations, paste events, rubric data and student profile evidence.
- Native review includes an assignment backup download link.
- Teachers can recover work by pasting text or uploading a `.txt` file.
- Recovery can either create a manual revision only or replace the current pad text while keeping a revision trail.

## Phase 10 Student Feedback Loop

- Teacher native review can return feedback, moving pads to `green_pen_open` when green pen is enabled or `marked` otherwise.
- Student assignment API returns `feedback_url` for native assignments.
- Student dashboard opens returned native work in a feedback package page.
- Native feedback page shows marked text, general comments, inline comments, literacy codes, highlights, rubric scores and a rewrite link when green pen is open.

## Cutover Rule

Do not route ordinary assignments to Native InkPad until:

- autosave has survived repeated browser reload tests
- submit and lock states are covered by tests
- teacher review can read native submissions
- existing Etherpad pads remain accessible
