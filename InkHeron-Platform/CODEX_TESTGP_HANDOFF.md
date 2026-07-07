# CODEX_TESTGP_HANDOFF.md — green pen for tests (FRQ + SRQ rewrites)

Same rules as CODEX_TESTPORTAL_HANDOFF.md §Ground rules (read it again, all
nine apply). Branch `test-greenpen` off `analysis-ai`. Suite is 156/156 and
must stay fully green. Do not deploy.

## Goal

The teacher green-pens essays today: one click creates a rewrite assignment,
each student gets a pad seeded with their marked text, marks show inside the
editor, they revise and resubmit. Tests must join that loop: the FRQ essay
AND the SRQ answers become one revisable InkPad rewrite.

## The two defects to fix in createGreenpenRewriteAssignment (nativePads.js)

1. It clones `type: source.type` and spreads the source settings. For a
   source assignment of type 'test' the rewrite must instead be:
   type 'essay', submit_behaviour 'draft', native_inkpad true, green_pen
   false, greenpen_rewrite true, source_assignment_id set, essay_type
   carried from the FRQ genre if present, supervision 'in_class',
   feedback_release 'batch', and the ENTIRE `test` config plus
   timer/shuffle/focus/pooling fields STRIPPED. Prompt: "Rewrite your test
   answers using your feedback."
2. Pad seeding: for essay sources it clones the pad text (keep as is). For
   test sources, seed each student's rewrite pad with a composite:
   a. the student's FRQ pad plain_text FIRST (if the test had an FRQ and
      the student wrote anything) — first so the FRQ annotation offsets
      stay valid when copied;
   b. then, for each SRQ question in section order, a block separated by
      one blank line: the question prompt on its own line, then the
      student's answer text from test_responses (skip unanswered).
   Compose plain_text and a matching simple document_json the way the
   existing clone code does. Word count recomputed. Students with no
   written work at all get no rewrite pad (same as essays with empty pads,
   match existing behaviour).
3. Annotations: keep the existing copy of FRQ pad annotations onto the
   rewrite pad (offsets are safe because FRQ text leads). Set
   rewrite_of_pad_id to the student's FRQ pad when one exists; when the
   test had no FRQ leave it NULL (known trade-off, accepted by the
   teacher's reviewer: the implementation scorer's diff is FRQ-based, so
   for tests with SRQs its cosmetic ratio is indicative only — do NOT
   modify the scorer).

## Wiring

- The greenpen-rewrite endpoint already exists; it must accept test
  assignments (today nativeEnabled(source) may reject them — make type
  'test' assignments eligible).
- Teacher UI: /teacher/test-review gets a "Green pen rewrite" button
  (mirroring the one on the essay assignment page) calling the same
  endpoint, visible once at least one attempt is submitted.
- After creation everything downstream must just work with zero further
  changes: marks in the editor (greenpen-context), targets tick-off,
  re-check clearing, AI analysis on resubmit. Do not touch that code; if
  something downstream breaks, fix the seeding, not the pipeline.

## Tests (all via app.inject, node:test)

- Green-penning a test creates an essay-type rewrite assignment with test
  config stripped (assert settings_json has no test/timer/shuffle keys).
- Composite seeding: student with FRQ text + two SRQ answers gets a pad
  whose plain_text starts with the FRQ text and contains both prompts and
  answers in order; FRQ annotations copied with identical offsets;
  rewrite_of_pad_id points at the FRQ pad.
- SRQ-only test: pad seeded from SRQs, rewrite_of_pad_id NULL.
- Student with no answers gets no pad.
- Essay green pen behaviour unchanged (existing tests stay green).
- greenpen-context on a test rewrite returns the copied FRQ marks.

Definition of done: suite fully green (156 + new), committed in small
steps on `test-greenpen`, logged in SESSION_NOTES.md, no deploy.
