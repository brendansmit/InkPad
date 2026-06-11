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

## 2026-06-11 — App Master Prompt template

**Asked:** A reusable master prompt for starting vibe-coded apps with one prompt, ending with clarifying questions, that helps shape ideas since project clarity is hard.

**Did:** Wrote APP_MASTER_PROMPT.md at repo root. User only fills a messy brain dump plus a short context checklist; the AI does the shaping: pitch the idea back, name the core loop, cut features into V1/V2/Someday tiers, make unstated decisions with defaults, flag risks, then ask 5 importance-ordered concrete clarifying questions and stop before any code.

**Decisions:** Clarifying questions must offer options/examples (open-ended "what do you envision" questions are hard for user). Companion to AI_HANDOFF_GUIDE.md — this covers what to build, that covers how to code.

**Follow-up:** Changed fixed 5 questions to adaptive 3-7 (no padding) plus one optional follow-up round of 1-3 questions. Renamed file to APP_MASTER_PROMPT.txt per user request.

---

## 2026-06-11 — BotC port first half: shell, state, grimoire, setup, night

**Asked:** BotC port items 4-9. Mapped v1 botc.html (3408 lines) to module split first, estimated usage, chose first half (state + grimoire + night) then check usage.

**Did:**
1. **Mapped v1 botc.html** to seven v2 modules with line ranges; setup wizard pulled into this half because the shell cannot create or verify games without it.
2. **botc-state.js:** roles/setup tables/scripts, game state, 40-deep undo, multi-game stored in the botcGames slice of maestro_v2 so cross-device sync comes free from State.save. Win conditions, Scarlet Woman, export/import. Old botc_games localStorage NOT migrated (v1 student ids differ from v2).
3. **botc-grimoire.js:** render, seat-assign mode, desk drag/delete writing to Maestro.State layouts. Recurring spacing bug fixed properly: ring split computed from chord geometry, min card distance 92px verified at 18 and 24 players (cards are 90px).
4. **botc-setup.js:** wizard steps 0-4 + seat assignment + game flow (new/load/resume, begin nights). UI.modal replaces confirm().
5. **botc-night.js:** full night flow, 13 role step cards, Empath/Chef/FT/Bar Owner calcs, override panel, imp self-kill, end night. Student screen push via Sync events to the existing cg-display BotC relay.
6. **v2/botc.html:** v1 gothic visuals, delegated events (no inline handlers), shell router Maestro.Botc, day/log tabs placeholder until botc-day.js.

**Verified in preview:** full wizard run with EAP 1 (12 players, correct 7/2/2/1 breakdown), night 1 walk-through of all step cards, poison icon on grimoire, imp kill applied at dawn, undo day→night, reload + resume from saved game, zero console errors. Test game deleted from state afterwards. Screenshot capture glitched again (known preview issue) — DOM checks used instead.

**Commit:** 7019cf6.

**Next:** second half — botc-day.js (day flow + nominations + log tab), botc-remote.js, botc-sfx.js. Then cutover prep. Day/log tab placeholders and Sounds button absence are expected until then.

---

## 2026-06-11 — picker fix list, stopped at usage limit

**Asked:** 16-item picker fix list (typed up), lightest first. Clarified: mini leaderboard = teacher-side toggle panel; soundboard issue = audible loop seam; numbers stays on remote; timer gets end animation + v1 sounds; randomizer animation covers names and numbers.

**Committed:**
- c89e87a trivial batch: UI.modal resolver bug (broke ALL multi-button modals and prompts — was the reported reset-all bug), alphabetical points, numbers button off sidebar, copy phone URL with clipboard fallback, soundboard PLAYING state, bigger timer input.
- 8248d57 light-medium: v1 point jingles on audio.js, collapsed timer pill now draggable (_applyPos ignored _pos when collapsed), settings default timer as MM:SS, loop seam fixed via loopStart/loopEnd trim (ambient-drone.mp3 carries 0.5s head + 3.2s tail silence).
- WIP commit pass 3 (NOT verified): leaderboard auto-fit row sizing, student timer size/warn/pulse + v1 tick and chime sounds in cg-display.

**Remaining (task list):**
- Pass 3 unverified: the WIP commit needs preview verification. Then: randomizer spin animation for student screen names AND numbers (v1 reference: index.html ~5520-5612 runPicker cycling/landed/burst pattern, pw-name cycling classes ~768; v1 broadcasts 'pick-start' so both screens animate together — v2 currently only sends final picker-result), teacher mini leaderboard toggle panel.
- Pass 4: full students tab port from v1 (cg-students.js PARKED, may partially reuse), groups options popup → permanent right-side toggle panel.
- User to test on real hardware: phone URL copy button, loop seam by ear, point/timer sounds, leaderboard with the real 22-student class.
- BotC second half still parked: botc-day.js, botc-remote.js, botc-sfx.js.

**Notes:** killed user's standalone server.js to run preview on 3456 (restart with maestro.command). Preview screenshots still glitch; DOM checks used.

---

## 2026-06-11 — picker list finished (efficient close-out)

**Asked:** finish remaining picker items as efficiently as possible.

**Did (commits 968539d verified + c0f6c09):**
- Verified pass 3 WIP: leaderboard auto-fit (34px rows, all fit, no scroll), student timer 56px with amber warn / red pulse + v1 ticks and alarm.
- Randomizer spin on student screen for names and numbers: picker-result now carries the name pool, number-result carries min/max (teacher picker + remote senders), cg-display runs the v1 interval curve with dim cycling and a landing pop.
- Students tab: parked cg-students.js wired into shell (tab button, panel, init, class-change notify). Marked DONE in FEATURES.
- Groups: options popup deleted, permanent right-side panel with toggle switches, auto-save on change.
- Teacher mini leaderboard: 🏆 sidebar button toggles fixed dark panel reusing Maestro.Leaderboard; falls back to teacher's active class.

**All verified in preview, zero console errors.** User still to test on real hardware: sounds by ear, phone URL copy, real 22-student class, classroom projector look.

**Remaining backlog:** BotC second half (botc-day, botc-remote, botc-sfx) then cutover. Killed standalone server again for preview; relaunch maestro.command.

---

## 2026-06-11 — spin timing fix

**Asked:** student screen spin started only after the teacher spin finished; must be simultaneous.

**Did (784a082):** picker-result/number-result now broadcast at spin START (winner pre-chosen, v1 pick-start pattern) carrying a duration; cg-display scales its interval curve to land at the same moment. Durations: teacher names 1400ms, teacher numbers 600ms, remote names 900ms, remote numbers 600ms. Manual re-push lands instantly. Verified by node --check only — user's own server was running so no preview; user to confirm by eye (both screens should land together).

---

## 2026-06-11 — spin sync rework (exact replica)

**Asked:** previous fix shipped broken (student screen showed name instantly, no animation). Requirement: identical animation, exact same time.

**Root cause:** duration patch half-applied — display gated on ev.duration which _pushToScreen never sent. Lesson: the python-patch asserts passed on the wrong file region; verify event payloads end to end, not just sender or receiver alone.

**Did (commit on main):** frames protocol — sender builds the full frame list and broadcasts frames/frameMs/startAt before starting its own spin; both screens play the same timeline; display re-bases if event is late or clocks differ by >250ms. Verified frame order + landing in preview; timing clamped there (background tab), user to confirm by eye. User's server killed again for verification — relaunch maestro.command.

---

## 2026-06-11 — seating diagnosis + handoff to Sonnet

**Asked:** assess why the seating chart ported badly, then hand off execution to a cheaper model.

**Findings:** (1) canvas fits to width only and its column gets squeezed — measured 112x75px live, desks 7px; (2) relationship vocabulary mismatch — Students tab writes good/bad, seating scorer reads v1's enemy/works-well, so auto-assign silently ignores conflicts; (3) genPerimeter never ported despite FEATURES claiming it; (4) no push-to-student-screen seating view; (5) polish: seat-pref quick edit, wheel zoom.

**Handoff:** full execution plan with file/line refs, verification steps and known traps written to v2/SEATING_REBUILD_PLAN.md. Sonnet to execute items 1-5 in order, commit per item. The plan itself is the go-ahead.

---

## 2026-06-11 — seating rebuild execution (Sonnet, 5 commits)

**Asked:** execute SEATING_REBUILD_PLAN.md items 1-5 in order.

**Did (commits c8294bb → 3de4265):**

1. **Canvas layout** (c8294bb): height chain — `#tab-seating.active` becomes `display:flex;flex-direction:column;height:100%`, `.seating-wrap` and `.seating-main` get flex+min-height:0, `.seat-canvas-outer` gets `flex:1` centering. `_scaleCanvas` now uses `Math.min(availW/CW, availH/CH)`. Removed redundant `seat-canvas-scroll-wrap` nesting.

2. **Relationship vocab** (1218475): conflict highlight changed from `enemy` to `bad`; `_scoreSeating` now scores `bad -500, romantic -300, complicated -200, good +30`; deleted dead v1 branches. state.js line-25 doc comment updated to the four real types.

3. **Perimeter generator** (a542fcc): `genPerimeter(type, desksPerSide, spacing)` added to `shared/seating.js` and exported. Perimeter tab (U-shape / Boardroom, desks-per-side, spacing) added to the preset modal and wired in `_applyPreset`. Verified: 18 desks in U-shape at default settings.

4. **Push to student screen** (bb995f3): `📺 Show on screen` toolbar button sends a `seating-show` Sync event with seat positions + first names. `cg-display.js` new `_showSeating()` renders a scaled read-only chart in `pw-label` using the same 660×440 space. `picker-clear` resets it via existing `_reset()`.

5. **Polish** (3de4265): scroll-wheel zoom (10% steps, updates slider+label), Fit button resets zoom to 1.0, right-click on occupied desk in assign mode cycles seatPref (any→front→back→any) with a toast.

**User to verify on real hardware:** seating chart appears on `/v2/?picker` when button is pressed; wheel zoom and Fit button feel; seat-pref right-click updates visible pref chips on desks; classroom projector look.

**Relaunch maestro.command** — preview tool killed the standalone server again.

## 2026-06-11

**Asked:** "go do 1" — build the BotC second half: botc-day.js, botc-sfx.js, botc-remote.js.

**Did:**

- **botc-day.js** (`Maestro.BotcDay`): Day tab renders Dawn card (imp_kill victims from nightLog), Nominations card (add/pass/fail/delete/execute with Saint special-case), Slayer card, Begin Night button, and win/SW-pending states. Log tab shows execution history table and night log grouped by night. All actions delegated from ctrl-content click listener.

- **botc-sfx.js** (`Maestro.BotcSfx`): Floating 🔊 button (fixed bottom-right), slide-up panel with 14-sound 4-column grid, Stop All button. Polls Audio.isPlaying every 600ms to sync button state. Handles incoming `botc-sfx` Sync events (including `__stop_all__`) so remote can trigger sounds on main page.

- **botc-remote.js** (`Maestro.BotcRemote`): Full-page UI at `botc.html?remote`. Tabs: Sounds (14 big tap targets sending `botc-sfx` Sync events), Players (alive/dead cards, tap to toggle via `BotcState.save`), Screen (6 presets + custom text sending `botc-display` Sync events + clear screen).

- **botc.html** updates: added `shared/audio.js` + three new script tags; removed `_placeholder`; `refresh()` now calls `BotcDay.render()`/`BotcDay.renderLog()`; `Sync.init` callback routes `botc-sfx` events to `BotcSfx.handleSyncEvent`; added `State.onChange` handler to re-sync grimoire when remote modifies state cross-device; `?remote` boot path calls `BotcRemote.init()` and returns early; `BotcDay.init()` and `BotcSfx.init()` added to boot.

**Verified:** Preview browser — Day tab renders correctly (dawn death, nominations, Slayer, Begin Night). SFX panel opens over Day content, 14 buttons visible. Log tab shows execution + night log tables. Remote at `?remote` loads with full-page dark UI, main app hidden, 14 large sound buttons. No console errors. Two commits: e6185c1 (code), 350c063 (FEATURES.md).

**Remaining BotC:** sync hardening (real phone WiFi test — user only), then cutover.
