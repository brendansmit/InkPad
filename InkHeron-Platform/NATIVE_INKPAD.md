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

## Cutover Rule

Do not route ordinary assignments to Native InkPad until:

- autosave has survived repeated browser reload tests
- submit and lock states are covered by tests
- teacher review can read native submissions
- existing Etherpad pads remain accessible
