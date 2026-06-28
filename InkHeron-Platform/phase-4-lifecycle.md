# Phase 4 — Assignment lifecycle & submission

The pad state machine made real. See CLAUDE.md §5 (settings object) and §6 (states).

---

## Step 4.1 — Assignments with settings_json
- **Goal:** teacher creates assignments carrying their settings.
- **Depends on:** Phase 2.4, Phase 1.7.
- **Build:** Teacher create-assignment form: title, class, type (essay/test), opens_at, due_at,
  and the settings object (submit_behaviour exam/draft, spellcheck, green_pen; word_count always
  true; paste_detection always true for writing). Store settings_json on the assignment.
- **Done when:** an assignment is created with a valid settings_json and appears for the right
  class.

## Step 4.2 — Opens/closes by date
- **Goal:** assignments respect opens_at / due_at.
- **Depends on:** 4.1, Phase 3.2.
- **Build:** Student dashboard only lets a student open a pad once opens_at has passed. Surface
  "Opens Monday" style states before that (matches mockup "Coming up").
- **Done when:** a not-yet-open assignment is visible but not enterable; an open one is enterable.

## Step 4.3 — Submit action + state transition
- **Goal:** student submits; state advances.
- **Depends on:** Phase 3, 4.1.
- **Build:** Submit button transitions pad `writing → submitted`, writes a `submissions` row with
  submitted_at. Behaviour by `submit_behaviour`:
  - **exam:** TERMINAL — pad immediately locks read-only, no further edits ever.
  - **draft:** marks the gradeable version but pad stays editable until due_at.
  Confirm-on-submit dialog. Update dashboard status pill.
- **Done when:** exam submit locks the pad hard; draft submit records the version but still
  allows edits; a submissions row exists.

## Step 4.4 — Due-date hard lock for drafts
- **Goal:** drafts lock at due_at.
- **Depends on:** 4.3.
- **Build:** A scheduled check (or on-open check) that, once due_at passes, transitions any draft
  pad to locked read-only regardless of submit state. Show "closed" in the UI.
- **Done when:** after due_at a draft pad is read-only; before it, editable.

## Step 4.5 — Server酱 WeChat notification on submission
- **Goal:** teacher is pinged when work comes in.
- **Depends on:** 4.3, Phase 8 (Server酱 key) — if key not yet set, no-op gracefully.
- **Build:** On submit (and on green-pen resend later), send a Server酱 push: student name,
  assignment title, time. Read the Server酱 key from server-side settings. Fail silently if unset.
- **Done when:** submitting fires a WeChat notification when a key is configured; nothing breaks
  when it isn't.

## Step 4.6 — Dashboard status accuracy
- **Goal:** status pills reflect true state.
- **Depends on:** 4.3, 4.4, student mockup.
- **Build:** Map pad/submission state to the pills: not started / in progress / submitted /
  marked / needs rewrite. Drive both dashboard views (action-led and timeline) from real state.
- **Done when:** the dashboard shows correct, live status for each assignment in both toggle views.

---

**Exit check for Phase 4:** assignments open and close on schedule, students submit, exam locks
are terminal and draft locks land at due_at, the teacher gets a WeChat ping, and dashboards show
true status. Log in SESSION_NOTES.md, move to Phase 5.
