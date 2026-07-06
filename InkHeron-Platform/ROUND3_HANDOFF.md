# ROUND3_HANDOFF.md — marking-room feedback from first real use

You are Opus (full-stack this round). Branch `analysis-ai`. Read CLAUDE.md
(especially §8.1), then the conventions in SONNET_HANDOFF.md rules 1-10 and
OPUS_HANDOFF.md (tokens, self-hosted assets, student copy rules, preview
verification with screenshots at 1440px and 1024px). Do NOT deploy; the
teacher's Fable session deploys. Commit each item separately, log each in
SESSION_NOTES.md.

## 1. Stop wasting the teacher's time in the contested pile

The checker's forced least-confident quota (src/services/checker.js) flags
~10% of every batch even when the checker rated them 0.9+. Teacher: reviewing
things the system is 90% sure about is a waste of time.
Change: apply the quota ONLY among findings with confidence < 0.9. If every
judged finding is >= 0.9, flag nothing extra (genuine flags like
code_questioned, not_verbatim and MT manual review are untouched). Update the
existing quota test in test/literacyCoder.test.js accordingly (a batch of six
0.9s produces zero least_confident; a batch with some 0.7s still flags the
lowest of those).

## 2. Rubric switching: every loaded rubric gets a tab, all scorable

public/teacher/native-review.html cardRubric() only renders the internal tab
plus an AP tab gated on is_ap_lang. The review payload already carries
`rubric`, `secondary_rubric` and `exam_rubric` with names from
settings.rubric_names. Fix: render a tab for EVERY rubric kind that has
criteria (internal, secondary, exam), labelled with its real name. setScore
must hit the right endpoint per kind (PUT rubric-scores /
secondary-rubric-scores / exam-rubric-scores all exist). The teacher must be
able to score two rubrics on the same essay in one pass (AP Lang case).
Verify totals for each kind land in the dashboard columns from round 2.

## 3. Strengths/targets: choose the source table(s), and tell the AI

The payload has `feedback_tables` and `applied_feedback_table` but the
redesigned review page lost the switcher. Restore it in the strengths and
targets card: a select (each table plus "All tables") that persists via the
existing applied-feedback-table mechanism (find the PUT/POST in
nativePads.js; add one if missing following its conventions).
Then wire the AI: src/services/feedbackSuggester.js should receive the
selected table(s)' strength/target option lists (feedbackOptionsForAssignment
exists in nativePads.js; lift or share the helper) and its prompt gains: "The
teacher works from this feedback bank. Prefer suggesting items from it,
adapted to this essay; invent a new one only when nothing in the bank fits."
Scope 'all' sends every table. Tests: suggester prompt contains bank items;
switching table changes what is sent.

## 4. Layered marks: a spelling error inside a structure error must show

Real case: "Also the process of making rokets, the different stratergy of
powering them." was one grammar/structure mark; "rokets" and "stratergy"
(Sp) were invisible because every renderer drops overlapping spans.
- Doer prompt (literacyCoder.js): add rule: "Errors can overlap. When a
  whole clause has a structure error (STR, inc, RO) and words inside it also
  have their own errors (Sp, WW, VT...), report BOTH: the clause-level
  finding AND each word-level finding separately."
- Renderers: native-review.html renderEssay currently keeps only
  non-overlapping spans (kept if sp.s >= lastEnd). Replace with segment
  rendering: split text at every span boundary; each segment carries ALL
  covering marks (stack up to 2 underlines visually: inner word-level mark
  wins the background wash, outer clause-level mark shows as the underline;
  hover lists all labels; click opens the code changer for the INNERMOST).
  Same segment approach in native-feedback.html. In the green-pen engine
  (nativeWrite.js) allow nested [data-gp] spans: wrap word-level marks
  inside clause-level ones (wrap innermost first so ranges stay valid).
- Tests: two overlapping suggestions both auto-promote and both appear in
  the review payload; page test asserts both marks render.

## 5. Selection toolbar: copy, comment, or tag a missed error

Current behaviour: selecting text on the review page immediately opens the
comment popover, which breaks highlight-to-copy. Replace with a small
non-intrusive toolbar that appears NEAR the selection on mouseup without
touching the selection or focus (so Ctrl/Cmd+C keeps working normally):
[ Comment ] [ Mark error ▾ ]. Comment opens the existing comment popover.
Mark error opens a code dropdown (reuse ALL_CODES from the code changer) and
creates a native_annotations literacy_code row at the selection offsets via
the existing POST /api/native/pads/:padId/annotations (source 'teacher' in
metadata) — this is how the teacher tags mistakes the marking missed, e.g.
"the course CSP and CSA improves". The toolbar disappears on click elsewhere
or when the selection collapses. Verify in the browser: select text, press
Cmd+C, paste works; then mark a span as Gra and see it appear in the
Auto-marked groups and profile evidence.

## Definition of done
All five items, npm test fully green (145+ tests, zero failures — the old
"known 4" are fixed, do not reintroduce them), committed separately,
verified with preview screenshots, logged in SESSION_NOTES.md.
