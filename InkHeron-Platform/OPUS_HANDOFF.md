# OPUS_HANDOFF.md — teacher review page, student feedback view, profile dashboard

You are Opus. Read CLAUDE.md fully (especially §8.1), then this file. Work on
branch `analysis-ai`. The backend seams exist or are being built by Sonnet
per SONNET_HANDOFF.md; if an endpoint you need is missing, build it following
the conventions in that file rather than blocking.

## Approved designs (build these, do not redesign)

Pixel references, screenshot-verified, in `mockups/review-redesign/`:

1. `direction-d.html` → rebuild `public/teacher/native-review.html`
2. `student-view.html` → rebuild the student feedback view (`public/native-feedback.html`)
3. `profile-dashboard.html` → new teacher page `public/teacher/student-profile.html`

Reuse the CSS variables/design tokens exactly as the mockups do. Self-host
every asset (CLAUDE.md §3.2), no CDNs. Student-facing copy: high B1 to low
C1, no em dashes, no en dashes, no Oxford commas, metric units.

## 1. Teacher review page (direction D)

Context: the teacher marks 50 essays in a sitting. Each essay arrives with
~40 auto-applied AI literacy marks (CLAUDE.md §8.1) and a small contested
pile. The page must make the happy path (read → rubric → 1-2 comments →
next student) fast, and everything else exception-driven.

- Data: `GET /api/native/pads/:padId/review` (feedback, suggestions,
  annotations, comparison, three rubrics, student_profile).
- Essay center, calm marks: thin category-coloured underlines (surface amber,
  grammar maroon, format blue), contested = dotted coral. Hover shows
  category label only. No background washes at 40 marks.
- Right rail, in order:
  a. Auto-marked summary card: grouped by code with counts, click a group to
     cycle its spans in the text, per-mark "disagree" → 
     `POST /api/native/pads/:padId/suggestions/:id/disagree` (retracts).
  b. "Needs you" pile: contested suggestions (status pending), one card at a
     time with keep / change code / not an error. Keyboard: A keep, D dismiss.
  c. Strengths and targets: teacher's items (POST/DELETE feedback-items) plus
     AI-suggested ones from `GET .../feedback-suggestions?status=pending`
     with Use / Edit / Reject (accept endpoint per SONNET_HANDOFF).
  d. Rubric card, tabbed per rubric_kind (internal + AP for AP Lang classes).
     Clickable points AND half-points between them (see mockup .scale/.pt.half).
     Criterion name + current value always visible; band descriptor text
     expands under the criterion ("full band text" link).
- Top bar: student name, word count, version, paste-event count, "N of 50
  marked", Prev / Next unmarked student in the same assignment, Finish
  marking. Next-student loop is the core efficiency feature.
- Inline comments: select text in the essay → small popover → comment saves
  as native_annotation type inline_comment. General comment field too.
- NEVER render ai_grade_estimates anywhere on this page.

## 2. Student feedback view (student-view mockup)

The student opens marked work with ~40 marks + 5-8 strengths/targets + 1-2
comments + rubric scores, and must not drown:

- Focus bar: category filter chips with counts (All / Spelling and words /
  Grammar / Punctuation). Filtering dims other marks (.mk.dim).
- Marks: hover reveals CATEGORY ONLY, never the fix (phase-7 rule).
- Targets panel: checkbox tick-off per target →
  `POST .../feedback-items/:id/toggle-check` (Sonnet builds; student session).
  Ticked = strikethrough, counts into the "12 / 41 fixed" progress strip.
- Strengths expand to explanation. Try-now prompts as pills.
- Scores: internal rubric bars, then "If this were the AP exam" AP bar for AP
  classes. Always show the line: grammar marks are practice, not the grade.
- Green pen CTA opens the rewrite pad.

## 3. Profile dashboard (profile-dashboard mockup)

Teacher page per student; "Student version" button renders the same data
with teacher-only cards removed (anomaly banner and provenance strip are
TEACHER-ONLY; never in the student version).

- Profile tabs: EAP (one combined profile) and, for AP Lang students, one
  tab per essay type (Argument / Rhetorical analysis / Synthesis). A type
  tab is locked until 2 marked essays of that type exist (`assignments.
  settings_json.essay_type`, see SONNET_HANDOFF).
- Headline stats: LENGTH-NORMALIZED numbers lead (errors per 100 words =
  literacy evidence count / pad word_count * 100), raw totals in the
  sub-line. Trends from first-half vs second-half means.
- Essay strip: one chip per pad with genre, word count, err/100, and a
  provenance badge from `settings_json.supervision` ('in_class' | 'mixed' |
  'homework') — green watched, amber started in class, grey homework. An
  essay with style anomalies gets the coral flagged border.
- Anomaly banner: from `detectStyleAnomaly(db, { padId })`
  (src/services/styleMetrics.js) — show top features in plain words with sd,
  the comparison to their watched baseline, and the exact framing in the
  mockup: evidence for a conversation, not proof. Link to revision replay.
- Recurring errors card: per-100-words bars per code across essays, fix rate
  (from implementation_scores addressed_json), trend tag. Codes hover-explain.
- Voice fingerprint: bars vs class median (median across `is_demo=0 AND
  is_ghost=0` students only — use src/db/realStudents.js). Every term has a
  hover tooltip AND a click-to-expand explainer panel with a concrete
  practice suggestion (mockup .explainer).
- "Voice, in words": one card per finding, student-readable, each backed by
  a number visible on the page and (where possible) an evidence quote from
  student_literacy_evidence. Rendered from profileSummarizer output.
- AP per-type cards: strongest genre, weakest genre, the register delta
  (e.g. first-person rate in analysis vs what the genre needs), one concrete
  fix each. Data: style_metrics + score_snapshots grouped by essay_type.

Backend read model: add `GET /api/students/:studentId/writing-profile`
returning profile fields, issue stats, evidence, aggregateStyleProfile,
per-pad style_metrics + provenance + anomaly flags, score snapshots grouped
by rubric_kind and essay_type. Exclude nothing for the teacher; the student
variant strips anomaly/provenance.

## Verification and process

- Verify every page with the preview tools at 1440px AND 1024px; screenshot
  in the final report. Test the disagree flow, target tick-off, half-point
  rubric clicks and category filtering by driving the real endpoints.
- npm test with Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`);
  known baseline failures listed in SONNET_HANDOFF rule 9 are not yours.
- Git root is the parent Claude/ folder; stage explicit paths, never -A.
  Small commits, each logged in SESSION_NOTES.md.
