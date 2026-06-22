# Session Notes

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
