# Add-on — Demo (guest) & Ghost accounts

**Apply this AFTER Phase 2.1 is finished** (students table + CRUD exist). It adds two special
account kinds and one filtering discipline. Small to add now, painful to retrofit later — the
flags must exist before the counting/export/calibration queries are written.

Two account kinds:
- **Guest / demo** — for outsiders to see what the platform is like, isolated from real data.
- **Ghost** — your own test account: sees and receives everything, experiences the platform as a
  student, but is invisible to every tally, export, average, and calibration.

---

## Defaults chosen (flip before building if you disagree)
- **Guests:** fully interactive (can write/submit/see the green-pen flow) AND resettable to a
  clean demo state. Not read-only.
- **Ghost:** auto-enrols in EVERY assignment automatically (auto-provisions a pad), so it is a
  zero-setup, always-on test harness.

---

## Data model changes

Add to the **students** table:
- `is_demo` (bool, default false)
- `is_ghost` (bool, default false)

Add a demo class (a normal `classes` row) that demo accounts are locked to. Real classes never
contain demo or ghost students by accident.

---

## THE ONE RULE (put this in CLAUDE.md too)

**Every aggregate, tally, count, average, export, analytic, paste/focus stat, and difficulty
calibration MUST exclude demo and ghost accounts**, via a single shared query-layer filter:

```
WHERE is_demo = false AND is_ghost = false
```

Enforce this in ONE place (a shared "real students only" query helper), not remembered
per-query. If it is sprinkled across queries, someone forgets it and a ghost/demo leaks into a
tally. This is the difference between reliable invisibility and constant bugs.

What this must exclude them from, concretely:
- class submission counts ("18 of 20 submitted")
- class average / completion rate / any analytics
- CSV grade exports (no ghost/demo row in the gradebook)
- paste-flag review counts, focus-loss stats
- difficulty calibration + the difficulty predictor (Tests portal) — ghost answers must NEVER
  skew a question's observed difficulty

Demo/ghost accounts DO still get: their own pads, the full write/submit/mark/green-pen
experience, dashboards. They are mechanically normal; they are just statistically invisible.

---

## Steps

### Step A — Account flags + helper
- **Goal:** the flags exist and the shared filter exists.
- **Depends on:** Phase 2.1.
- **Build:** Add `is_demo`, `is_ghost` to students (migration). Create ONE shared query helper /
  scope used everywhere real-student aggregates are computed, applying the WHERE above. Document it.
- **Done when:** flags exist; a single helper is the only path for "real students" counts.

### Step B — Ghost account + auto-enrol
- **Goal:** one ghost account that receives every assignment with no setup.
- **Depends on:** Step A, Phase 3.2 (pad provisioning), Phase 4.1 (assignments).
- **Build:** Create one student with `is_ghost = true`. On ANY assignment creation, in ANY class,
  auto-provision a ghost pad for it (so you can immediately open it as a student and test). The
  ghost can write, submit, be marked, and run the green-pen loop like any student.
- **Done when:** creating a new assignment anywhere instantly gives the ghost a usable pad; the
  ghost can complete the full student flow; the ghost appears in NO tally, average, or export.

### Step C — Guest/demo accounts + sandbox
- **Goal:** shareable accounts that show the platform safely.
- **Depends on:** Step A.
- **Build:** Create one (or a few) `is_demo = true` students locked to the demo class. Populate
  the demo class with example assignments and pre-filled example work (a clean essay, a marked
  one showing codes/targets/strengths, one mid-green-pen) so a guest sees the real experience.
  Guests are fully interactive but confined to the demo class — they can never see or touch real
  classes or real students.
- **Done when:** a guest logs in, sees a realistic demo dashboard, can open and interact with
  demo work, and cannot reach any real class or student.

### Step D — Demo reset
- **Goal:** the demo doesn't drift as visitors use it.
- **Depends on:** Step C.
- **Build:** A "Reset demo" action (teacher-triggered button is enough; a timer/logout reset is
  optional) that restores the demo class and demo accounts to their clean seeded state.
- **Done when:** after a guest has edited demo work, one reset returns it to the original clean
  demo state.

---

## Touch points in existing phases (apply the filter when you reach them)
- **Phase 4** — ghost auto-enrol on assignment creation; exclude demo/ghost from submission status counts.
- **Phase 6** — exclude demo/ghost from teacher tallies, class status, and CSV export.
- **Phase 9** — exclude ghost/demo from difficulty calibration and the predictor.

When each of those phases is built, the shared helper from Step A is what they call. The filter is
decided once here and reused, not reinvented per phase.
