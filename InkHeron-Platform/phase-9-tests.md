# Phase 9 — Tests portal (LATER — sketch only)

NOT day-one. This is the decided-in-principle design for the assessment portal, captured so it is
not lost and so the day-one data model leaves room for it. Build after the Writing portal is live.
Steps here are coarser than other phases by design — flesh them out when you start this phase.

Shares the same login, DB, and teacher dashboard as the Writing portal.

---

## Decided design (the contract for this portal)

**Question bank + import**
- Primary authoring path: paste messy text (passage + questions), AI extracts and structures it
  (doer model), a second different model validates against the source (checker), flagged items
  surface to the teacher for review. Doer = capable model, checker = cheaper/different family,
  checker flags only and never auto-corrects. CSV import kept as a bulk fallback for already-clean
  sets.
- Storage: a passages table and an items table linked by `passage_id`. A passage is stored once;
  questions point at it. Standalone (EAP) questions have no passage.

**Question types (one continuous scrolling page, MCQs first, essays last)**
- MCQs: single-answer and multi-select; passage-grouped (AP) or standalone (EAP).
- SRQs: short typed answers, pinned in sequence, never shuffled.
- FRQs: lightweight autosaving in-test editor — NOT embedded Etherpad (full Etherpad is reserved
  for the Writing portal).

**Shuffle (permute within group, never across)**
- Standalone/EAP: shuffle allowed within a section, not across sections.
- AP Lang/passage-grouped: questions shuffle only among questions tied to the EXACT same passage;
  passages and sections hold their position. Options within an MCQ may shuffle.
- Every item carries its group identity (passage_id, else section) so the shuffler can't lift it
  out of its group.

**Pooling (optional, per assignment)**
- Modes: off / background / live. Background predicts and accumulates silently; the teacher flips
  to live only once predictions are trustworthy. HARD-disabled for exams — exams serve one
  standard paper to every student (only shuffle/order varies), for 100% fairness.
- Difficulty: starts as the teacher's rough tag, then self-corrects from observed percent-correct
  as responses accumulate. A predictor estimates a NEW question's difficulty from features
  (length, vocab, passage-dependence, option count, tag) learned from the calibrated set. Pooling
  draws to a fixed difficulty profile (and optional tag spread) so pooled papers are statistically
  equivalent — never pure random. Passage-grouped pooling draws at the passage level, not the item
  level.

**Exam integrity (lockdown-lite — detect, not prevent)**
- Per-student within-group shuffle, server-enforced timer with auto-submit, per-answer autosave,
  fullscreen with exit logging, focus-loss detection with a visible counter, copy-paste and
  right-click blocking, post-submission locking.
- Focus-loss warning: TEST PORTAL ONLY. First blur = soft kind warning + chime + log. Subsequent
  blurs = firm modal ("You have left the test tab. This has been recorded.") + chime + log,
  blocking until acknowledged. Every event logged (student, timestamp, duration). Trigger = browser
  blur/visibility event. Honest limit: catches tab/app switches on the test machine only; second
  devices and phones are the invigilator's job (in-class, invigilated testing).

---

## Step sketch (expand when building)

- 9.1 — Data model: passages, items, papers, responses, alongside existing assignments/submissions.
- 9.2 — AI extraction pipeline (doer/checker via the Phase 8.5 OpenRouter module) + review screen.
- 9.3 — CSV bulk import fallback.
- 9.4 — Test rendering: one scrolling page, MCQ/SRQ/FRQ, passage grouping.
- 9.5 — Shuffle engine (within-group only).
- 9.6 — Timer + autosave + auto-submit.
- 9.7 — Integrity stack (fullscreen, focus warning test-only, paste/right-click block, locking).
- 9.8 — Difficulty calibration + predictor.
- 9.9 — Pooling (background → live, exam-disabled, stratified draws).
- 9.10 — Marking + grades into the same grades table + CSV export.

---

Build order when this phase starts: FRQ first (existing flow + timer/auto-submit), then MCQ
question bank, then SRQs. Build the bank from day one of THIS phase. Keep everything hanging off
the existing accounts/dashboard so it stays one platform.
