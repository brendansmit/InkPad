# Session Notes

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

## 2026-07-01 — Birthday importer UX + smart date parsing

**Asked:** (1) Show CSV is loaded visually. (2) Undo button after import. (3) Delete button per record. (4) Smarter date parsing — if an age column exists use it, if `has_year=false` show "Jan 5" not a year-2001 date.

**Did (server-side, previous session):**
- Rewrote `birthdays.js` on server: `parseDateValue()` returns `{date, hasYear}`. MM/DD stored as `1900-MM-DD` with `has_year=false`. Age column detected, converts age → birth year. `has_year` field stored on all birthday records.
- Patched `server.js` via Python script: added `let lastImportIds = []`, `POST /api/birthdays/preview`, `POST /api/birthdays/undo`, `DELETE /api/birthdays/:id`. Import endpoint stores `lastImportIds`.

**Did (frontend, this session):**
- `index.html`: added `id="dropZoneLabel"` on drop zone span, `id="importBtn"` on submit, `<div id="importPreview">`, undo button (`id="undoImportBtn"`, hidden by default), Delete column header in table.
- `app.js`: `updateDropZoneLabel()` — on file select, shows filename in drop zone with green border (`file-loaded` class), shows "File loaded" message in preview div. File `change` and drop listeners call it. `formatBirthdayDisplay()` — if `has_year=false` shows "Jan 5", else shows "Jan 5, 2001 (age 24)". `renderBirthdayRow` uses display cell (not date input) for birthday column. `deleteCell()` + `deleteBirthday(id)` call `DELETE /api/birthdays/:id`. `undoImport()` calls `POST /api/birthdays/undo`. Undo button shown after successful import, hidden after undo.
- `styles.css`: `.drop-zone.file-loaded` (green border/bg), `.import-preview`, `button.danger`, `button.compact`, `button.secondary`, `.birthday-display`.

**Restarted:** `pm2 restart admin-platform` — server online, all new endpoints confirmed present in server.js.

## 2026-07-07 — Launcher: InkPad + deploy dashboard cards

**Asked:** Add inkpad.inkheron.app and the server dashboard to the app launcher so I can restart, debug and deploy the platform without waiting.

**Found:** Both were already registered — `apps.json` has `inkpad` (open runtime → https://inkpad.inkheron.app, opened directly by launcher_server.py line 76) and `server-dashboard` (Flask deploy dashboard on 5095), and both sit in the `launcher.html` APPS array as cards 09 and 10. Only cosmetic gaps remained.

**Did:** `launcher.html` — added accent colours for `.card:nth-child(9)` (violet) and `(10)` (amber); fixed sidebar footer "8 tools" → "10 tools". Committed `83d9cb6`. No launcher restart needed (apps.json read live).

## 2026-07-07 — Deploy dashboard: add InkPad (live) tab

**Asked:** InkPad is not in the server dashboard, I cannot deploy any updates.

**Root cause:** Two deployments of the InkHeron-Platform repo exist. The live site `inkpad.inkheron.app` is `/opt/inkheron-platform`, a systemd service `inkheron-wrapper` on port 3000. The dashboard only had an "EAP" tab, which deploys `/opt/eap-platform` — an older pm2 copy on port 3466 serving `eap.inkheron.app`. So every deploy hit the wrong (old) copy and the live site never updated.

**Did:**
- `deploy_server.py`: added `inkpad` server — rsync deploy (excludes .git/node_modules/data/.env), remote `/opt/inkheron-platform`, DB backup + `node src/db/migrate.js` on deploy, restart `systemctl restart inkheron-wrapper`, logs via `journalctl -u inkheron-wrapper`, health `inkpad.inkheron.app/healthz`. Made `inkpad` the default server. Added a `logs_cmd` override so systemd apps use journalctl instead of `pm2 logs`.
- `dashboard.html`: added "InkPad" tab (default active), relabelled the pm2 copy "EAP (old)", added the label mapping, default `currentServer='inkpad'`.
- Verified Python parses. Could not run a live health probe (sandbox blocks outbound HTTPS — both inkpad and eap return 000 here identically). No deploy triggered; that is the teacher's to click.

Committed `fac26be`.

## 2026-07-07: AI control panel viability discussion

**Asked:** Discuss whether a private mobile web dashboard on the existing droplet can run Codex or Claude Code jobs against selected projects, show logs and diffs, then allow phone approval for push and deploy.

**Did:** Recommended treating the runner as an isolated project-level build worker rather than remote root access. Outlined a practical MVP with private auth, per-project config, job queue, SQLite history, per-job workspaces, Codex CLI execution under a restricted Unix user, dangerous-action gates, git diff review and explicit deploy approval.

**Decision:** No code was started. Next step is to confirm the MVP stack and repository location before implementation.

## 2026-07-07: admin.inkheron.app remote server control security

**Asked:** How to encrypt and strengthen `admin.inkheron.app` so it can control only the sites on the DigitalOcean droplet while away from the main computer.

**Did:** Recommended a narrow remote admin design: HTTPS-only, Cloudflare Access or equivalent identity gate, app-level admin auth, allowlisted server actions, no shell command box, CSRF protection, audit logging, rate limits and a restricted deploy runner user on the droplet.

**Decision:** No code was started. Next step is explicit go-ahead to inspect the admin app and launcher dashboard before implementing.

## 2026-07-07: admin ops subdomain decision

**Asked:** Whether to protect only part of `admin.inkheron.app` or create another subdomain with a button from admin to the remote server controls.

**Did:** Recommended a separate locked-down ops subdomain for restart/deploy/log controls, linked from the normal admin UI, so high-risk droplet actions can sit behind stricter access without changing the security posture of the whole admin app.

**Decision:** No code was started. Preferred direction is an `ops.inkheron.app` style control panel with a link from admin.

## 2026-07-07: serve.inkheron.app name chosen

**Asked:** Proposed `serve.inkheron.app` as the subdomain for the separate droplet control panel.

**Did:** Confirmed it is a suitable name for the locked-down restart/deploy/log dashboard.

**Decision:** No code was started. Use `serve.inkheron.app` as the planned remote ops subdomain.

## 2026-07-07: serve repo question

**Asked:** Whether a GitHub repo needs to be created for `serve.inkheron.app`.

**Did:** Recommended a separate private repo only if the serve panel will be deployed independently on the droplet. For initial implementation, it can also start inside the existing workspace and be split later.

**Decision:** No code was started. Preferred production direction is a private `inkheron-serve` repo, but it is not required before inspection.
