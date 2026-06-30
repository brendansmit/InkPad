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

## Cutover Rule

Do not route ordinary assignments to Native InkPad until:

- autosave has survived repeated browser reload tests
- submit and lock states are covered by tests
- teacher review can read native submissions
- existing Etherpad pads remain accessible
