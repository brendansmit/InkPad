# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

Entry format:
```
## YYYY-MM-DD — <short title>
- Phase/Step worked: 
- Built: 
- Decisions: 
- Open / next: 
- Gotchas hit: 
```

---

## 2026-06-25 — Phase 1 Step 1.8 backups and basics
- Phase/Step worked: Phase 1, Step 1.8
- Built: Added `ops/backup.sh`, `ops/RESTORE.md` and `ops/SECURITY.md`. Installed `sqlite3` on
  the droplet, created root-only `/etc/inkheron/backup.key`, installed
  `/usr/local/sbin/inkheron-backup`, added `/etc/cron.d/inkheron-backup` for nightly 03:15
  backups, and produced `/var/backups/inkheron/inkheron-20260625T112543Z.tar.gz.enc`.
- Decisions: Backups include `/opt/inkheron-platform/data/inkheron.db` and
  `/opt/etherpad-lite/var/etherpad.sqlite`, encrypted with OpenSSL AES-256-CBC and PBKDF2.
  Current droplet root disk was not converted to full-disk encryption in place; documented that
  true FDE needs a planned rebuild or encrypted volume migration.
- Open / next: Phase 1 exit check, then Phase 2 identity and auth.
- Gotchas hit: Backup directory is root-only, so restore tests need `sudo` to find the encrypted
  backup file. Restore test passed with `PRAGMA integrity_check` returning `ok` for both DBs.

## 2026-06-25 — Phase 1 Step 1.7 SQLite schema
- Phase/Step worked: Phase 1, Step 1.7
- Built: Added `migrations/001_initial_schema.sql` and a Node migration runner at
  `src/db/migrate.js`. Created canonical tables `students`, `classes`, `assignments`, `pads`,
  `submissions`, `grades` and `paste_events`, plus `settings`, `teachers` and
  `schema_migrations`.
- Decisions: Used Node 24 `node:sqlite` instead of adding a native SQLite package. Runtime DB
  files are ignored with `data/*.db` and `data/*.db-*`.
- Open / next: Phase 1, Step 1.8 backups and basics.
- Gotchas hit: `node:sqlite` prints an experimental warning in Node 24. Remote schema verification
  first failed due shell quoting, not due the migration. Rerun verified all expected tables and
  columns.

## 2026-06-25 — Phase 1 Step 1.6 Fastify wrapper skeleton
- Phase/Step worked: Phase 1, Step 1.6
- Built: Added a Node/Fastify wrapper with `GET /healthz`, static self-hosted assets, local
  Inter and Source Serif 4 font files, and a minimal InkHeron landing page. Deployed it to
  `/opt/inkheron-platform` as `inkheron-wrapper.service` on `127.0.0.1:3000`.
- Decisions: Caddy now routes wrapper traffic to `127.0.0.1:3000`, while Etherpad keeps `/p/*`,
  `/socket.io/*`, `/static/*`, `/locales.json`, `/manifest.json` and `/favicon.ico` on
  `127.0.0.1:9001`.
- Open / next: Phase 1, Step 1.7 platform SQLite schema.
- Gotchas hit: Initial wrapper returned 500 on `/` because `@fastify/static` was registered with
  `decorateReply: false` while the route used `reply.sendFile`. Fixed and redeployed. Local
  machine Node is 16, so tests use the bundled Node 24 runtime.

## 2026-06-25 — Phase 1 Step 1.5 China reachability confirmed
- Phase/Step worked: Phase 1, Step 1.5
- Built: User confirmed `https://inkpad.inkheron.app/` works from China with VPN off. Current
  public surface is pure Etherpad, which is expected before the Fastify wrapper phase.
- Decisions: Mark Step 1.5 complete based on the real China-side test plus prior DNS, HTTPS and
  WebSocket checks.
- Open / next: Phase 1, Step 1.6 Fastify wrapper skeleton.
- Gotchas hit: none.

## 2026-06-25 — Phase 1 Step 1.5 reachability checks started
- Phase/Step worked: Phase 1, Step 1.5
- Built: Verified `inkpad.inkheron.app` resolves to `167.172.71.219` through Chinese public DNS
  resolvers AliDNS `223.5.5.5` and DNSPod `119.29.29.29`. Re-verified public HTTPS returns
  `200` from Caddy and WebSocket upgrade returns an Engine.IO session id through
  `wss://inkpad.inkheron.app/socket.io/`.
- Decisions: Did not mark Step 1.5 complete because the done condition requires a real China
  mobile-data VPN-off browser test with live pad editing.
- Open / next: Run `https://inkpad.inkheron.app/` from Chinese mobile data with VPN off, open a
  pad in two tabs and confirm edits sync live. Optional browser checks: 17CE, BOCE and GreatFire.
- Gotchas hit: 17CE's documented WebSocket API requires API credentials. BOCE blocks direct
  scripted access with WAF. GreatFire timed out from this environment.

## 2026-06-25 — Phase 1 Step 1.4 Caddy HTTPS and WebSocket
- Phase/Step worked: Phase 1, Step 1.4
- Built: Installed Caddy `2.6.2`, configured `/etc/caddy/Caddyfile` for
  `inkpad.inkheron.app`, reverse-proxied to Etherpad on `127.0.0.1:9001`, obtained a valid
  Let's Encrypt certificate and enabled Caddy at boot.
- Decisions: Disabled nginx and left it installed. Backed up nginx config under
  `/root/inkheron-backups/nginx-before-caddy-*` before handing ports 80 and 443 to Caddy.
- Open / next: Phase 1, Step 1.5 reachability from China VPN-off and third-party checks.
- Gotchas hit: Ports 80 and 443 were occupied by nginx serving an older Express/static app from
  this reused droplet. Caddy passes WebSocket by default; verified with a public `wss://`
  Socket.IO handshake returning an Engine.IO session id.

## 2026-06-25 — Phase 1 Step 1.3 Etherpad local install
- Phase/Step worked: Phase 1, Step 1.3
- Built: Installed Etherpad under `/opt/etherpad-lite`, pinned to stable `v3.3.2`, upgraded Node
  to `24.18.0`, installed `pnpm 11.1.2`, configured Etherpad to bind to `127.0.0.1:9001`,
  configured Etherpad DB as SQLite at `/opt/etherpad-lite/var/etherpad.sqlite`, and created an
  enabled `etherpad.service`.
- Decisions: Used the latest stable Etherpad tag instead of the default `develop` branch.
  Removed `ProtectHome=true` from the systemd unit because pnpm reads the account home path from
  `/etc/passwd` during plugin migration and fails under home protection.
- Open / next: Phase 1, Step 1.4 install Caddy and route HTTPS/WebSocket traffic to Etherpad.
- Gotchas hit: Etherpad `v3.3.2` requires Node `>=24`; the droplet had Node 22. The first
  config-edit attempts failed due remote shell quoting before touching the file. Service startup
  failed until pnpm's home-access issue was isolated with `systemd-run`.

## 2026-06-25 — Phase 1 Step 1.2 server hardening
- Phase/Step worked: Phase 1, Step 1.2
- Built: Created `inkheron` non-root sudo user with SSH key access, set timezone to
  `Asia/Shanghai`, ran `apt-get update` and `apt-get upgrade`, enabled UFW with only 22, 80 and
  443 open.
- Decisions: Disabled root SSH login and password SSH. `inkheron` has passwordless sudo so remote
  maintenance still works with key-only auth.
- Open / next: Phase 1, Step 1.3 install/run Etherpad locally on port 9001.
- Gotchas hit: `/etc/ssh/sshd_config.d/50-cloud-init.conf` was forcing
  `PasswordAuthentication yes`; changed it to `no`. Hostname still reads
  `InkHeron--Speed-Dating-App`, which may need cleanup later.

## 2026-06-25 — Phase 1 Step 1 DNS verified
- Phase/Step worked: Phase 1, Step 1.1
- Built: Verified `inkpad.inkheron.app` A record resolves to `167.172.71.219`.
- Decisions: Target host is `inkpad.inkheron.app`, not apex `inkheron.app`.
- Open / next: Phase 1, Step 1.2 base server hardening.
- Gotchas hit: none.

## (template — delete this block once real entries exist)

## 2026-06-25 — Buildbook foundation created
- Phase/Step worked: pre-build setup
- Built: CLAUDE.md, buildbook/INDEX.md, this file. Student + teacher UI mockups already exist.
- Decisions: Writing portal is day-one; Tests portal later. SQLite. Node/Fastify wrapper.
  Singapore droplet. Porkbun DNS-only. Hashed passwords, teacher-reset only. Word count always on.
  Targets coach (explain), grammar codes answer-free, strengths expand. Paste detection day-one.
- Open / next: write remaining phase files (1–8), then begin Phase 1.
- Gotchas hit: none yet. (Watch: Caddy WebSocket headers for Etherpad; custom paste plugin is the
  main time-risk.)
