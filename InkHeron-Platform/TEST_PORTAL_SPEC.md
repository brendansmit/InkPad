# TEST_PORTAL_SPEC.md — Tests portal, writing-pipeline integration points

Status: SPEC ONLY (2026-07-02). The Tests portal is the later phase from
CLAUDE.md §1. This file pins the decisions that affect the writing pipeline
being built now, so nothing gets designed into a corner.

## Shape

Part of the EAP portal, teacher-assigned like essays. Three question kinds
per test, in sections:
- MCQ: auto-marked, options shuffle within group only (settings §5 rules,
  pooling/focus/timer fields already reserved in settings_json).
- SRQ (short response): student types 1-5 sentences; AI-assisted marking
  with teacher override (Doer proposes score + note, teacher confirms —
  same auto-accept-with-disagree philosophy as CLAUDE.md §8.1).
- FRQ / essay: **is a native pad.** Not a new editor, not a new table.

## The FRQ decision (the reason this file exists)

An FRQ answer creates a normal `native_pads` row (student, assignment) with
`settings_json.type='test'`, `submit_behaviour='exam'`, plus
`essay_type` set (e.g. 'synthesis' for AP practice) and
`supervision='in_class'`. That means, with zero extra plumbing:
- the whole review/marking structure being built now (auto literacy codes,
  contested pile, rubrics with half points, strengths/targets) works on FRQs;
- FRQ submissions flow into `style_metrics`, the literacy evidence tables
  and the per-genre AP profiles — exam writing is the highest-value
  provenance data there is (always watched, always timed);
- green pen can optionally reopen an FRQ as revision practice.

Keep any future test tables (questions, answers, sections) SEPARATE from the
essay tables; only the FRQ hooks into native_pads. Timed-mode lock and the
exam terminal state already exist in the pad lifecycle (§6).

## Deferred (decide when the portal is actually built)

Question bank schema, MCQ pooling behaviours, focus warnings, section
timers, SRQ rubric shape, per-question analytics.
