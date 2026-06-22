# Session Notes

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
