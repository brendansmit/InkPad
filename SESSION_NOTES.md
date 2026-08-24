# Session Notes


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

## 2026-07-08: serve.inkheron.app implementation

**Asked:** Build the separate remote server control panel and link it from Admin.

**Did:** Implemented a standalone `serve` app inside the Admin repo with password login, signed sessions, optional Cloudflare Access email allowlist, CSRF protection, typed host confirmation, audit logging, security headers and only allowlisted status/log/restart/deploy operations. Added a `Serve` button in Admin linking to `https://serve.inkheron.app`. Added deployment notes and corrected Admin's serve target to `/opt/admin-platform` with PM2 `admin-platform`.

**Verification:** Serve tests, Admin tests and syntax checks passed with bundled Node. Local browser checks verified login, the serve dashboard, mobile layout, no command runner, Admin link target and no console errors.

**Commits:** Admin repo commits `f580182`, `21e17d8`, `91da628`. Not deployed publicly yet because `serve.inkheron.app` should be put behind Cloudflare Access or equivalent before exposure.

## 2026-07-08: cheap server recommendation

**Asked:** Best cheap capable server host and location at 10 dollars or less.

**Did:** Recommended Singapore as the location for China/Asia use, with DigitalOcean Singapore as the easiest option because the current setup is already on DigitalOcean, and Hetzner Singapore as the value option if its current small plan is available under the cap. Warned that 1 GB RAM is tight and should use swap plus Cloudflare Access for `serve.inkheron.app`.

**Decision:** No code was started.

## 2026-07-08: server hardening add-ons

**Asked:** How to add swap, nginx, PM2, UFW and Cloudflare Access.

**Did:** Provided a command checklist for Ubuntu server setup and Cloudflare Access configuration order.

**Decision:** No code was started.

## 2026-07-08: DigitalOcean droplet choice

**Asked:** Whether to choose the normal Ubuntu DigitalOcean 6 dollar droplet.

**Did:** Confirmed that the normal Ubuntu 24.04 LTS Basic droplet at 6 dollars is the right choice under the stated 10 dollar cap, with Singapore as the preferred region and 2 GiB swap added after creation.

**Decision:** No code was started.

## 2026-07-08: DigitalOcean SSH key choice

**Asked:** What to choose for SSH key during droplet creation.

**Did:** Recommended using SSH key authentication instead of password login, preferably the existing local Ed25519 public key if available.

**Decision:** No code was started.

## 2026-07-08: new droplet setup

**Asked:** Set up the new DigitalOcean droplet at `165.22.242.91`.

**Did:** SSH verified. Updated Ubuntu 24.04.4, added 2 GiB swap, installed nginx, git, curl, UFW, Node 20.20.2 and PM2 7.0.3, enabled firewall for SSH/HTTP/HTTPS only, configured nginx for `serve.inkheron.app`, copied the Serve app to `/opt/admin-platform`, started `inkheron-serve` with PM2 on port 3469 and enabled PM2 startup.

**Verification:** Local droplet health returned OK, nginx Host-header check returned the Serve login page, PM2 showed `inkheron-serve` online, UFW active, nginx active. DNS still points `serve.inkheron.app` to old IP `167.172.71.219`; A record must be changed to `165.22.242.91`.

**Decision:** Do not store the generated Serve password in notes.

## 2026-07-08: Serve public hardening without Cloudflare

**Asked:** Continue after DNS was changed and make `serve.inkheron.app` as strong as possible for free without Cloudflare or more spending, including a second secret phrase for dangerous actions.

**Did:** Added a second action secret gate to the Serve app. Deploy and restart now require normal login, a 15 minute action unlock, then typed host confirmation. Added tests for the locked/unlocked action path and committed the Admin repo change as `a0e6fff Add serve action secret unlock`. Deployed the update to the droplet, rotated the app password and session secret, added nginx Basic Auth, issued a Let's Encrypt certificate, configured HTTPS redirect, nginx rate limiting, security headers, fail2ban jails, disabled the unused Cloudflare tunnel and kept the Node app bound to `127.0.0.1:3469`.

**Verification:** DNS resolves `serve.inkheron.app` to `165.22.242.91`. Public HTTPS without Basic Auth returns `401`. Basic Auth reaches the app login. App login succeeds with the rotated password. Deploy/restart return `423` before action unlock, action unlock succeeds with the new secret, and typed host confirmation still blocks incorrect confirmations. UFW allows only SSH, HTTP and HTTPS. fail2ban is active with `sshd`, `nginx-http-auth`, `serve-nginx-auth` and `nginx-limit-req` jails. Cloudflared is inactive. HTTP redirects to HTTPS. Certbot live issuance succeeded, but the renewal dry run hung and was stopped cleanly.

**Decision:** Do not use Cloudflare for `inkheron.app`. Use direct DNS to the droplet plus layered free controls: nginx Basic Auth, Serve app password, action secret, CSRF, typed confirmations, rate limiting, fail2ban and audit logs.

## 2026-07-08: Serve credential rotation

**Asked:** Change the nginx Basic Auth password, Serve app password and action secret to user-provided memorable values.

**Did:** Updated the nginx Basic Auth password for user `brendan`, updated the PM2 environment for `inkheron-serve` with the new Serve app password and action secret, rotated the session secret, saved PM2 and reloaded nginx.

**Verification:** Confirmed public login works with the new Basic Auth and Serve app password. Confirmed the action unlock endpoint accepts the new action secret. Did not store the secret values in notes.

## 2026-07-08: Admin Basic Auth reset

**Asked:** Investigate why `admin.inkheron.app` was inaccessible and reset its Basic Auth password.

**Did:** Confirmed `admin.inkheron.app` resolves to the old droplet `167.172.71.219`, where nginx protects the admin app with Basic Auth realm `Grade Importer` and username `Admin`. Installed `apache2-utils` because `htpasswd` was missing, reset the `Admin` Basic Auth password to the user-provided value, validated nginx and reloaded it.

**Verification:** `https://admin.inkheron.app` returns HTTP 200 with username `Admin` and the new password. Did not store the password value in notes.

## 2026-07-08: Restore admin and grade importer routing

**Asked:** Restore `admin.inkheron.app` so the grade importer is only part of the admin site, not the entire admin site.

**Did:** Investigated the old droplet nginx and PM2 state. Found nginx was routing all of `admin.inkheron.app` to the grade importer on port `5051`, while the main `admin-platform` app was still online on port `3474`. Replaced the nginx site config so `/` and normal admin APIs route to `admin-platform`, `/grades` routes to the grade importer, grade-specific API paths route to the grade importer and `/api/sync` remains unauthenticated as before. Backed up the previous nginx config before replacing it, validated nginx and reloaded it.

**Verification:** `https://admin.inkheron.app/` redirects to the admin login, `/login` returns the InkHeron Admin login page, `/api/session` returns the admin API response, `/grades` returns the Grade Importer page and `/api/config` returns the grade importer config response.

## 2026-07-08: Remove admin browser Basic Auth

**Asked:** Remove the browser username/password popup from `admin.inkheron.app` because the admin site should only use its in-app login.

**Did:** Removed nginx Basic Auth directives from the restored `admin.inkheron.app` server block and reloaded nginx. Backed up the prior config first at `/etc/nginx/sites-available/admin.inkheron.app.bak-20260708-no-basic-auth`.

**Verification:** `https://admin.inkheron.app/login` returns HTTP 200 with no `WWW-Authenticate` header, and `/grades` still returns the Grade Importer page.

## 2026-07-08: AI control panel one-hour MVP discussion

**Asked:** Whether the private AI coding dashboard can be up on a new droplet within an hour, using details from the prior remote server dashboard conversation.

**Did:** Pulled the relevant setup facts from notes: existing launcher/deploy dashboard pattern, Flask dashboard on port 5095, per-app configs in `deploy_server.py`, mixed `pm2` and `systemd`, InkPad live at `/opt/inkheron-platform`, and the need for tighter auth and scoped remote control. Recommended a very small MVP rather than the full safe architecture.

**Decision:** No code started. User still needs to give explicit go-ahead before implementation.

## 2026-07-08: AI Control MVP scaffold

**Asked:** Go ahead and build the one-hour MVP for a private phone dashboard on the new `builder.inkheron.app` droplet.

**Did:** Added `ai-control/`, a Python standard-library web app with password login, SQLite job history, mobile UI, per-project JSON config, per-job git clones, configurable Codex command execution, test/build commands, logs, diff display, changed-file safety checks, approve-push and approve-deploy endpoints, nginx config, systemd unit and Ubuntu install script.

**Verification:** Python syntax check passed with bytecode redirected to `/tmp`; project JSON files validate; ASCII scan is clean. Ran a local smoke test with a fake git repo and fake Codex command: job cloned, branched, edited `README.md`, ran test/build commands, produced logs/diff, reached `review`, then fake deploy reached `deployed`. Node was not available locally, so no JS syntax check was run.

**Remote install:** Copied to the new droplet `165.22.242.91`, installed `/opt/ai-control`, enabled `ai-control.service`, generated credentials into `/etc/ai-control.env` and `/root/ai-control-credentials.txt`, configured nginx and certbot for `https://builder.inkheron.app`. Verified public `/health` returns 200, unauthenticated `/` redirects to `/login`, generated password logs in locally on the droplet and the authenticated homepage returns 200.

## 2026-07-08: AI Control auth integration explanation

**Asked:** Explain how to connect Codex, Claude Code and GitHub to the new builder dashboard so it can access existing projects and save its own work.

**Did:** Explained the three required identities: dashboard login, AI CLI auth for the `ai-control` Unix user and GitHub write access via a machine user or per-repo deploy keys. Recommended using SSH GitHub URLs in `projects.json`, storing AI API keys in `/etc/ai-control.env`, running the CLIs as `ai-control` and saving AI work by pushing per-job branches.

## 2026-07-08: AI Control setup UI

**Asked:** Continue step by step, keep a UI to interact with and deploy each working slice.

**Did:** Added an authenticated setup panel to the builder dashboard. It shows Git, Codex, Claude Code, GitHub SSH auth, API key presence, enabled projects and each selected project's repo, AI command, test/build and deploy status. Added `/api/setup` to expose safe status metadata and the service user's public GitHub key without exposing secrets.

**Verification:** Python syntax check passed, frontend JS syntax check passed with bundled Node, shell installer syntax passed and ASCII scan is clean. Local `/api/setup` smoke test returned tool/GitHub/project status.

## 2026-08-16: Launcher and both server dashboards audited, fixed and extended

**Asked:** Audit the local app launcher and both servers. Make sure every app and every site has a launch icon, and that every server has a dashboard that can restart an app and push an update by pulling from the git repo. Update and fix what already exists rather than rebuilding. Later: duplicate the local launcher onto serve.inkheron.app, since it is the same thing on a website instead of the Mac.

**Decisions taken up front:** fix serve.inkheron.app and pull builder.inkheron.app down; real tools only in the launcher; strip the GitHub token from the git remote; fix the lang.inkheron.app IPv6 trap; delete old mosaic backups; reach droplet 1 from droplet 2 over a dedicated restricted key, not a plain root key; show Mac-only tools greyed as "local only" on the web panel; clone the Admin repo properly on droplet 2.

**Deploy Dashboard (Mac, port 5095):** now covers both droplets, eleven apps, grouped by host.
- Every HTTPS health check had been failing silently since it was written. The python.org framework build ships no CA bundle, so each check died with CERTIFICATE_VERIFY_FAILED and fell through to the process check, which meant a down site looked identical to a healthy one. Pointed SSL at certifi's bundle.
- Status now collects both signals every time and reports three states. A process that is running while its public URL does not answer is "degraded", not "online".
- Added `/api/status-all`: one request for the whole estate, with the SSH master connections warmed first. Eleven parallel requests were hitting the browser's per-host connection cap, and eleven ssh processes were racing to create the same ControlMaster socket, which showed up as sites randomly flashing offline.
- inkheron-serve now deploys by rsync, because droplet 2 holds no GitHub credentials.

**Serve panel (serve.inkheron.app):** restored and brought to parity with the Mac launcher.
- Was unreachable. Caddy on droplet 2 is in Docker and cannot see 127.0.0.1, so the panel binds 0.0.0.0 with ufw allowing 3469 from the Docker subnets only, and the Caddy container got `host.docker.internal:host-gateway`.
- New launcher grid: all eleven live sites as cards grouped by droplet, plus the five Mac-only tools greyed and labelled "local only".
- Cross-droplet access is a forced-command key. `/usr/local/bin/serve-remote` accepts only `<verb> <app>` pairs from a fixed table. Verified the deny paths: command injection, arbitrary file read, unknown app, extra arguments and an interactive shell are all refused.
- Status was lying in two more places: `pm2 jlist` exits 0 whatever the app is doing, and `docker compose ps` exits 0 with empty output when the container is down. The wrapper now parses the pm2 list per app, and docker status steps ask for running ids only.
- Deploy and restart are refused with the reason when an app cannot support them, instead of handing the runner an undefined step. Only three droplet-1 apps have a git remote on the droplet; the rest ship by rsync and say so.
- All existing gates kept: password login, 15-minute action unlock behind a second secret, typed hostname confirmation, CSRF, audit log, rate limiting. Six security tests pass.

**Launcher:** the Servers panel was missing six live sites. Added InkPad, Admin, Mosaic, HealthSpan, SmitRecipes and Serve, and made it explicit that the restart buttons there restart the copy on this Mac, not the live site.

**Cleanups:** fixed the lang.inkheron.app `proxy_pass` to 127.0.0.1 and reloaded nginx; stopped and disabled ai-control.service on droplet 2 (builder.inkheron.app had already lost its Caddy route, and /opt/ai-control is left on disk); deleted 15 of the 17 mosaic.previous-* directories, keeping the two newest, which freed only about 28 MB, so the 69% disk usage is elsewhere; replaced the plaintext GitHub PAT in /opt/healthspan/.git/config with per-repo SSH deploy keys.

**Verification:** all ten public sites answered after every change. Six security tests pass. The web panel was driven end to end in a browser against a local instance: login, grid render, card selection, and the greyed deploy/restart buttons showing their reason.

**Left for Brendan:** rotate the GitHub token (it is still in /root/.bash_history on droplet 2 and I must not rotate it); paste the two deploy public keys into the Verax and SmitRecipes repos on GitHub, after which their Deploy buttons start working; decide what to do about the plaintext TEACHER_DASHBOARD_PASSWORD committed in grammar-arcade's ecosystem.config.cjs; delete the builder.inkheron.app DNS record at Porkbun if it is not wanted.

## 2026-08-25: Cadence, a teaching calendar built overnight

**Asked:** Vibe code a calendar app for a teacher with two courses: AP Language with one section, and EAP with three G12 sections running the same lessons on different days. Track when lessons happen, where, and what events land when, mainly to check the three parallel sections stay even. Periods and slots must be editable because the real timetable keeps changing. Track submission types. Feature rich, good design, some colour but not loud. Later it should become a web app that installs on a phone home screen, with a Mac widget if possible. Set and forget, no permission checks, build it while asleep.

**Stack chosen:** Vite, React, TypeScript. No UI framework, no date library, no state library, no icon package. React is the only runtime dependency. Hand written CSS with design tokens, light and dark. State is one JSON blob in localStorage with a debounced save, a clone on write store, and 50 step undo.

**The model:** `TIMETABLE x CALENDAR -> OCCURRENCES`, `CURRICULUM -> LESSONS`, then a projector flows the lesson sequence onto each section's own meetings. A recorded lesson always wins, a cancelled meeting consumes nothing, so an event that eats two classes shows as those sections falling behind rather than a lesson vanishing. Due dates are counted in meetings, not days, which is what makes "three lessons after I set it" land on a different date per section.

**Built, one commit per working step:** scaffold and Today view, Week, Pacing, Curriculum, Assignments, Timetable, Classes, Month, Settings, then PWA, sync server, README, phone layout. Nine views, no stubs left.

**Pacing is the reason it exists.** Parity tracks per section, a runway table with slack, lost meetings grouped by cause, and an alignment matrix showing the date each section reaches each lesson with the day spread. The seeded sample includes a sports day two Wednesdays back that cancels two EAP sections, so on first run it already reads "4 lessons between front and back" and the cause is visible in Week, Month and Today.

**PWA:** service worker with an offline shell, icons generated from the brand mark, manifest with home screen shortcuts to Today, Week and Pacing. The worker only registers in a real build, because in front of the dev server it serves stale modules and fights hot reload.

**Sync server:** `server/server.mjs`, zero dependencies, one file. Serves the built app and holds one JSON blob at `GET/PUT /state` behind an `X-Cadence-Key` header, with a timing safe compare, temp file plus rename writes, and the last 30 versions kept. Optional: leave the setting blank and the app stays local only.

**Verification:** typecheck and production build clean. Every route driven in the browser. Sync proved end to end against a live server on port 8791: push, pull, 36 lessons and 48 teaching records survived the round trip, wrong key returns 401, rubbish payload is refused. Offline proved by stopping the server and reloading the built app, which still rendered from cache. Phone layout checked at 375 px on all nine routes with no clipped content: found and fixed a `1fr` grid blowout that was silently cutting off the right hand side of every card.

**Decisions worth remembering:** free period totals sum real period durations rather than assuming 40 minutes each; the app never claims a past meeting happened if nothing was recorded; a Mac widget was not built, because a real Notification Centre widget needs a signed Swift WidgetKit app, and the README says so plainly along with what it would fetch.

**Left for Brendan:** it is a separate git repo at `Cadence/`, not yet pushed anywhere and not deployed. To put it on a droplet, follow the README: build, rsync `dist/` and `server/`, run it under systemd with a `CADENCE_KEY`, nginx and TLS in front, then paste the URL and key into Settings > Sync on both devices. Screenshots stopped working partway through the night because the browser pane was not displayed, so the last visual checks were done by measuring the DOM instead of looking at it.
