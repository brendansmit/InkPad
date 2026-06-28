# SESSION_NOTES_ARCHIVE.md — InkHeron Platform

Old entries moved out of `SESSION_NOTES.md` to keep active context under 400 lines.

---

## 2026-06-25 — Phase 1 Step 1.6 Fastify wrapper skeleton
- Phase/Step worked: Phase 1, Step 1.6
- Built: Added a Node/Fastify wrapper with `GET /healthz`, static self-hosted assets, local
  Inter and Source Serif 4 font files, and a minimal InkHeron landing page. Deployed it to
  `/opt/inkheron-platform` as `inkheron-wrapper.service` on `127.0.0.1:3000`.
- Decisions: nginx now routes wrapper traffic to `127.0.0.1:3000`, while Etherpad keeps `/p/*`,
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
  `200` from nginx and WebSocket upgrade returns an Engine.IO session id through
  `wss://inkpad.inkheron.app/socket.io/`.
- Decisions: Did not mark Step 1.5 complete because the done condition requires a real China
  mobile-data VPN-off browser test with live pad editing.
- Open / next: Run `https://inkpad.inkheron.app/` from Chinese mobile data with VPN off, open a
  pad in two tabs and confirm edits sync live. Optional browser checks: 17CE, BOCE and GreatFire.
- Gotchas hit: 17CE's documented WebSocket API requires API credentials. BOCE blocks direct
  scripted access with WAF. GreatFire timed out from this environment.

## 2026-06-25 — Phase 1 Step 1.4 nginx HTTPS and WebSocket
- Phase/Step worked: Phase 1, Step 1.4
- Built: Configured nginx for `inkpad.inkheron.app`, reverse-proxied to Etherpad on
  `127.0.0.1:9001`, using an existing Let's Encrypt certificate managed by certbot.
- Decisions: Reused the existing nginx instance (shared with speed-dating and grammar-arcade).
  Added the InkHeron server block alongside the existing ones.
- Open / next: Phase 1, Step 1.5 reachability from China VPN-off and third-party checks.
- Gotchas hit: Ports 80 and 443 were already used by nginx serving older apps from this reused
  droplet. Verified WebSocket upgrade headers are passed; public `wss://` Socket.IO handshake
  returned an Engine.IO session id.

## 2026-06-25 — Phase 1 Step 1.3 Etherpad local install
- Phase/Step worked: Phase 1, Step 1.3
- Built: Installed Etherpad under `/opt/etherpad-lite`, pinned to stable `v3.3.2`, upgraded Node
  to `24.18.0`, installed `pnpm 11.1.2`, configured Etherpad to bind to `127.0.0.1:9001`,
  configured Etherpad DB as SQLite at `/opt/etherpad-lite/var/etherpad.sqlite`, and created an
  enabled `etherpad.service`.
- Decisions: Used the latest stable Etherpad tag instead of the default `develop` branch.
  Removed `ProtectHome=true` from the systemd unit because pnpm reads the account home path from
  `/etc/passwd` during plugin migration and fails under home protection.
- Open / next: Phase 1, Step 1.4 configure nginx and route HTTPS/WebSocket traffic to Etherpad.
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

## 2026-06-25 — Buildbook foundation created
- Phase/Step worked: pre-build setup
- Built: CLAUDE.md, buildbook/INDEX.md, this file. Student + teacher UI mockups already exist.
- Decisions: Writing portal is day-one; Tests portal later. SQLite. Node/Fastify wrapper.
  Singapore droplet. Porkbun DNS-only. Hashed passwords, teacher-reset only. Word count always on.
  Targets coach (explain), grammar codes answer-free, strengths expand. Paste detection day-one.
- Open / next: write remaining phase files (1–8), then begin Phase 1.
- Gotchas hit: none yet. (Watch: nginx WebSocket headers for Etherpad; custom paste plugin is the
  main time-risk.)
