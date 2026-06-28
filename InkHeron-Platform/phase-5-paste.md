# Phase 5 — Paste detection plugin

The anti-"AI did it" signal. A CUSTOM `ep_` Etherpad plugin. This is the single biggest time-risk
in the build (custom Etherpad plugins are fiddlier than app code) — schedule it EARLY, alongside
Phase 3, not on day 4. Day-one scope. See CLAUDE.md §7.

Honest scope: this detects large single-action insertions (paste bursts) vs character-by-character
typing. It is a soft signal for a conversation, never a verdict. The timeslider keystroke history
is the stronger evidence; this plugin makes paste events explicit and easy to surface.

---

## Step 5.1 — Plugin skeleton
- **Goal:** a loadable custom plugin named `ep_inkheron_paste`.
- **Depends on:** Phase 3.5 (plugin system working).
- **Build:** Scaffold an Etherpad plugin npm package (`ep_` prefix). Register against a
  client-side editing hook so your code runs on edits in the browser. Confirm it loads in the
  admin plugin list and runs.
- **Done when:** the plugin loads and a console/log line fires on editing in a pad.

## Step 5.2 — Detect paste vs type
- **Goal:** distinguish a paste from typing.
- **Depends on:** 5.1.
- **Build:** Use the browser input event `inputType` field — flag `insertFromPaste` (and large
  single-action insertions) distinctly from `insertText`. Capture: timestamp, author/student,
  length of inserted text, inputType. Avoid false flags on normal typing.
- **Done when:** pasting a block fires a flagged event with correct length; typing does not.

## Step 5.3 — Persist paste events
- **Goal:** store events against the pad.
- **Depends on:** 5.2, Phase 1.7 paste_events table.
- **Build:** Plugin sends events to a wrapper endpoint that writes a `paste_events` row
  (pad_id, at, length, input_type). Keep it lightweight; batch if needed.
- **Done when:** paste events appear in the DB linked to the right pad.

## Step 5.4 — Surface the flag to the teacher
- **Goal:** the teacher sees which submissions had paste bursts.
- **Depends on:** 5.3, Phase 6 (teacher dashboard) — can be wired when the dashboard exists.
- **Build:** A small paste-flag indicator on the assignment dashboard row, and a count/list on the
  review surface (with timestamps and sizes). This is the whole point of building detection —
  don't bury it. Frame as "worth a look", not "cheated".
- **Done when:** a submission containing a paste burst shows the flag on the dashboard and details
  on review.

---

**Exit check for Phase 5:** pasting into a pad creates a stored, attributed event; typing does
not; the teacher can see paste flags. Keep the honest framing (signal, not proof). Log in
SESSION_NOTES.md.
