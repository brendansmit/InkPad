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


---

## 2026-06-20 — Speed dating organiser console + venue builder polish

**Asked (multi-fix session):**
1. Language toggle: show one language at a time, don't show both at once
2. Fix dropdown underscores; fix hosting toggle; add setup wizard
3. Add venue editor (was missing); generate real QR codes; add big screen button
4. Fix topic push flow (organiser sends topic to phones)
5. Fix 9 missing server routes (organiser.html was calling endpoints that didn't exist)
6. Fix venue builder: ChatGPT built a custom overlay instead of plugging in src/app.js
7. QR code flashing every second (regenerated on each render() call)
8. QR not appearing on big screen (screen.html had placeholder text, not real QR)
9. Add back button in venue builder, duplicate layout feature, new room button
10. Fix layout preview in organiser to show actual table shapes

**Did:**
- `public/organiser.html`: added language toggle (CSS class swap, data fields untouched); fixed dropdown underscores; added hosting toggle; setup wizard flow; real QR via qrcodejs cached as data URL (`qrDataUrl`); big screen button; topic send to phones. Fixed `openVenueEditor()` to `window.open('/index.html', '_blank')` — uses the REAL venue builder, not a custom overlay.
- `server.js`: added 9 missing routes — `/organiser/events`, `/events/:id` (GET), topic/send, topic/translate-send, screen-state, timer, vote/start, vote/end, guest check-in (PATCH), guest delete (DELETE). Root `/` redirects to `/public/organiser.html`. 70/70 tests still pass.
- `public/screen.html`: loaded qrcodejs CDN, added `_qrCache` object, replaced placeholder `qrBox()` with real QR generator using eventId from URL param.
- `src/app.js`: added "← Organiser" button, "New room" button, "Duplicate layout" button in topbar/actions. Added `_newRoom()` and `_duplicateLayout()` functions. Wired all three click handlers.
- `public/organiser.html` layout preview: replaced generic `.table-dot` circles with `.lp-table` / `.lp-fixture` CSS using actual VL.TABLE_TYPES dimensions scaled to 170px preview width. Round/rect/booth shape variants. Table numbers shown.
- `events.db`: test organiser email corrected from 'Test' to 'test@test.com'.

**Key decisions:**
- Venue builder opens as `window.open('/index.html', '_blank')` — the existing 1257-line src/app.js editor already saves to `speed_dating_v1` localStorage, which organiser.html reads via `storedLayouts()`. No custom editor needed.
- QR caching: store data URL outside render state; subsequent renders use `<img src=qrDataUrl>` so the 1-second setInterval doesn't regenerate the QR.

**Commits:** 075d754, 33f70a6 (back button returns to correct wizard step), 6a9792c (day/night theme + DM Sans/Serif redesign)


---

## 2026-06-20 — Production deployment

**Asked:** Deploy the speed dating app to a DigitalOcean droplet.

**Did:**
- DNS: added A record `speeddating` → `167.172.71.219` in Porkbun (deleted wildcard CNAME first)
- GitHub: pushed speed-dating repo to github.com/brendansmit/speed-dating (private). SESSION_NOTES.md excluded from repo via .gitignore. SSH key generated on Mac and added to GitHub account.
- Server (Ubuntu 24.04, 1 vCPU / 1 GB, Singapore SGP1): Node 20 via nodesource, build-essential for better-sqlite3 compilation, PM2 for process management, nginx reverse proxy, Certbot SSL via Let's Encrypt.
- Deploy key generated on server, added to GitHub repo for cloning.
- App running at https://speeddating.inkheron.app via PM2, auto-restarts on reboot.
- Organiser account created: brendansmit1@gmail.com.
- SSL cert auto-renews via certbot systemd timer, expires 2026-09-18.

**To deploy updates:** `cd /var/www/speed-dating && git pull && pm2 restart speed-dating`

---

## 2026-06-20 — Server Dashboard

**Asked:** Build a local dashboard to manage the live server without touching the terminal.

**Did:** Built `launcher/deploy-dashboard/` — Flask server (port 5095) + HTML dashboard.
- **Deploy:** local git push then SSH git pull + npm install + pm2 restart
- **Logs:** SSH pm2 logs --lines 60 --nostream
- **Restart:** SSH pm2 restart speed-dating
- **Open SSH:** osascript opens Terminal.app with SSH session
- Status banner auto-refreshes every 30s showing uptime, memory, CPU, restart count
- Dark terminal output panel with green/red syntax colouring
- Added as card 06 (full-width row 3, forest green accent) in the launcher
- Commit: 4609df2


---

## 2026-06-20 — Missed functional bugs (user called it out)

**Asked:** Challenged dismissal of bugs — "half the shit the app is supposed to do isn't working."

**Bugs found on re-read:**

1. `server.js /topic/translate-send` — identical copy of `/topic/send`, zero translation. Fixed: now calls OpenRouter (DeepSeek) to translate English → Simplified Chinese when `zh` field is absent. Manual zh still takes precedence.
2. `organiser.html translateAndSend()` — sent only `{ zh }` with empty English field. Server broadcast `topic: ''`. Round.html guarded on `message.topic` being truthy → **phones never received Chinese topics**. Fixed: send both fields; show translated Chinese back in the UI.
3. `round.html topic_push handler` — `if (message.topic)` → changed to `if (message.topic || message.zh)` so Chinese-only pushes display.
4. `organiser.html setInterval` — re-rendered full DOM every second, wiping any in-progress text input. Fixed: skip render when an INPUT/TEXTAREA/SELECT has focus.

**Lesson:** Don't dismiss bugs without reading the calling code and the receiving code end-to-end.
56/56 tests pass. Deployed: commit 12edbce

---

## 2026-06-20 — BugSmash fixes

**Asked:** Fix bugs from BugSmash Standard scan (3-model, 42 findings).

**Triaged:** Most HIGH findings were false positives (already handled by existing guards). 6 real bugs fixed:

1. `server.js` — `generateId` was require()'d inside the seed route handler; moved to top-level import
2. `server.js` — `/advance`, `/rate`, `/extend`, `/end-round` had no `event.status === 'running'` guard; added 400 errors
3. `event-store.js` — `validateProfile` accepted age ≤ 0; now requires positive number
4. `event-store.js` — `advanceRound` incremented `currentRound` before bounds check; fixed order so mutation only happens on success
5. `event-store.js` — `endRound` never cleaned up `extendRequests[storeKey]`; added delete on round end
6. `scoring.js` + `ensemble.js` — `clampScore(NaN)` propagated NaN into compat scores; now returns 0

Test mock updated: `makeEvent()` accepts optional status; default store event is `'running'` since all advance/rate/extend tests assume a live round.
64/64 tests pass. Deployed: commit 534849e

---

## 2026-06-20 — Testing mode tab

**Asked:** Need a sandbox/testing mode so one real phone can test alongside fake users.

**Did:**
- `server.js`: `POST /events/:id/seed` (organiser-only) — injects 10 pre-built profiles (5F + 5M: Emma Chen, Sophie Liu, Lily Wang, Mia Zhang, Chloe Xu, Lucas Tan, Ethan Lin, Ryan Wu, Kevin Zhao, James Ho). Skips duplicate names safely. Broadcasts `participant_joined` for each so guest list updates live.
- `organiser.html`: Tab bar (Manage / Testing) at top of event view. Testing tab has Seed button, status line, and usage note. `currentTab` and `testSeedStatus` vars added.

**Deployed:** commit 96300c7

---

## 2026-06-20 — WebSocket reconnect loop fix

**Asked:** Phones show "reconnecting... waiting" continuously.

**Root causes:**
1. nginx `proxy_read_timeout` defaults to 60s — idle WebSocket connections were killed every minute, causing the 1.2s reconnect loop to restart every ~60s
2. No client-side keepalive ping, so connections always appeared idle to nginx
3. Server sends `{ type: 'error' }` when event ID is unknown (stale localStorage), then closes socket — client looped forever instead of stopping

**Did:**
- `round.html`: send a ping message every 25s to keep connection alive through nginx
- `round.html`: set `stopReconnect = true` when server sends a fatal error — stops infinite loop from stale event IDs
- nginx live server: added `proxy_read_timeout 3600s; proxy_send_timeout 3600s;` via SSH, reloaded nginx
- Deployed: commit aadd905 live on speeddating.inkheron.app

---

## 2026-06-20 — Round-start bug fix

**Asked:** "Nothing happens on phone screens when a round is started."

**Root cause:** `round.html` read `eventId` from the URL `?e=` param but never fell back to `localStorage`. Any guest who navigated to `round.html` without the query string had `eventId = ''`, so `connect()` exited immediately and the WebSocket was never opened. Phones showed the waiting screen forever with no connection.

**Did:**
- `public/round.html`: Read `stored` from localStorage first, then set `eventId = URL param || stored.eventId || ''`. Guests now connect even without `?e=` in the URL.
- `server.js /advance`: Enrich pairs with `fName/mName/fPhoto/mPhoto` (partner names/photos visible on phone), add `startedAt` and `endTimestamp` so phones get a real countdown.
- `event-store.js startEvent`: Store `event.roundLengthMinutes` so `/advance` can compute `endTimestamp` independently.
- `public/round.html`: Vibrate `[200, 100, 200]` on round start when a pair is found.

**All 42 tests still pass.** Commit: f094245

---

## 2026-06-20 — Organiser visual redesign

**Asked:** Redesign the organiser dashboard — too purple/saturated, cheapens the look. Match the launcher's aesthetic with day and night modes.

**Did:**
- Replaced `:root` with two CSS themes: `html[data-theme="light"]` (warm cream `#f2ede4` palette, matches launcher) and `html[data-theme="dark"]` (warm near-black `#0f0d0a`, no purple at all)
- All hardcoded hex values replaced with CSS variables: `--deep`, `--inset`, `--track`, `--table-bg`, `--booth-bg`, `--overlay`, `--grid-line`, `--fixture-*`
- DM Serif Display on brand name, panel headings, wizard titles, stat numbers; DM Sans replacing Arial throughout
- Reduced `font-weight: 900` to 500 across the board for DM Sans compatibility
- Sun/moon toggle button in topbar — persists to `localStorage` as `sd_theme`, defaults to light
- Accent rose gold slightly darkened for light mode (`#c4705e`) to maintain contrast on cream; dark mode keeps original `#d38e7c`

## 2026-06-20 — BugSmash sweep 3

Asked: do a 3rd sweep of bugs dismissed in sweeps 1 and 2, fix the technically valid ones.

Audited the full BugSmash report again from scratch. Found 5 genuine bugs:

1. **event-store.js roundLengthMinutes** — negative values (e.g. -3) passed the `|| 5` falsy check and were stored. Fixed with `Number.isFinite(rl) && rl > 0` guard.
2. **organiser.html advanceRound** — used stale `currentEvent.currentRound` (set at page load, never refreshed). Second advance computed `0+1=1` instead of `1+1=2`. Fixed: track `round.current` locally and keep `currentEvent.currentRound` in sync after each advance.
3. **join.html interests step** — `renderInterests.query` persisted on the function object between visits, stale search text reappeared. Fixed: clear it in `next()` when leaving step 2.
4. **screen.html rAF** — `requestAnimationFrame(animate)` ran at 60fps unconditionally, doing DOM reads/writes even on fully static screens. Fixed: drop to `setTimeout(animate, 1000)` when `state.endTimestamp` is absent or past; rAF resumes automatically on next tick when a timer is set.
5. **package.json** — jest was in prod `dependencies` (tests use node:test built-in). Moved to `devDependencies` to keep prod installs lean.

Commit: 66e12f1. Confirmed pre-existing DB test failures (6) unchanged. Not deployed yet.

---


## 2026-06-26 — Server recovery after SSH lockout

**Asked:** Sites down, server unreachable via SSH ("Permission denied publickey").

**What happened:** Caddy was installed by Kimi/Cline while building the InkHeron app. Caddy took over ports 80/443, blocking nginx, which took down all 3 sites. The droplet was also missing the authorized_keys file (likely lost during a power cycle 6 hours prior).

**Did:**
- Diagnosed SSH lockout via DigitalOcean recovery console
- Edited `/etc/ssh/sshd_config.d/99-inkheron-hardening.conf` to allow PermitRootLogin and PasswordAuthentication temporarily
- Restored SSH access by fetching the public key from GitHub: `wget -O authorized_keys https://github.com/brendansmit.keys` (run from `~/.ssh/`)
- Found nginx was stopped and failing to start because Caddy (PID 763) was holding port 80
- Stopped and disabled Caddy, started nginx — all 3 sites came back up
- Ran `pm2 save && systemctl enable nginx` to persist across reboots
- Updated `InkHeron-Platform/CLAUDE.md` with a warning: before starting Caddy, nginx must be stopped/disabled and other app configs migrated, or use nginx for InkHeron instead

**Decisions:** GitHub SSH key fetch (`wget https://github.com/USERNAME.keys`) is the fastest way to restore authorized_keys when the console garbles paste input. Should be the first approach next time.

---

## 2026-06-25 — Grammar Arcade deployed to eap.inkheron.app

**Asked:** Deploy Grammar Arcade (Question Formation game for G12 EAP students) to the DigitalOcean server.

**Did:**
- Extracted 42 student English names from school XLS export, wrote `studentRoster.local.json` (3 classes: EAP1/EAP2/EAP3). Two name collision pairs require full names at login: Liam Li/Liam Lin and Yoyo Sheng/Yoyo Wang.
- Upgraded server Node 20 → 22.23.1 via NodeSource apt (node:sqlite requires v22.5+).
- rsynced `Gramm-Builder/` to `/var/www/grammar-arcade/`, installed pnpm + workspace deps.
- Started with PM2 via ecosystem.config.cjs (tsx entry: `artifacts/grammar-case-lab/node_modules/tsx/dist/cli.mjs`, port 3465).
- Configured nginx + Let's Encrypt SSL for `eap.inkheron.app`.
- Live at https://eap.inkheron.app — health endpoint confirmed.
- TEACHER_DASHBOARD_PASSWORD not yet set (teacher routes return 503 until added).
- Added to launcher Servers panel (launcher.html) and server dashboard switcher (dashboard.html + deploy_server.py).
- Added Test user (password gate: "Testing12345") to studentRoster.local.json and StudentLogin.tsx.
- Teacher dashboard at https://eap.inkheron.app/teacher — password set directly on server via ecosystem.config.cjs (not committed to git).

**Decisions:** Used tsx's JS entry point (`dist/cli.mjs`) directly rather than the shell wrapper, because PM2 tried to require() the shell script as a Node module.

---

## 2026-06-21 — Launcher server dashboard fix

**Asked:** Fix app launcher — server dashboard button does not open the server dashboard.

**Did:** The `launcher.html` already had a Server Dashboard card (card 06) calling `fetch('/launch/server-dashboard')`. The `launcher_server.py` already had the handler starting `deploy_server.py` on port 5095 and calling `_open('http://localhost:5095')` — all committed in `4609df2`. The issue was the process running on port 5099 was a stale version launched before that commit; it returned `{"error":"unknown app"}` for `server-dashboard`. Killed the old process (PID 77320) and restarted `launcher_server.py`. Endpoint now returns `{"ok":true}` and opens the dashboard. No code change needed; just a server restart.

---

## 2026-06-22 — BugSmash 6-feature upgrade

**Asked:** Make BugSmash significantly better at understanding cross-file architecture and finding real bugs rather than speculative ones. 6 improvements approved.

**Did:** Rewrote key sections of `bug-detector/index.html` (commit 0cee118):

1. **Phase 0 — Architecture analysis:** Before the main scan, DeepSeek V4 Flash reads the full codebase and returns a structured JSON summary (files, key flows, invariants, fragile cross-file areas). This prepended to every bug-finding prompt so models check intent vs implementation.
2. **Auto dependency graph:** `buildDepGraph()` parses `require()`/`import` statements with regex during bundle build (no API call). Dependency map injected into every prompt automatically.
3. **Flow tracing prompt:** Rewrote `buildPrompt()` — models now trace each endpoint/function from entry to exit, check cross-file contracts match, and are prohibited from reporting speculative risks without code evidence.
4. **Tighter evidence requirement:** Models must include an `"evidence"` field quoting the specific line(s) that prove the bug. Displayed in result cards. Filtered in copyOutput().
5. **Phase 2 cross-validation:** Single-model findings sent to DeepSeek Flash for false-positive check. Returns `confirmed: true/false`. Unconfirmed findings shown dimmed in a separate section.
6. **Visual confidence tiers:** Results split into four sections — "All models agree" (consensus), "Majority agreement", "Single model, verified", "Single model, unverified". Each has a colour-coded badge; consensus bugs get a heavier border.

**Phase status bar** added between the Run button and progress cards so user sees "Phase 0 / 1 / 2" as scan progresses.

---

## 2026-06-22 — BugSmash: sidebar nav + Scan / Trace / Compare panels

**Asked:** Add Hunt (sniffer), History, and Version checker. Better single-verb tab names.

**Did:**
- Full sidebar layout: file picker shared in sidebar, four panels (Scan, Trace, Compare, Settings)
- **Trace panel:** describe a symptom in plain text, DeepSeek Flash returns ranked suspects with file:line, evidence quote, and explanation. Single fast call (~$0.01).
- **Compare panel:** Scan history (up to N entries, configurable) saved to localStorage after every scan. Expandable list. Auto version diff: Fixed / Still present / New sections comparing two most recent scans.
- **Settings panel:** API key, history limit (5–50), model update checker — moved from header.
- Tab names chosen: Scan / Trace / Compare (over Smash/Hunt/Fix and Sweep/Hunt/Compare).
- Commits: 6a313d0 (sidebar + panels), 14ba2e3 (rename).

---

## 2026-06-22 - Model-router scaffolder opinion

**Asked:** Review a pasted conversation about building an OpenRouter-based generate-review-fix scaffolder and give an opinion on whether the idea helps.

**Did:** Read the 111-line pasted text and assessed the proposal as a time-buying workflow, not a true cost-saving or quality-guaranteeing system.

---

## 2026-06-22 - Claude window frustration

**Asked:** Expressed frustration with repeatedly hitting Claude's 5-hour usage window while still getting poor build quality.

**Did:** Reframed the problem as needing shorter feedback loops, hard verification and smaller checkpointed builds rather than simply more model generation.

---

## 2026-06-22 - Clarifying router goal

**Asked:** Whether I understand the goal behind the proposed model-router workflow.

**Did:** Confirmed the goal is to reduce wasted Claude-window time, improve build quality through enforced verification and use API/model routing as a support system rather than as blind generation.

---

## 2026-06-22 - Cheap-model build pipeline strategy

**Asked:** How to balance powerful cheap Chinese models with Claude/Codex refinement to get a polished project without burning money, targeting roughly $2-$4 for a 60%-70% draft.

**Did:** Checked current OpenRouter pricing for DeepSeek, Qwen, Kimi and Claude Sonnet, then recommended a cheap-first pipeline where Chinese models generate, review and repair the bulk while Claude/Codex is reserved for final architecture, integration and polish.

---

## 2026-06-22 - Subscription-only premium models

**Asked:** Clarified that Claude and ChatGPT APIs should not be used because existing subscriptions already cover those premium models.

**Did:** Adjusted the pipeline economics: OpenRouter/API spend should be limited to cheap bulk generation and review, while Claude/ChatGPT subscription windows handle supervised refinement and final polish.

---

## 2026-06-22 - Final cheap prebuilder workflow

**Asked:** Clarified the intended workflow: use subscription Claude/ChatGPT/Codex to create the build plan and tech stack, paste that into a cheap-model builder, then bring the result back to Codex or Claude for installs, fixes, verification and shipping.

**Did:** Confirmed the right tool shape is a cheap off-window prebuilder, not a premium API router. The prebuilder should generate a structured draft and handoff package for subscription-based finishing.

---

## 2026-06-22 - Prebuilder value rating

**Asked:** With the refined workflow in mind, how worth it is building the cheap-model prebuilder on a 1-10 scale.

**Did:** Rated a small budget-capped prebuilder as worthwhile, while warning that a large autonomous router would be lower value and more likely to become expensive distraction.

---

## 2026-06-22 - Best bang-for-buck coder model

**Asked:** Which OpenRouter coder model offers the best value, mentioning Kimi K2 and DeepSeek.

**Did:** Compared current OpenRouter pricing for Kimi K2/K2.7 Code, DeepSeek V4 Pro/Flash/V3.2 and Qwen3 Coder variants. Recommended DeepSeek V4 Pro as the default bang-for-buck generator, DeepSeek V4 Flash as reviewer and Kimi only for selective polish or hard frontend/code tasks.

---

## 2026-06-22 - Chinese vs western model ranking

**Asked:** Rank Chinese coding models compared with western models, then rank them by bang for buck.

**Did:** Used Artificial Analysis leaderboard context plus live OpenRouter model pricing. Separated raw capability from value for the planned cheap prebuilder workflow.

---

## 2026-06-22 - Cross-family review requirement

**Asked:** Avoid having the same model family review its own generated code.

**Did:** Confirmed the prebuilder should enforce cross-family review, for example DeepSeek-generated code reviewed by Qwen or Kimi, and Qwen-generated code reviewed by DeepSeek or Kimi.

---

## 2026-06-22 - Model Router Coder build checkpoint 1

**Asked:** Build the cheap-model prebuilder after approving the plan.

**Did:** Started `model-router-coder/` as a dependency-free Node web app with README, `.env.example`, static UI, health endpoint and OpenRouter model metadata endpoint.

---

## 2026-06-22 - Model Router Coder build checkpoint 2

**Asked:** Continue building the prebuilder in small committed checkpoints.

**Did:** Added the execution core: structured JSON build plans, task normalization, dependency batching, cost estimation, OpenRouter chat completion helper and a parallel generation runner with dependency context injection.

---

## 2026-06-22 - Model Router Coder build checkpoint 3

**Asked:** Add the generate-review-fix loop while preventing same-family model review.

**Did:** Added model-family detection, cross-family reviewer selection, review JSON parsing and a generate-review-repair executor. Same-family reviewer choices are automatically replaced with a different family.

---

## 2026-06-22 - Model Router Coder build checkpoint 4

**Asked:** Add output handling for generated projects.

**Did:** Added safe output writing, Markdown fence cleanup, handoff report generation, build log summarization and a dependency-free zip writer for packaging generated drafts.

---

## 2026-06-22 - Model Router Coder build checkpoint 5

**Asked:** Add server-side build workflow with cost control and live logs.

**Did:** Added dry-run estimates, budget-cap enforcement, background build jobs, SSE event streams and zip download endpoint. Updated README with the supported structured plan format.

---

## 2026-06-22 - Model Router Coder build checkpoint 6

**Asked:** Finish the usable prebuilder interface.

**Did:** Added a practical frontend with sample JSON plan, budget input, dry-run button, build button, live SSE log display and zip download link. Updated README with UI capabilities.

---

## 2026-06-22 - Launcher: Model Router Coder

**Asked:** Add Model Router Coder to the app launcher.

**Did:** Added launcher entries for the web Flask launcher and the older Tkinter launcher. The web launcher starts `model-router-coder/server.js` on port 3470 and opens `http://127.0.0.1:3470`.

---

## 2026-06-22 - Launcher: truthful launch status

**Asked:** Fix Model Router Coder launcher saying it is open when it does not actually launch.

**Did:** Reproduced that Model Router Coder starts with the launcher Node path. Changed the web launcher to wait for server ports and return launch errors, changed the frontend to display failures instead of always saying open and made the Tkinter launcher raise if Model Router Coder does not start.

---

## 2026-06-22 - Launcher unknown app and Model Router hardening

**Asked:** Fix the `unknown app` launcher bug and review the BugSmash debugger report.

**Did:** Verified the live launcher route for Model Router returns ok. Added launcher aliases for `bug-detector`, `debugger` and `model-router`. Hardened Model Router request parsing, budget validation, path validation and SSE client writes. Added tests for the real request-validation bugs while leaving false positives alone.

---

## 2026-06-22 - Model Router UX requirements

**Asked:** Clarify that Model Router Coder needs to accept a Claude build/tech-stack prompt and provide a place to enter an OpenRouter API key. Asked what dry run means versus build draft.

**Did:** Explained that the current JSON-only input is too rigid, that dry run estimates without spending while build draft spends API credits and writes output, and proposed adding a prompt-to-plan flow plus a local API key settings field.

---

## 2026-06-22 - Model Router prompt-first workflow

**Asked:** Implement the full prompt-first workflow with preselected models.

**Did:** Added a Claude Prompt input mode, OpenRouter API key field stored in localStorage, DeepSeek V4 Flash prompt-to-plan endpoint, review-depth and Kimi hard-file options, Advanced JSON mode and request-scoped API key handling for build jobs.

---

## 2026-06-22 - Model Router partial failure handling

**Asked:** Fix builds failing when OpenRouter returns no message content, and add something stronger than `HANDOFF.md` because Codex may not read it.

**Did:** Added OpenRouter empty-content retries and clearer errors. Changed per-file review/repair failures into warnings so the build can package the last usable file. Added generated root `AGENTS.md` with required first steps and unresolved issues. Added tests and a no-network package simulation for repair failure preservation.

---

## 2026-06-22 - Model Router download recovery

**Asked:** Fix completed builds not being downloadable.

**Did:** Found completed zip files under `model-router-coder/runs/`. Added disk-backed latest-build and run-specific download endpoints so downloads survive missed SSE events or server restarts. Added a persistent "Download latest" UI link and quieter SSE close handling.

---

## 2026-06-22 - Model Router prompt vs output diagnosis

**Asked:** Compare the AP Lang Reference Dashboard prompt against the downloaded Model Router output.

**Did:** Found the output did not use the AP Lang prompt. The build-log shows it used the default "Example App" JSON plan, producing only package.json, server.js and public/index.html instead of the requested Express/SQLite/upload/admin/student app.

---

## 2026-06-22 - Model Router removed default sample plan

**Asked:** Remove the default placeholder/sample prompt after it caused the wrong app to build.

**Did:** Removed the prefilled prompt and prefilled Example App JSON. Added client-side guards so Dry Run and Build require a converted or manually pasted real plan. Added server-side rejection of the removed sample plan so it cannot be built even if the UI state fails.

---

## 2026-06-22 - Model Router dry-run failure

**Asked:** Troubleshoot `Error: Dry run failed` after converting a prompt into a six-task plan.

**Did:** Found dry run could hang/fail while fetching live OpenRouter model prices. Added fallback built-in model prices, a 3-second price-fetch timeout and better frontend error reporting. Verified a six-task AP Lang-shaped plan dry-runs successfully.

---

## 2026-06-22 - Model Router finished download state

**Asked:** Fix builds finishing without a usable current download link and add obvious text when finished.

**Did:** Added an active build status endpoint, active build download URLs in package-ready events, client-side status polling after done/SSE close and a visible "Build Finished" panel with "Download this build". Verified the live UI serves the new panel and latest zip download still returns a valid zip.

---

## 2026-06-22 — Grade Importer: score conversion, section editor, roster cleanup

**Asked:** (1) Score conversion: state raw total + export max, convert on export. (2) Delete ID column from roster. (3) Clear placeholder text on Add Student inputs. (4) No way to add sections to existing assignment.

**Done (commits 2e1e782, 31f2a86):**
- Score Conversion card on assignment detail: Raw total + Export max inputs, live preview, saves on blur via PATCH. Export applies `round(score/total*export_max, 1)` — raw scores stay in DB.
- Section editor on assignment detail: pills with ✕ to remove, inline "Add section" input. Updates score table and CSV import dropdown live.
- Roster: removed ID column, cleared placeholder text on name inputs.
- DB: `score_total`, `export_max` columns on assignments (migration).

---

## 2026-06-22 - Model Router single download button

**Asked:** Remove stale previous-build download behavior and make one download button fetch the build that just finished.

**Did:** Removed the controls download and latest-download buttons from the UI. The only remaining download button is in the finished panel and is set from the active job's package-ready event or active job status poll. Verified the served page has one download anchor and tests pass.

---

## 2026-06-22 - Model Router package-ready download bug

**Asked:** Fix finished builds showing `done` without revealing the download button.

**Did:** Fixed the event flow so the browser stays connected after generation `done` and waits for the job-level finish event. Fixed the server to send `package:ready` with the current job download URL attached. Added a regression test for the stream contract, restarted the live server and verified the served JS/page.

## 2026-06-23

**Asked:** Whether to build a multi-model code router vs just having Claude build apps directly.
**Discussion:** Worked through the real constraint (limited Claude Code window time, not quality or cost), and pivoted to building an off-clock OpenRouter scaffold tool with a generate-review-repair loop to stretch window time further. User pushed back correctly on Claude quality claims — cross-model review is the real quality lever.
**Built:** `prototype-coder/` — Node/Express web app using OpenRouter only. 4-step flow: test key, convert prompt to JSON task plan, dry-run cost estimate, run parallel build with generate-review-repair loop. Zip download of scaffolded project. 10/10 tests passing.
**Added to launcher:** Port 3471, card 07 in bento grid. Row 3 reshaped from 2 wide cards to 3 equal ones.
**Model fuzzy validation:** When connection is tested, `/api/openrouter/test` fetches the full OpenRouter model list and caches it in memory. Dry-run validates all model IDs in the plan against the cache using token-overlap fuzzy matching (threshold 0.4). Unknown IDs show amber warnings with suggested correction; no-match IDs show red errors. New files: `src/utils/modelFuzzy.js`, updated `src/openrouter.js`, `src/routes/openrouter.js`, `src/server.js`, `src/routes/plan.js`, `public/app.js`, `public/styles.css`. Committed d35578f.

---

## 2026-06-23 — BugSmash: context-aware fuzzy matching + per-model bundle trimming

**Asked:** Non-Claude models (DeepSeek, Gemini) keep failing — only Haiku works. Fix fuzzy matching and ensure each model gets a bundle sized to its actual context window.

**Did (commit 4e2485c in bug-detector/):**
- Added `MIN_CTX_TOKENS = 60000` constant and two helpers: `fmtCtx(n)` (formats as "128k ctx") and `maxCharsForCtx(ctxTokens)` (computes per-model char limit, capped at MAX_CHARS)
- Rewrote `findBestReplacement`: filters to same-provider candidates with context_length >= 60k tokens, scores by name-part overlap (2x weight) + substring prefix bonus + context-length tiebreaker, returns `contextLength` on the result
- Validation block now builds `modelCtxMap` from the fetched OpenRouter list; each effective model gets `contextLength` stored on it; progress cards show e.g. "queued · 128k ctx" or "→ corrected-id · 64k ctx"
- Phase 1: each model receives its own prompt built from `bundle.slice(0, maxCharsForCtx(m.contextLength))` rather than one shared prompt — prevents context-overflow failures on smaller models
- Fallback: same trimming applied using the fallback model's own context window

---

## 2026-06-23 — BugSmash: error visibility + prompt noise reduction

**Asked:** (1) Show WHY a model fails — current display is useless for debugging. (2) Too much noise in bug output; models report speculative issues not real breakages.

**Did (commit c14cc44):**
- Error cards now show the actual model ID used, full error message (no truncation), and HTTP status. console.error logs full OpenRouter response to DevTools.
- When a model responds but 0 bugs parse: shows first 120 chars of raw response so format failures are diagnosable vs genuine "no bugs".
- Timeout card now shows model ID.
- Prompt: added strict 4-point bug definition (wrong now / traceable trigger / observable failure / reachable entry point — all four required). Expanded disqualified list: null-check speculation, missing try-catch without crash path, race conditions without traced interleaving, any phrasing with "could/might/may/should/assuming". Three-question self-check required before including any finding. Cap dropped 12→8.

---

## 2026-06-23 — BugSmash: model ID fixes, context filter removal, parse fix

**Asked:** Screenshot showed Haiku "Load failed", Gemini "covered by Haiku" (also broken), Sonnet returning "0 bugs — raw: Looking at the code carefully..." (prose preamble killing JSON parse).

**Root causes identified:**
- `anthropic/claude-haiku-4.5` (dot) causes "Load failed" — correct format uses dashes
- `deepseek/deepseek-v4-*` and `google/gemini-2.5-*` (no -preview) don't exist on OpenRouter
- `findBestReplacement` hard-filtered on context_length >= 60k but OR often omits that field — all candidates eliminated, matcher returned null, wrong ID used anyway
- `parseModelResponse` searched forward — prose preamble contains stray brackets corrupting match

**Did (commit 77be9ac):**
- Fixed all model IDs: Anthropic use dashes (claude-haiku-4-5, claude-sonnet-4-6), DeepSeek → deepseek/deepseek-chat, Gemini → -preview variants, Qwen/Kimi updated
- Fallback for levels 2+3 changed to Sonnet 4.6 (confirmed working)
- findBestReplacement: removed hard context filter, context_length is scoring bonus only
- maxCharsForCtx: default when unknown raised 32k→128k tokens
- parseModelResponse: rewrote to search backwards from last [ — handles prose-before-JSON

---

## 2026-06-23 - BugSmash: OpenRouter live model IDs and non-stream scan calls

**Asked:** Debug BugSmash because only Claude models were loading and everything else failed.

**Did:**
- Fetched OpenRouter's live model list and found the previous ID fix had gone stale again. Current live IDs use dot notation for Claude 4.x and stable non-preview Gemini 2.5 IDs.
- Updated configured scan and fallback IDs to `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.5`, `google/gemini-2.5-flash` and `google/gemini-2.5-pro`.
- Changed the main scan call from SSE streaming to a normal chat completion with `max_tokens: 2500`, because the streaming client was brittle across non-Claude providers.
- Raised scan timeout from 90s to 180s for slower non-Claude responses.
- Verified all configured IDs exist in the live OpenRouter model list, parsed the embedded script with Node and smoke-tested the page through localhost. No app console errors.
- Archived 106 oldest active session-note lines into `SESSION_NOTES_ARCHIVE.md` to keep `SESSION_NOTES.md` under the cap.

---

## 2026-06-23 — BugSmash: fix JSON parse for code-fenced/prose responses

**Asked:** Screenshot showed all 3 models connecting but showing "0 bugs — raw: ```json [..." — DeepSeek/Gemini wrapping in code fences, Sonnet writing markdown prose.

**Did (commit 8fb8e7f):**
- Added system message to callModel: "Your entire response must be ONLY a valid JSON array — no prose, no markdown, no code fences, no explanations"
- parseModelResponse: tries extracting from markdown code fences first (```json...```), then falls back to backwards array search on raw content — handles both formats

---

## 2026-06-23 — BugSmash: Python port idea (pinned)

**Decision:** Port BugSmash to Python (Flask backend) when ready to build the brute-force/chaos testing mode. Python enables actual subprocess code execution, real stack traces, mypy/bandit/pylint passes, server-side OpenRouter calls, and no bundle size limits. Deferred — leaving HTML version as-is for now.

---

## 2026-06-23 — Grade Importer: % column not showing on existing assignments

**Asked:** % column not appearing even on assignments that already had `score_total` set (30.0 and 25.0 confirmed in DB).

**Root cause:** Flask caches Jinja2 templates in memory at startup. The Grade Importer server (PID 28307) was started before the `f913932` commit that added the % column feature. Every page load served the old cached template without `currentScoreTotal` references. No code bug — just a stale server process.

**Fix:** Killed PID 28307, restarted server. New PID 33871. Template now contains 6 `currentScoreTotal` references. % column confirmed present in served HTML.

**Note for future:** Any time HTML changes don't appear in the browser, restart the Flask server — it must be restarted to pick up template changes when `debug=False`.

---

## 2026-06-24 — AP Lang Reference Dashboard: deployed to production

**Asked:** Deploy the AP Lang dashboard to lang.inkheron.app on the existing DigitalOcean droplet (167.172.71.219).

**Did:**
- Changed port to 3002 to avoid conflict with speed-dating (port already on droplet).
- Pushed repo to `git@github.com:brendansmit/LangDashboard.git`.
- Added `lang` A record in DNS pointing to 167.172.71.219 (managed at Porkbun or DO).
- On server: cloned to `/var/www/ap-lang-dashboard`, `npm install`, created `.env`, started with PM2 as `ap-lang`, nginx reverse proxy config, certbot SSL.
- Live at https://lang.inkheron.app — admin at /admin.html.
- Deploy pattern: `git push` then on server `git pull && npm install && pm2 restart ap-lang`.

---

## 2026-06-24 — AP Lang Reference Dashboard: initial build

**Asked:** Build a full Node/Express/SQLite document library app for AP Lang students, with a password-protected admin panel. Retrieved complete design system from the prior AP Lang session.

**Did:**
- Created `ap-lang-dashboard/` with `server.js`, `package.json`, `.env`, `.gitignore`, `public/index.html`, `public/admin.html`.
- Server: Express + sqlite3 + multer + cookie-parser. `.html`-only uploads (20 MB cap) into `uploads/`. Cookie-based admin auth (`ADMIN_PASSWORD` env var). All 8 API routes implemented.
- Student view: white sidebar (212px), brand mark, nav, card grid (3→2→1 col responsive), inline iframe document viewer modal with back button and "open in tab" link.
- Admin view: login modal on load, Library table (toggle-hidden switch, rename, delete with confirm), Upload view (drag-drop zone + title field + progress bar + toasts).
- Full design system: CSS variables, Inter font, outlined/primary/danger buttons, cards with hover, toggle switch, filter bar, kebab-ready structure, modals, toasts, dropzone, empty states.
- Verified: server starts, `/api/docs` returns JSON, login works, uploaded test doc appeared as card, doc deleted cleanly. Committed 28f2a0b + .gitignore fix 858885f.

---
