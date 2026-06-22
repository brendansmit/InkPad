# Session Notes Archive

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
2. Layout generation functions lines 1464–1640
3. computeSeats / computeAdjacency / findStudentSeat lines 1899–1960; scoreSeatingArrangement lines 2065–2100
4. _scaleSeatingCanvas + renderContent seating hook lines 2364–2390
5. viewSeating() lines 2741–2933
6. handleSeatClick, handlePoolClick, autoAssignSeats, clearSeating lines 4117–4218
7. Desk drag lines 4223–4370
8. Fixture/layout functions lines 4391–4690
9. applyLayoutPreset lines 4788–4853
10. updateStudentSeatPref lines 4056–4059

**No files modified.** Read-only extraction task.

---

## 2026-06-10

**Asked:** Assess class-grouper v1 vs v2, improve workflow, kill bugs, maximise limited usage. Full go-ahead.

**Did (all in class-grouper repo, 7 commits):** committed ~1500 lines of at-risk uncommitted work; split the 1751-line SESSION_NOTES into a v1 archive and a ~400-line rolling v2 log; rewrote class-grouper/CLAUDE.md with batch-session protocol; built v2/check.html smoke page (16/16 passing live); updated global ~/.claude/CLAUDE.md with the same workflow rules for all future projects.

**Decisions:** commits are checkpoints, user confirmation gates DONE status not commits; session notes capped at ~400 lines everywhere with archive files never loaded into context.

---

## 2026-06-10 (later)

**Asked:** Create a global instruction guide to feed to free/local AI models so their draft code integrates cleanly into Claude Code for cleanup.

**Did:** Wrote AI_HANDOFF_GUIDE.md at repo root. Core ideas: draft AI is explicitly the first-pass worker, greppable uncertainty markers (TODO/UNSURE/STUB/ASSUME with `(handoff)` tag), mandatory HANDOFF.md notes, no invented APIs, loud errors, complete files not fragments.

---

## 2026-06-11 — App Master Prompt template

**Asked:** A reusable master prompt for starting vibe-coded apps with one prompt.

**Did:** Wrote APP_MASTER_PROMPT.txt at repo root. User fills a brain dump; AI shapes it: pitch idea back, name core loop, cut features V1/V2/Someday, make unstated decisions with defaults, flag risks, ask 3-7 clarifying questions. Renamed from .md to .txt per user request.

---

## 2026-06-11 — BotC port first half: shell, state, grimoire, setup, night

**Asked:** BotC port items 4-9.

**Did:** botc-state.js, botc-grimoire.js, botc-setup.js, botc-night.js, v2/botc.html. Commit 7019cf6. Verified: full wizard run with EAP 1, night 1 walk-through, undo, reload+resume.

---

## 2026-06-11 — picker fix list + spin timing + seating rebuild

**Done (multiple commits c89e87a → 3de4265):**
- UI.modal resolver bug, alphabetical points, numbers button off sidebar, copy phone URL, soundboard PLAYING state, bigger timer input.
- v1 point jingles, timer draggable when collapsed, loop seam fixed via loopStart/loopEnd trim.
- Leaderboard auto-fit, student timer 56px with amber warn/red pulse + v1 sounds.
- Randomizer spin on student screen (frames protocol — same timeline both screens).
- Students tab wired, Groups permanent right-side panel, teacher mini leaderboard 🏆.
- Canvas layout, relationship vocab (bad/good), perimeter generator, push-to-student-screen seating, wheel zoom.

---

## 2026-06-11 — BotC second half: day, sfx, remote

**Did (commits e6185c1, 350c063):** botc-day.js (Dawn, Nominations, Slayer, Begin Night, Log tab), botc-sfx.js (14-sound panel, loop chips), botc-remote.js (phone remote: Sounds, Players, Screen tabs). All verified in preview.

---

## 2026-06-11 (second session) — BotC grimoire on real seating layout

**Did (commits cfd1175, 2bd6677, f54425e):** botc-grimoire.js rebuilt to use real 660x440 seating geometry. Night flow footer: push button between Skip and Next. cg-display themed dark cards. botc-sfx per-sound loops. BotC remote link from Maestro sidebar. server.js PORT env override.

**Key fix:** Maestro shell 🩸 button was opening /botc.html (v1) not /v2/botc.html — fixed in v2/index.html.

---

## 2026-06-16

**Asked:** Review `cg-settings.js` and `cg-seating.js` for making the seating/layout system more usable and adaptable, especially for reuse in a speed dating app where venues change.

**Did:** Inspected the settings module, seating module and shared seating geometry helper. No app code changed. Conclusion: reusable core is `v2/shared/seating.js` + drag/fixture/editing interactions in `cg-seating.js`; classroom-specific state, labels, presets, teacher desk and assignment logic should be separated before reuse.

**Decision:** Recommend extracting a venue layout editor with a domain-neutral schema: venues contain rooms, rooms contain layout objects, layouts contain tables, seats, fixtures, zones and blocked seats. Speed dating sessions reference a venue layout by id and store round assignments separately.

---

## 2026-06-18 — BugSmash tool

**Asked:** Build a multi-model bug detection tool — drop a project folder, fire it at 3 models in parallel via OpenRouter, aggregate findings by model agreement.

**Did:** Built `bug-detector/index.html` — single self-contained HTML file, no server required.
- 3 scan levels (Quick/Standard/Nuclear) with escalating model quality; level persists in localStorage.
- Level 1: DeepSeek V4 Flash + Gemini 2.5 Flash + Claude Haiku 4.5 (~$0.05/scan)
- Level 2: DeepSeek V4 Pro + Gemini 2.5 Pro + Claude Sonnet 4.6 (~$0.30/scan)
- Level 3: DeepSeek V4 Pro + Gemini 2.5 Pro + Claude Opus 4.8 (~$0.93/scan)
- Folder drag-and-drop + file picker; skips node_modules, .git, dist, lock files, binaries, .env files.
- Parallel OpenRouter calls, JSON response parsing, aggregation by file+line proximity (±5 lines).
- Results sorted by model agreement count then severity; copy-to-clipboard plain text output.
- "Check model updates" button: fetches OpenRouter model list, asks AI to do cost-benefit analysis.
- OpenRouter API key stored in localStorage. Mint green accent (#3EB49A).

---

## 2026-06-18 — Grade Importer

**Asked:** Build a grade importer app. Takes class list XLS + CSV grade exports, matches student names, fills the XLS template, allows download. Needs history of past assignments.

**Did:** Built Flask web app in `grade-importer/` with SQLite backend.
- `database.py` — students, assignments, scores, xls_templates tables.
- `matcher.py` — 3-tier matching: exact English name → fuzzy (difflib, 82%) → Chinese name → DeepSeek API fallback.
- `csv_parser.py` — auto-detects name/score columns from CSV headers.
- `xls_writer.py` — reads XLS roster; fills XLS template with scores using xlrd + xlutils (preserves formatting).
- `app.py` — Flask routes for roster upload, assignment CRUD, CSV import, manual score entry, history matrix, XLS export.
- `templates/index.html` — single-page UI: Assignments / History / Roster tabs, drag-and-drop CSV/XLS.
- Class management, AP Lang roster, Settings tab (DeepSeek key), per-section score inputs, autosave.
- Template library, save-location picker (showSaveFilePicker), pinyin column via pypinyin.
- Section-targeted CSV import: Zipgrade CSV → specific section (MC), SRQ entered manually, total auto-sums.

**Running at http://localhost:5050.** Start with: `cd grade-importer && python3 app.py`

**Commits:** d6cf2b9, fd6b43f, 4d2f4dd, 2e1e782 (section editor on detail, roster cleanup).

---


---

## 2026-06-18–20 — Speed Dating app (multi-session build)

**Asked:** Build a bilingual (EN + Simplified Chinese) speed dating event app. Organiser runs from laptop, guests use phones. AI ensemble matching via OpenRouter (DeepSeek v3.2 + Qwen 3.6 flash + Kimi K2). WebSockets for real-time push. SQLite persistence. Organiser accounts with JWT auth. Minimal results page (mutual matches + like count only, no profile data).

**Architecture:** Three surfaces — phone browser, organiser console, big screen (projector/TV). Dual-mode: Online (hosted) vs Local (LAN).

**Theme:** Deep plum (#1C1734), surface (#271F44), rose gold accent (#D38E7C / text #E7B0A0).

**Built (all in speed-dating/):**
- `matching.js` — bipartite max-weight matching, buildRound, buildSchedule, assignTables. 10 tests pass.
- `scoring.js` — canonical scoring prompt, callOpenRouter, scorePeople, applyAgePenalty (k=2), strips markdown fences from model output. 9 tests pass.
- `ensemble.js` — MODELS = ['deepseek/deepseek-v3.2', 'qwen/qwen3.6-flash', 'moonshotai/kimi-k2'], scoreEnsemble parallel with Promise.allSettled, normalise-then-median. 5 tests pass.
- `event-store.js` — createEvent, addParticipant, scoreNewParticipant, startEvent, advanceRound, endRound, submitRating, requestExtend. 12 tests pass.
- `server.js` — Fastify HTTP + WebSocket on port 3464. All event routes require organiser JWT except guest-facing ones. Routes: POST /events, /join, /start, /advance, /rate, /extend, /end-round, /topic, /help, /wechat-request, /registration-close, /vote; GET /results, /vote, /ws, /organiser/me; POST /organiser/login, /organiser/logout.
- `db.js` — better-sqlite3, events + organisers tables.
- `auth.js` — hashPassword (bcrypt), checkPassword, generateId.
- `scripts/create-organiser.js` — CLI only way to create organiser accounts (no public signup).
- `public/join.html` — multi-step registration flow (welcome, basics, interests, personality, photo, consent, code display). Reads from data/copy.json and data/interests.json. Stores {eventId, code} in localStorage.
- `public/round.html` — round running + rating. WebSocket. States: waiting, round_start (partner/table/countdown/edge pulse), round_end/rating (traffic-light buttons + extend). Topic card + call organiser button.
- `public/results.html` — minimal: mutual matches + like count only. WeChat request flow. Language toggle.
- `public/screen.html` — big screen passive renderer. 6 states driven by WebSocket. Bell alert popup bottom-right. Countdown and edge pulse driven by server endTimestamp.
- `public/organiser.html` — login gate. Event list view + event control view. Guest list, round controls, topic panel, group vote panel, bell alerts. Integrates src/venue-layout.js for room layout.
- `data/copy.json` — all bilingual strings, EN + 简体, B1/B2, no idioms.
- `data/interests.json` — 131 items, 17 categories, each {id, en, zh}.
- `.env` (git-ignored): OPENROUTER_API_KEY, OPENROUTER_BASE_URL. NEVER commit. `.env.example` committed.
- `mockups/event-app-surfaces.html` — full phone flow mockup (10 screens) + projector states.

**All 70 tests passing.** Full smoke test passed: login → create event → join 2 guests → start → advance → rate both yes → end round → results shows 1 match → help ok.

**Key bugs fixed:**
- better-sqlite3 compiled for wrong Node version → `npm rebuild better-sqlite3` after every ChatGPT install.
- DeepSeek wraps output in ```json fences → fence-stripping in scoring.js.
- Node 16 on machine → installed Node 20 via nvm.
- GLM slow (30s) → replaced with moonshotai/kimi-k2 (3.4s).
- POST /advance rejected empty body → removed body schema requirement.

**Security:** OpenRouter API key lives ONLY in .env (git-ignored). events.db git-ignored. No public organiser signup.

---


---

## 2026-06-20 — Launcher wired up for speed dating

**Asked:** Wire up the InkHeron launcher button for speed dating so clicking it starts the app and opens the organiser console.

**Did:**
- Fixed `launcher/launcher_server.py`: NODE path `/usr/local/bin/node` (Node 16) → `/Users/brendansmit/.nvm/versions/node/v20.20.2/bin/node` (Node 20). Speed dating now opens `http://localhost:3464/public/organiser.html` instead of root.
- Fixed `launcher/launcher.html`: Speed Dating card description updated from "Venue layout builder" → "Run a speed dating event".
- Archived SESSION_NOTES entries from 2026-06-02 to 2026-06-11 to SESSION_NOTES_ARCHIVE.md.

**Status:** App is ~90% complete. Only deployment remains (HK server setup, nginx, SSL, env vars, PM2).

---

