# OPUS_HANDOFF_2.md — navigation, class data page, dashboard polish

You are Opus. Branch `analysis-ai`. Read CLAUDE.md fully, then OPUS_HANDOFF.md
for conventions (tokens, self-hosted assets, B1-C1 student copy, no em/en
dashes, no Oxford commas, verify with preview tools at 1440px and 1024px,
screenshots in the final report). Run AFTER Sonnet finishes
SONNET_HANDOFF_2.md — you consume its dashboard fields and export endpoint.
Do NOT deploy to the droplet; the teacher's Fable session deploys. Commit in
small steps, log in SESSION_NOTES.md.

## 1. Back button on the marking page

public/teacher/native-review.html has no way back. Add a back control in the
top bar (left of the student name): "← Assignments" linking to
/teacher/assignments?id=<assignment id> once the review payload loads
(fallback /teacher/assignments). Keep the bar compact at 1024px.

## 2. Teacher dashboard navigation (public/teacher/index.html)

The teacher cannot reach the analysis pages from anywhere. Add:
- A "Student profiles" card/section: class picker + student list linking each
  student to /teacher/student-profile?student_id=<id> (roster comes from the
  existing classes/students APIs).
- A "Class insights" card linking to the new page below, one link per class.
Also add a small "Profile" link per student row on the assignment dashboard
(assignments.html) so marking flows into the profile in one click.

## 3. Class data page (NEW): /teacher/class-insights?class_id=<id>

New page public/teacher/class-insights.html + route in app.js (teacher
session) + read model endpoint `GET /api/classes/:classId/insights`
(teacher session) in an appropriate routes file. All aggregates EXCLUDE
is_demo/is_ghost via src/db/realStudents.js — no exceptions.

Endpoint returns, computed across the class's real students:
- recurring codes: per code, how many students have open issues and the
  class total per 100 words (student_literacy_issue_stats + style/word
  counts), sorted by students-affected.
- err/100 trend across the class per essay index (first essay, second...).
- green-pen: class fix rate from implementation_scores.
- rubric: average internal total per assignment over time (score_snapshots).
- marker profile: from ai_grade_estimates rows WHERE teacher_score IS NOT
  NULL only (never expose rows for unmarked pads): per rubric_kind and
  criterion, mean delta and count. This section renders ONLY when >= 10
  scored deltas exist; otherwise show "collects as you mark".
- per-student mini-rows: name, essays, err/100 latest, top code, link to
  their profile.

Page design: follow the design language of student-profile.html (cards,
tokens, bars). Headline: "18 of 24 students have open VT issues" style
statements, because that is what drives lesson planning. Handle sparse data
gracefully everywhere (a fresh class shows friendly empties, no NaN).

## 4. Assignment dashboard polish (public/teacher/assignments.html)

After Sonnet's fields land:
- Score column shows "12 / 15" (and AP column for AP Lang classes), the
  status pill understands marked / green_pen_open / resubmitted.
- "Export to gradebook" button on the assignment detail header calling
  `POST /api/assignments/:id/export-to-admin`, with a result toast
  ("Exported 24 scores"). Disable with a hint when the export key is not
  configured (probe: the endpoint returns a distinct error code).
- Keep the existing CSV export button.

## 5. Student-facing check

Whatever you touch: students never see the word AI or anything implying
machine marking. Feedback is from "your teacher".

Verify every page live with preview tools driving real endpoints (seed a
class like the earlier Opus session did), screenshots at both widths in the
final report. Definition of done: all five items, npm test green except the
known 4 baseline failures, committed, logged.
