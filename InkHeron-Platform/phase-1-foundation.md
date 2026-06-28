# Phase 1 — Foundation & reachability

Mostly ops, not code. Highest overrun risk in the 4-day plan. Do this first and fully before
any feature work. Each step: Goal / Depends on / Build / Done when.

Prereqs assumed done by hand: droplet exists (DO Singapore SGP1, Ubuntu 24.04, the box already
created), domain inkheron.app registered at Porkbun.

---

## Step 1.1 — Point the domain at the droplet
- **Goal:** inkheron.app resolves to the droplet IP.
- **Depends on:** droplet public IP, Porkbun access.
- **Build:** In Porkbun DNS (DNS-only, no proxy), add an A record `@` → droplet IP, and an A
  record `www` → droplet IP. TTL low for now. No Cloudflare.
- **Done when:** `dig inkheron.app` from outside returns the droplet IP.

## Step 1.2 — Base server hardening
- **Goal:** secure baseline.
- **Depends on:** SSH access as root.
- **Build:** Create a non-root sudo user; set SSH key-only (disable password auth); enable UFW
  allowing only 22, 80, 443; `apt update && upgrade`; set timezone.
- **Done when:** you can SSH as the new user with a key; password SSH refused; `ufw status` shows
  only 22/80/443.

## Step 1.3 — Install Node + Etherpad
- **Goal:** Etherpad running locally on the box (not yet public).
- **Depends on:** 1.2.
- **Build:** Install Node LTS. Clone/install Etherpad. Run it on its default local port (9001),
  bound to localhost. Use SQLite as Etherpad's own DB to start (dirty.db is fine for dev; can
  move to better storage later). Confirm it starts.
- **Done when:** `curl localhost:9001` on the box returns Etherpad HTML.

## Step 1.4 — nginx in front with HTTPS + WebSocket
- **Goal:** https://inkheron.app serves Etherpad with working live editing.
- **Depends on:** 1.1, 1.3. THE classic failure point — get WebSocket headers right.
- **Build:** Use the existing nginx instance on the server. Add a server block that reverse-proxies
  to localhost:9001. SSL via certbot (already managing certs for other subdomains). Ensure the
  WebSocket upgrade headers are passed (`Upgrade` and `Connection`) or live editing breaks.
- **Done when:** open https://inkheron.app from a normal browser, type in a pad in two tabs, and
  edits sync live (proves WebSocket works end to end). Padlock shows valid cert.

## Step 1.5 — Reachability from China
- **Goal:** confirm students can actually reach it behind the firewall, VPN off.
- **Depends on:** 1.4.
- **Build:** Test from Chinese mobile data with VPN OFF. Also run 17CE / BOCE / GreatFire checks.
- **Done when:** the site loads and a pad edits live from a China connection without a VPN. If it
  fails, STOP and resolve before building features — nothing else matters if it's unreachable.

## Step 1.6 — Fastify wrapper skeleton
- **Goal:** the platform app that will own identity and wrap Etherpad.
- **Depends on:** 1.3.
- **Build:** Node + Fastify project. One health route `GET /healthz`. Serve a static dir for
  self-hosted assets (fonts, CSS, JS, InkHeron Logo.png). Run on a local port behind nginx. Set
  up the route structure so Etherpad sits at a path or subdomain and the wrapper owns the rest
  (decide: subpath like /pad vs the wrapper proxying — keep it simple, wrapper serves app, nginx
  routes /p/* pads to Etherpad).
- **Done when:** `GET /healthz` returns ok through https; a self-hosted test font loads with no
  external request (check network tab shows no CDN calls).

## Step 1.7 — SQLite schema (platform DB, separate from Etherpad's)
- **Goal:** the platform's own database with the canonical tables.
- **Depends on:** 1.6. Use the EXACT names from CLAUDE.md §4.
- **Build:** Create `data/inkheron.db`. Tables: students, classes, assignments, pads,
  submissions, grades, paste_events (codes/targets/strengths can be added in Phase 7). Add a
  `settings` table (single-row or key/value) for server-side secrets (Phase 8). Write a real
  migration file, not ad-hoc CREATE statements. Add a `teachers` row mechanism (even if one
  teacher) for the admin login.
- **Done when:** migration runs cleanly on a fresh DB and all tables exist with the CLAUDE.md
  field names. Re-running is idempotent.

## Step 1.8 — Backups + basics
- **Goal:** don't lose data.
- **Depends on:** 1.7.
- **Build:** Nightly cron that dumps inkheron.db and Etherpad data, encrypts, and stores them.
  Document restore. Enable full-disk encryption posture as feasible.
- **Done when:** a backup file is produced and a test restore works.

---

**Exit check for Phase 1:** https://inkheron.app loads from China VPN-off with live pad editing,
the wrapper serves self-hosted assets, the platform DB exists with canonical tables, backups run.
Log it in SESSION_NOTES.md and move to Phase 2.
