# Phase 3 — Writing surface

Provision one Etherpad pad per (student, assignment) and hand the student into it from the
platform. Wrap it in the InkHeron shell. See CLAUDE.md §6 (state machine) and DESIGN.md.

---

## Step 3.1 — Etherpad HTTP API wired to the wrapper
- **Goal:** the wrapper can drive Etherpad programmatically.
- **Depends on:** Phase 1.3, Phase 2.
- **Build:** Configure Etherpad's API key. From Fastify, call Etherpad's HTTP API
  (author/group/session/pad concepts). Create a helper module that can: create a group-mapped
  pad, create an author mapped to a student, and create a session granting that author access to
  that pad.
- **Done when:** the wrapper can create a pad and an author and produce a valid Etherpad session
  server-side.

## Step 3.2 — One pad per (student, assignment)
- **Goal:** provisioning rule from CLAUDE.md §4.
- **Depends on:** 3.1.
- **Build:** When a student opens an assignment, look up the `pads` row for (student_id,
  assignment_id). If none, create the Etherpad pad, store `etherpad_pad_id`, set `state =
  'writing'`. UNIQUE(student_id, assignment_id) enforced. Reuse the pad on subsequent opens.
- **Done when:** opening an assignment twice yields the same pad; two students get different pads;
  the DB row exists with the right state.

## Step 3.3 — Hand the student into their pad
- **Goal:** student writes without seeing Etherpad's own auth.
- **Depends on:** 3.1, 3.2.
- **Build:** On open, the platform (already knowing the student via their session) mints the
  Etherpad session cookie for that author+pad and loads the pad in the wrapper shell. The student
  never logs into Etherpad separately.
- **Done when:** a logged-in student clicks an assignment and is typing in their own pad, with
  authorship attributed to them (check the timeslider shows their author).

## Step 3.4 — Wrapper shell around the pad
- **Goal:** the write view from the mockup.
- **Depends on:** 3.3, DESIGN.md, student mockup write view.
- **Build:** Embed the pad in the `.padframe` shell: top bar (back, title, save-state), due note,
  the pad iframe, action bar (word count, Save, Submit). Match tokens. Formatting toolbar and
  word/char count come from Etherpad plugins (next steps), so leave room for them.
- **Done when:** the write view matches the mockup and the real pad sits inside it.

## Step 3.5 — Formatting toolbar + plugins installed
- **Goal:** writing tools available.
- **Depends on:** 3.3.
- **Build:** Install Etherpad plugins: `ep_headings2`, `ep_align`, `ep_comments_page`,
  `ep_countable`, `ep_stable_authorid`. Confirm the formatting toolbar (bold/italic/underline,
  lists, headings, align) shows in the pad.
- **Done when:** all five plugins load; formatting works; ep_countable shows a live word/char
  count (always visible — no toggle, per CLAUDE.md §5).

## Step 3.6 — Spellcheck flag
- **Goal:** per-assignment spellcheck toggle.
- **Depends on:** 3.4, assignment settings object.
- **Build:** Read `settings_json.spellcheck`. Set the `spellcheck="true|false"` attribute on the
  pad's editable surface accordingly when the pad loads. Show the small "Spellcheck on/off"
  note in the chrome. (Controls the browser-native checker only — document that limit.)
- **Done when:** an assignment with spellcheck off shows no native squiggles; with it on, they
  appear. The chrome note reflects the state.

## Step 3.7 — Save-state UI (the psychological save)
- **Goal:** visible reassurance even though Etherpad autosaves.
- **Depends on:** 3.4.
- **Build:** A Save button and a save-state indicator ("Saving… → Saved ✓"). Etherpad already
  persists continuously; the button confirms/flushes and updates the indicator. Wire the
  word-count display to update live.
- **Done when:** typing shows Saving then Saved; clicking Save confirms; word count updates.

---

**Exit check for Phase 3:** a logged-in student opens an assignment, lands in their own pad inside
the InkHeron shell, writes with full formatting and a live word count, spellcheck honours the
assignment flag, and save-state reassures. Log in SESSION_NOTES.md, move to Phase 4.
