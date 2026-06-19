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
