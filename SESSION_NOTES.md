# Session Notes

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

## 2026-06-20 — Launcher wired up for speed dating

**Asked:** Wire up the InkHeron launcher button for speed dating so clicking it starts the app and opens the organiser console.

**Did:**
- Fixed `launcher/launcher_server.py`: NODE path `/usr/local/bin/node` (Node 16) → `/Users/brendansmit/.nvm/versions/node/v20.20.2/bin/node` (Node 20). Speed dating now opens `http://localhost:3464/public/organiser.html` instead of root.
- Fixed `launcher/launcher.html`: Speed Dating card description updated from "Venue layout builder" → "Run a speed dating event".
- Archived SESSION_NOTES entries from 2026-06-02 to 2026-06-11 to SESSION_NOTES_ARCHIVE.md.

**Status:** App is ~90% complete. Only deployment remains (HK server setup, nginx, SSL, env vars, PM2).

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

## 2026-06-22 — Grade Importer: score conversion, section editor, roster cleanup

**Asked:** (1) Score conversion: state raw total + export max, convert on export. (2) Delete ID column from roster. (3) Clear placeholder text on Add Student inputs. (4) No way to add sections to existing assignment.

**Done (commits 2e1e782, 31f2a86):**
- Score Conversion card on assignment detail: Raw total + Export max inputs, live preview, saves on blur via PATCH. Export applies `round(score/total*export_max, 1)` — raw scores stay in DB.
- Section editor on assignment detail: pills with ✕ to remove, inline "Add section" input. Updates score table and CSV import dropdown live.
- Roster: removed ID column, cleared placeholder text on name inputs.
- DB: `score_total`, `export_max` columns on assignments (migration).
