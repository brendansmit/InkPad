# Phase 7 — Green-pen loop

The rewrite pedagogy. Marking reopens the pad; the student improves using feedback and resends.
Three distinct feedback types — see CLAUDE.md §6 and DESIGN.md §5. Analyzer boundary in §9.

The three-way model (do not collapse):
1. **Grammar / literacy codes** — inline marks. Hover shows the CODE CATEGORY ONLY (e.g.
   "Grammar"), NEVER the correction. A legend sidebar lists code → meaning. The student works out
   the fix themselves using the literacy guide.
2. **Targets** — coaching. Brief line expands on click to a full explanation of why it matters and
   how to improve, plus a "Try now" prompt. Targets TEACH so the student can act immediately.
3. **Strengths** — brief line expands to an explanation of what worked and why.

---

## Step 7.1 — Attach codes/targets/strengths to a submission
- **Goal:** the feedback data exists on the submission.
- **Depends on:** Phase 6.4/6.5. Boundary: codes/targets/strengths originate from the Writing
  Analyzer (separate app) or teacher selection — InkHeron stores and displays, does not generate.
- **Build:** Storage for inline codes (span + code), selected targets (with their coaching text),
  selected strengths (with their text), keyed to the submission.
- **Done when:** a submission can carry codes, targets, and strengths, retrievable for display.

## Step 7.2 — Marking reopens the pad (green-pen state)
- **Goal:** state transition marked → green_pen_open.
- **Depends on:** 7.1, Phase 4 state machine. Only if `settings_json.green_pen` is true.
- **Build:** When the teacher finishes marking and green_pen is enabled, transition the pad to
  `green_pen_open` and make it editable by the student again (even if it was a locked draft/exam —
  marking explicitly releases this new round). If green_pen is false, stays locked.
- **Done when:** after marking, a green_pen assignment is editable again for the student; a
  non-green_pen one stays locked.

## Step 7.3 — Student green-pen view
- **Goal:** the rewrite surface from the mockup.
- **Depends on:** 7.1, 7.2, student mockup green-pen view, DESIGN.md.
- **Build:** Render the pad with: inline grammar marks (hover = category only, answer-free);
  the grammar legend sidebar (code → meaning + "use your literacy guide" footer + legend↔mark
  hover link); targets panel (click to expand coaching + "Try now"); strengths panel (click to
  expand). Formatting toolbar and word count present. Resend button.
- **Done when:** the green-pen view matches the mockup; grammar hovers never reveal a fix; targets
  and strengths expand to their explanations.

## Step 7.4 — Prominent green-pen surfacing on the dashboard
- **Goal:** the student can't miss returned work.
- **Depends on:** 7.2, student dashboard.
- **Build:** When a piece is in `green_pen_open`, show the prominent coral "Feedback ready / fix
  and resend" card at the top of the action-led dashboard, and the "Needs rewrite" pill in the
  timeline view.
- **Done when:** returned work appears prominently in both dashboard views.

## Step 7.5 — Resend (resubmit) the revised version
- **Goal:** close the loop.
- **Depends on:** 7.3, Phase 4.5 notification.
- **Build:** Resend transitions `green_pen_open → resubmitted`, records the new version, fires the
  Server酱 notification. The teacher can re-open/re-grade. Decide if the pad locks on resend
  (default: yes, like submit) or allows further rounds (teacher can reopen again).
- **Done when:** resend records the revised version, notifies the teacher, and the dashboard
  status updates.

---

**Exit check for Phase 7:** teacher marks (codes/targets/strengths attached), the pad reopens, the
student sees an answer-free grammar legend, coaching targets, and expandable strengths, revises,
and resends with a teacher notification. The Analyzer boundary stays clean. Log in SESSION_NOTES.md.

This completes the day-one Writing portal end to end.
