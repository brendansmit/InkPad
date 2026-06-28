# Phase 6 — Teacher dashboard

Wire to the EXISTING teacher UI (the three attached files: gradebook table = assignment
dashboard; master-detail split = review surface). Do not redesign. See DESIGN.md.

---

## Step 6.1 — Assignment dashboard (class + assignment view)
- **Goal:** teacher sees an assignment's students and their submission status at a glance.
- **Depends on:** Phase 4.6, teacher UI Layout 1.
- **Build:** For a chosen assignment: a table of students with status (not started / writing /
  submitted / marked / released), submission time, and the paste flag (Phase 5.4). Sort/filter.
- **Done when:** the table shows accurate live status and paste flags per student.

## Step 6.2 — Review surface (open one student's work)
- **Goal:** the per-student marking view.
- **Depends on:** 6.1, teacher UI Layout 2 (master-detail).
- **Build:** Clicking a student opens: the submitted text; buttons for (a) timeslider replay,
  (b) literacy coding view; the strengths and targets selectors; a grade field. Lay out per the
  existing teacher mockup.
- **Done when:** a teacher can open a submission and see text + the action buttons + grade field.

## Step 6.3 — Timeslider replay button
- **Goal:** watch how the piece was written.
- **Depends on:** 6.2, Etherpad timeslider.
- **Build:** The replay button opens Etherpad's timeslider for that pad (the keystroke-level
  history with playback). This is the core authenticity evidence.
- **Done when:** clicking replay scrubs the writing history of that exact submission.

## Step 6.4 — Literacy coding view
- **Goal:** see the coded text.
- **Depends on:** 6.2, Phase 7 (codes attach to submission). Boundary: codes come from the
  Writing Analyzer, not generated here.
- **Build:** A view rendering the submission with literacy code marks (the maroon/amber underline
  + superscript style from DESIGN.md). Read codes attached to the submission.
- **Done when:** the coded version renders with the correct code marks.

## Step 6.5 — Strengths & targets selection
- **Goal:** teacher assigns strengths/targets to the student.
- **Depends on:** 6.2.
- **Build:** Selectable strengths and targets (from the literacy guide library) attached to the
  submission. These feed the student green-pen view (Phase 7). Targets carry the coaching
  explanation; strengths carry the what-worked explanation.
- **Done when:** selected strengths/targets save against the submission.

## Step 6.6 — Grade entry + held-until-release
- **Goal:** grades stay hidden until the teacher releases them.
- **Depends on:** 6.2, grades table.
- **Build:** Grade field writes a `grades` row with `released = false`. Students cannot see a grade
  while held. A clear per-assignment "Release all grades" action flips every grade for that
  assignment to released at once. Dashboard shows held vs released state plainly.
- **Done when:** grades entered are hidden from students; "Release all" reveals them together; the
  dashboard shows which state the assignment is in.

## Step 6.7 — CSV export
- **Goal:** export grades.
- **Depends on:** 6.6.
- **Build:** Export per assignment: student name, submission status, grade, date, paste flag. Plain
  CSV download.
- **Done when:** the CSV downloads with correct rows for the assignment.

## Step 6.8 — Carry-forward of targets (meaningful add)
- **Goal:** see if a student fixed last time's targets.
- **Depends on:** 6.5, prior submissions.
- **Build:** When setting targets, show the previous assignment's targets for that student
  alongside. Read from the student's history. (Per-category error charts are deferred — they need
  accumulated data; design the slot, fill later.)
- **Done when:** the review surface shows last assignment's targets next to the new ones.

---

**Exit check for Phase 6:** teacher opens an assignment, sees status + paste flags, opens a
student, replays the writing, sees codes, sets strengths/targets, grades, holds then releases all
grades together, exports CSV, and sees carried-forward targets. Log in SESSION_NOTES.md, move to
Phase 7.
