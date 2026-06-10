# Session Notes

## 2026-06-02

**Asked:** Initialize a git repo and make an initial commit of the working tree.

**Did:**
- User ran `git init` after being told the directory was not a git repo.
- Created `.gitignore` to exclude `.DS_Store`, `.venv/`, `__pycache__/`, build artifacts.
- Staged and committed 62 files across Class Pet, Pixel Cat, and Writing Analyzer projects (commit 71868cf).
- Left `class-grouper` out of the commit because it contains its own embedded `.git` directory.

**Decisions:**
- Excluded `.venv` (Writing Analyzer virtual environment) from commit — too large and not source code.
- Did not add `class-grouper` as a submodule; flagged it to the user to decide.

---

**Asked:** Create a sound effect button page with a scary tolling bell and realistic thunder.

**Did:**
- Created `sound-effects.html` using Web Audio API synthesis (no audio files).
- Bell: additive synthesis with 9 inharmonic church-bell partials (hum through upper partials), clapper transient click, convolution reverb tail. Fundamental ~82 Hz.
- Thunder: 4 layers -- white noise crack with sweeping bandpass, pink noise rumble with lowpass, sub-bass sine sweep (80→28 Hz), delayed secondary crack echo. DynamicsCompressor at output on both sounds.
- Dark atmospheric UI with two glowing circular buttons (amber bell, blue thunder), ripple animation on trigger.
- Added `sound-effects` entry to `.claude/launch.json` for preview server on port 3457.

---

**Date:** 2026-06-03

**Asked:** Restore BotC launch button in Class Grouper UI.

**Did:**
- Added 🩸 button to the CG teacher screen header (index.html line ~1424) that opens `/botc.html` in a new tab.
- Button sits between the dark mode toggle and the phone URL button.


---

**Date:** 2026-06-03

**Asked:** Better space out BotC seating chart desks.

**Did:**
- Rewrote `_genBotcArcPositions` and `autoPositionPlayers` in botc.html.
- Single ring (n≤12): radius = min(250, max(180, 95*(n-1)/spanRad)) — guarantees 95px spacing between 90px circles.
- Two rings (n>12): 8 inner at r=155 (~104px spacing), remainder outer at r=250; 95px gap between rings prevents inter-ring overlap.
- Previous split was inner=min(n,12)/outer=remainder; changed to inner=8/outer=rest for two-ring case.


---

**Date:** 2026-06-03

**Asked:** Apply new arc spacing blanket to both editing and game views; keep unassigned desks visible.

**Did:**
- Rewrote renderGrimoire to always recompute arc positions via _genBotcArcPositions and sync player x/y to them on every render (non-edit mode). New spacing applies immediately everywhere with no button click.
- Renders ghost circles (dashed border, 35% opacity) for all arc positions before player cards, so empty slots are always visible.
- Edit mode (_grimEditMode) bypasses arc sync so drag positions are preserved during manual rearranging.


---

**Date:** 2026-06-03

**Asked:** Fix broken push-to-screen buttons from BotC; fix arc spacing blanket-applying.

**Did:**
- Re-implemented Phase 4 BotC student screen integration in index.html (was wiped by earlier git checkout index.html):
  - Added #pw-botc-overlay div + CSS to student screen
  - Added pwBotcShow(content, isDawn), pwBotcNight(), pwBotcHide() functions
  - Added botc-display, botc-dawn, botc-clear, botc-hide cases to _routeEvent switch
- Fixed arc spacing: changes now applied to the REAL renderGrimoire (second definition, lines ~1773), not the dead-code first one. Ghost circles + dynamic position sync now in the correct place.
- Deleted the dead-code duplicate renderGrimoire (first definition that was overridden).


---

**Date:** 2026-06-03

**Asked:** Use more bottom/right space in BotC grimoire, increase circle spacing.

**Did:**
- Changed arc from 45°→315° (270° sweep, cx=330) to 20°→340° (320° sweep, cx=360).
- Fixed r=250 for single ring instead of dynamic min formula.
- n=12: spacing goes from 95px to 127px (37px gap between 90px circles). Right extent: x=595 vs old x=487 — uses 128px more of the right side.
- Two-ring case: inner r=145, outer r=250 (105px ring gap).


## 2026-06-04

**Asked:** Extract all seating-related code from index.html across 10 specific line ranges.

**Done:** Read and returned verbatim code for all 10 sections:
1. CSS lines 380–470 (seat-desk, seat-fixture, pool, pref, conflict, corridor, fixture resize/rotate styles)
2. Layout generation functions lines 1464–1640 (_baseLayout, _defaultLayout, _clampLayout, _genSemiLayout, _genGridLayout, _genPerimeterLayout, _applyShapeScale, _genCircleLayout, _genClusterLayout, getLayout, _activeLayout, resetClassLayout)
3. computeSeats / computeAdjacency / findStudentSeat lines 1899–1960; scoreSeatingArrangement lines 2065–2100
4. _scaleSeatingCanvas + renderContent seating hook lines 2364–2390
5. viewSeating() lines 2741–2933
6. handleSeatClick, handlePoolClick, autoAssignSeats, clearSeating lines 4117–4218
7. Desk drag (startDeskDrag, touch, move, applyDeskPos, end, rotation drag, toggleBlockSeat) lines 4223–4370
8. Fixture/layout functions (_corridorLinesHtml, _fixturesHtml, addFixture, removeFixture, rotateFixture, startFixtureDrag, _fixDragMove/End, selectFixture, startFixtureRotateDrag, startFixtureResize, addDesk, removeLastDesk, toggleGridSnap, openLayoutPreset, switchSetupTab, _updateRoomPreview, switchPresetTab, applyExamLayout) lines 4391–4690
9. applyLayoutPreset lines 4788–4853
10. updateStudentSeatPref lines 4056–4059

**No files modified.** Read-only extraction task.

---

## 2026-06-10

**Asked:** Assess class-grouper v1 vs v2, improve workflow, kill bugs, maximise limited usage. Full go-ahead.

**Did (all in class-grouper repo, 7 commits):** committed ~1500 lines of at-risk uncommitted work including untracked cg-timer.js and v1 botc.html + mp3s; split the 1751-line SESSION_NOTES into a v1 archive and a ~400-line rolling v2 log; rewrote class-grouper/CLAUDE.md with batch-session protocol, self-verification and commit-freely policy; built v2/check.html smoke page (16/16 passing live); updated global ~/.claude/CLAUDE.md with the same workflow rules for all future projects.

**Decisions:** commits are checkpoints, user confirmation gates DONE status not commits; session notes capped at ~400 lines everywhere with archive files never loaded into context.

---

## 2026-06-10 (later)

**Asked:** Create a global instruction guide to feed to free/local AI models so their draft code integrates cleanly into Claude Code for cleanup, to stretch usage.

**Did:** Wrote AI_HANDOFF_GUIDE.md at repo root. Core ideas: draft AI is explicitly the first-pass worker, greppable uncertainty markers (TODO/UNSURE/STUB/ASSUME with `(handoff)` tag), mandatory HANDOFF.md notes, no invented APIs, loud errors, complete files not fragments, boring flat code, Python and vanilla-JS style rules matching existing projects.

**Decisions:** guide optimised for weak models — over-marking uncertainty encouraged, honesty over completeness as rule #1.
