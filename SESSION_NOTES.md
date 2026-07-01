# Session Notes

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

## 2026-06-24 — Server Dashboard: command runner + launcher cleanup

**Asked:** (1) Add a freeform SSH command runner to the server dashboard. (2) Remove cards 08 (Server Dashboard) and 09 (AP Lang Library) from the launcher bento grid — redundant now that both live in the Servers sidebar tab.

**Did:**
- `deploy_server.py`: added `/api/run` POST endpoint — takes `{cmd}` JSON body, runs via `ssh()`, returns output. Respects `?server=` param so it targets the currently selected server.
- `dashboard.html`: added "Run command on server" terminal input above the output panel — dark monospace input with green `$` prompt, Run button, Enter key support. Output goes to the shared output panel with colorise() applied.
- `launcher.html`: removed apps 08 and 09 from APPS array; grid CSS changed to 3 rows; cards 06/07 now span half the row each (symmetric); "9 tools" → "7 tools".

---

## 2026-06-24 — Server Dashboard: add AP Lang server

**Asked:** Add AP Lang Dashboard (lang.inkheron.app) to the server dashboard alongside the existing Speed Dating server, with the same four action cards.

**Did:**
- Refactored `launcher/deploy-dashboard/deploy_server.py` — added `SERVERS` dict with configs for both `speed-dating` and `ap-lang`. All API routes (`/api/status`, `/api/deploy`, `/api/logs`, `/api/restart`) now read a `?server=` query param to pick the right config (PM2 name, local repo path, remote path).
- Updated `dashboard.html` — added a "Speed Dating / AP Lang" toggle in the top-right header; JS `switchServer()` updates `currentServer` and appends `?server=<key>` to all API calls. Status URL and banner update dynamically on switch.
- Added `server-dashboard` entry to `.claude/launch.json` for preview tool access.
- Verified in preview: switcher renders, Speed Dating shows Online with live stats.

---

## 2026-06-24 — Launcher: sidebar tabs (Servers / Apps)

**Asked:** Restructure launcher sidebar into two tabs. "Servers" tab shows live server cards for lang.inkheron.app and speeddating.inkheron.app with quick-open links and ↺ Restart buttons. "Apps" tab holds the existing restart dropdown and tool count footer.

**Did:**
- Rewrote `launcher/launcher.html` sidebar — two tabs (Servers default, Apps).
- Servers panel: two `.server-card` components each with a green status dot, URL, named link buttons (↗ Open / ↗ Organiser / ↗ Library / ↗ Admin), and a ↺ Restart button calling `restartServer(appId)` → `POST /restart/<appId>`.
- Apps panel: existing restart dropdown + "9 tools" footer moved here.
- Bento grid and all 9 cards unchanged.
- Restart buttons for live servers reuse the existing `/restart/<app-id>` endpoint already in launcher_server.py.

---

## 2026-06-29 — Grade Importer: bidirectional sync + server deployment

**Asked:** Back up grades to server and run Grade Importer at admin.inkheron.app, syncing bidirectionally (local autosave pushes to server; assignment click pulls from server; 60s background poll; offline queuing).

**Architecture:** Server (admin.inkheron.app) is primary. Local talks to server. Last-write-wins via `last_modified` timestamps. Sync uses Bearer token auth; `/api/sync` endpoint excluded from nginx basic auth so local JS can reach it cross-origin.

**Did (commit b9f84a4):**
- `last_modified REAL` added to assignments, scores, students — all write functions stamp it with `time.time()`; migration stamps existing rows
- `get_sync_data(since_ts)` / `apply_sync_data(data)` in database.py
- `GET/POST /api/sync` with CORS headers and Bearer auth; `GET /api/config` returns sync metadata
- Settings API updated for `sync_url` and `sync_key`
- JS: `syncWithServer()` — pull remote → apply local, push local → remote; wired into `selectAssignment` and `saveAllScores`; 60s `setInterval`; offline fallback status bar
- Settings tab: Sync card with server URL + key fields
- `ecosystem.config.cjs` — PM2 config (port 5051, python3 interpreter)
- `deploy.sh` — one-command deploy: rsync, pip install, DB init with sync_key, PM2, nginx with basic auth + sync route exclusion, certbot

**To deploy:** `cd grade-importer && ./deploy.sh <sync-key> <admin-password>`
**Then on local:** Settings → Sync → `https://admin.inkheron.app` + same sync-key

---

## 2026-06-29 — Grade Importer: extra credit CSV import

**Asked:** Add ability to import extra credit from a CSV (Grammar Arcade `grammar-case-lab-results-*.csv` format).

**Did (commit ac83c9b):**
- `extracredit_parser.py`: auto-detects `officialExtraCredit`/`extra credit`/`bonus`/`ec` column; skips rows where `officialAttemptCompleted != true`, EC blank, or name is test/demo.
- DB: `extra_credit REAL` column on `scores` table; `upsert_extra_credit()` updates EC only without touching score/section_scores.
- `app.py`: `POST /import-extracredit` route; `save_scores` routes EC-only entries to `upsert_extra_credit`.
- `matcher.py`: added `score_key` param so `match_csv_rows` works for any value column.
- Score table: amber **EC** column appears when any student has extra credit data.
- Import card: dedicated EC drop zone below main CSV drop zone.
- Parser is flexible — will detect other future EC column name variants automatically.

---

## 2026-06-29 — Grade Importer: rounding toggle + Launcher restart button

**Asked:** (1) Add 0 dp / 1 dp rounding toggle to score conversion. (2) Add kill and restart server button to launcher sidebar.

**Did (commit f89d031):**
- Added `export_round INTEGER DEFAULT 1` column to assignments table (migration).
- Score Conversion card: `0 dp` / `1 dp` toggle buttons; active state highlighted blue; saves immediately on click via PATCH. Loaded per-assignment on select.
- Export applies `round(score, export_round)` — 0 dp gives whole numbers.
- Launcher: added `/restart/<app_id>` POST endpoint — kills process on port via `lsof`, waits 1s, starts fresh.
- Launcher sidebar: "Restart server" section with dropdown (all server apps) and "↺ Kill & Restart" button; shows green/red status inline.

---

## 2026-06-24 — AP Lang: full feature session + period removal

**Asked:** Multiple requests across context boundary:
1. Add AP Lang to Server Dashboard alongside Speed Dating (all 4 action cards)
2. Add freeform SSH command runner to dashboard
3. Add Copy button to dashboard output
4. Remove cards 08 (Server Dashboard) and 09 (AP Lang Library) from launcher bento; add Servers tab with Open Server Dashboard button
5. Fix narrow-column layout bug on student view and admin panel
6. Make sidebar categories editable from admin
7. Admin views should not count toward view count; students should not see view counts
8. Add student identity system (name prompt) to track who viewed what and for how long
9. Remove class period field (has only 8 students in one class)

**Did (two commits):**
- ap-lang-dashboard repo `f84ebf2`: Removed period field from identity modal, student object, filterLog, analytics table column, and row rendering
- Outer repo `e417399`: Launcher sidebar Servers/Apps tabs; 7-card bento grid; deploy_server.py AP Lang config + /api/run endpoint; dashboard.html server toggle + terminal runner + Copy button; AP Lang server.js view_log/categories tables + admin-exempt counting; student identity modal + sendBeacon view tracking + dynamic categories

**Deploy:** Push & Restart AP Lang from Server Dashboard to send changes live.

## 2026-06-25
**Asked:** Add InkHeron Platform to the app launcher — bento grid card + server dashboard entry.
**Did:**
- `apps.json`: added `inkheron-platform` (node, `InkHeron-Platform/src/server.js`, port 3472 via env override, url `http://localhost:3472`) and alias `"inkheron"`.
- `launcher.html`: added card 08 with `#3a5c42` brand-green accent; updated grid from 7→8 cards (row 3 now 3×2-col cards); added InkHeron server card in the Servers sidebar panel with Open + Restart buttons; updated tools count 7→8.
**Decision:** Port 3472 (default 3000 conflicts with ap-lang-dashboard); PORT injected via env in apps.json.

---

## 2026-06-27 — Grammar Arcade: fix teacher dashboard auth + deploy pipeline

**Root causes (multiple):**
1. `!` in password rejected by browser fetch Headers API → fixed with encodeURIComponent/decode
2. TeacherLite.tsx old build in dist/ bypassed server auth → replaced /teacher with server-side Express route (no React involved)
3. React Router's `<Link>` intercepted /teacher client-side → changed to `<a>` tag forcing full page load
4. `TEACHER_DASHBOARD_PASSWORD` wiped on each deploy (git pull overwrites ecosystem.config.cjs) → server now reads from `/var/www/grammar-arcade/.teacher-password` file (gitignored, persists)
5. Server OOM during Vite build (exit 137) → deploy now builds locally on Mac and rsyncs dist/ to server
6. Local deploy_server.py running old code → restarted to pick up grammar-arcade config

**Password file on server:** `/var/www/grammar-arcade/.teacher-password` — never touched by git pull. If lost, recreate with: `echo -n 'NMMYou5531!InkHeron' > /var/www/grammar-arcade/.teacher-password`

**Deploy now:** builds locally (pnpm build on Mac), rsyncs dist/, git pulls server code, pm2 reload --update-env.

## 2026-06-27 — Grammar Arcade: fix teacher login "string did not match" error

**Asked:** Teacher login returned "Request failed: The string did not match the expected pattern."

**Root cause:** Browser's `fetch()` Headers API rejects certain characters in header values. The `!` in the password `NMMYou5531!InkHeron` triggered this. The error was thrown before the request reached the server.

**Fix (commit cd69fd4):**
- `backendApi.ts`: added `teacherHeaders()` helper that `encodeURIComponent()`s the password before setting the `x-teacher-password` header.
- `server/index.ts`: `requireTeacherPassword` now `decodeURIComponent()`s the raw header value before comparing to the env var.

**Pending (still needs user action):**
1. Deploy grammar-arcade from server dashboard.
2. In dashboard "Run Command", paste the Python snippet to inject `TEACHER_DASHBOARD_PASSWORD` into `/var/www/grammar-arcade/ecosystem.config.cjs` and `pm2 reload --update-env`.

## 2026-06-29

### EAP deploy dashboard split + fixes
Asked: Fix deploy bugs and messy flow, add launcher button, fix Grammar Arcade build error.
Did:
- Fixed Grammar Arcade vite build: `--config vite.config.ts` → `--config ./artifacts/grammar-case-lab/vite.config.ts`
- Removed `ok = True` that silenced SSH failures in git-push deploy path
- Removed dead `local_build` block in git-push path (referenced nonexistent rsync_src/rsync_dst keys)
- Added Deploy Dashboard as card #09 in launcher grid
- Added EAP Library card to launcher sidebar (Library + Admin links, Restart button)
- Updated Grammar Arcade sidebar card URL label to eap.inkheron.app/grammar-arcade

### EAP library admin rebuild
Asked: Match EAP admin to AP Lang admin in look and features.
Did:
- Full rewrite of `InkHeron-Platform/public/eap-library-admin.html`:
  - Fixed sidebar nav: Library / Upload / Categories / Analytics
  - Library table: inline category select, release date picker, download + visible toggle switches, Rename/Replace/Delete
  - Upload: drag-and-drop, FA icon picker, category select, downloadable toggle
  - Categories: FA icon picker (replacing text input)
  - Analytics: formatted time + visit count table
  - Session auth (redirect to /teacher-login), CSRF from /api/me
- Updated `eap-library.html` to render FA icons instead of letter abbreviations (with legacy mapping)
- Updated `cleanIcon()` in `library.js` to accept FA class strings like "fas fa-folder"

## 2026-07-01 — Grade Importer: class colors + GitHub push + server deploy

**Asked:** (1) Add class colors to badges. (2) Push to GitHub. (3) Deploy to admin.inkheron.app.

**Did:**
- Added `badge-orange` (#ffedd5) and `badge-pink` (#fce7f3) CSS classes.
- Added `classColor(cls)` JS helper: Lang→yellow, EAP3→orange, EAP2→green, EAP1→pink, EAP→blue, AP→yellow.
- Updated all 3 badge expressions in index.html (roster table, assignment list, score table) to use `classColor()`.
- Committed and pushed via `git subtree push --prefix grade-importer` to `git@github.com:brendansmit/Grades-exporter-.git`.
- Deployed to server with `./grade-importer/deploy.sh`. Fixed pip3 not found — server uses `pip3 install --break-system-packages --ignore-installed`.
- Dependencies installed, PM2 started, nginx config updated, SSL cert renewed.
- Auto-configured local sync: `https://admin.inkheron.app` + sync key `GwPVRUH4EhC2vSrxrmn7XYRgar28nVXWjLlprDv6ulk` via `/api/settings`.
- Updated `deploy.sh` should use `pip3 install --break-system-packages --ignore-installed` for future deploys.

**Sync key:** `GwPVRUH4EhC2vSrxrmn7XYRgar28nVXWjLlprDv6ulk` (stored in local DB and server DB).

---

## 2026-06-29 — Assignment archive/delete/unassign

- Asked: Add ability to delete, archive, and unassign students from assignments.
- Did:
  - Migration 008: `ALTER TABLE assignments ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`
  - New endpoints in assignments.js: `POST /api/assignments/:id/archive` (toggle), `POST /api/assignments/:id/unassign-student` (seeds class-wide override list then removes one student)
  - `DELETE /api/assignments/:id` now requires CSRF token
  - `GET /api/assignments` accepts `?archived=1` to show archived; defaults to non-archived
  - assignments.html: Archive/Unarchive + Delete buttons in detail header; Show archived toggle in list header; Unassign button per student row; archive label updates on openGroup(); assignment_id annotated on merged 'all' rows for correct unassign targeting
- Deployed and restarted. Committed 8fad189.
