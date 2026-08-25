# Session Notes

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

## 2026-08-25 (later): Cadence, scope conversation, no code written

**Asked:** an overview of what Cadence does and why runway is counted in meetings; then what would take it to 11/10; then whether InkPad assignment data can feed the calendar. Answered all three in chat, no code changed.

**InkPad feasibility, checked against the source not from memory:** yes. `fetchDashboardRows` in `src/routes/assignments.js:213` already resolves who should submit (`assignment_students` rows if any, otherwise the class roll) and `publicDashboardRow` already derives per student status (`not_started|writing|submitted|marked|green_pen_open|resubmitted`) and `grade_state` (`released` once a pad hits `marked`). A summary endpoint is a tally over functions that already exist and already back the CSV export. Auth is the only gap: InkPad is session cookie plus CSRF (`src/routes/auth.js:85`), so a separate app needs its own read only bearer token. Recommended Cadence's sync server proxy the call so the token never sits in a browser.

**New constraints from Brendan, and they change the design:**
- The school publishes no long term calendar. Events surface one or two days ahead and the semester end is unknown until roughly two weeks out. So a fixed term end is a fiction, and `planSection`'s `slack` (which measures against `termBounds`) currently states a guess as a fact.
- AP Lang has a real fixed deadline and he will supply pacing documents. EAP is open ended, his own curriculum, his own pace. Two different pacing modes, not one.
- G12 disruptions are constant and often partial: SAT, TOEFL, other exams pull some students out, not the whole section. That is not a cancellation and the model has no category for it.
- No Apple developer account, and he does not want Notification Centre or notifications at all (ServerChan on WeChat covers alerts, InkPad already pings on submit). He wants a glanceable panel parked on the second monitor. So: a `#/glance` route, rendered by Ubersicht on the desktop or opened as a chromeless Chrome app window. No signed Swift app needed.

**Decision:** term end gets a confirmed/provisional flag and pacing verdicts must show a range rather than a false number when the end is a guess. Waiting on go ahead before building.

## 2026-08-25 (batch): Cadence, flexible timelines and pacing

Brendan said go on the whole revised plan. Archived everything before 2026-07-08 into SESSION_NOTES_ARCHIVE.md first, notes were at 378 lines.

**Step 1, commit `b9f0bcf`: the time model stops pretending.** Term gains `endConfidence` (provisional by default), `endEarliest` and `endLatest`. Course gains `pacingMode`, `deadline` and `deadlineLabel`. Settings gains `knownGoodThrough`. New `src/domain/horizon.ts` holds every default, so saved state needs no migration and simply reads as provisional and open. Controls live in Settings (term rows get a continuation row for the earliest and latest, plus a "calendar confirmed through" field with a two weeks out shortcut) and in the course editor (mode switch, date, label, and a warning when deadline mode has no date). Verified in the browser: switched AP Lang to deadline mode with a 2027-05-12 AP exam date and confirmed it persisted. Nothing downstream reads these yet, that is step 2.

**Step 2, commit `d6b4ff4`: pacing reads the horizon.** New `outlookFor()` in `src/domain/pacing.ts` measures a section against its course's horizon and reports slack at the earliest, expected and latest end. Three honesty fixes. A deadline past the end of term (AP exam in May) is counted only as far as the schedule actually reaches, because next term's calendar does not exist, and the verdict says how much lands after the break rather than inventing meetings across a summer. An open ended course is never told it will run out of time, only where the sequence lands, and is warned only when the finish needs the term to run long. The runway table changes shape with the course: slack against a real deadline, or the projected last lesson plus how far each section trails the first, which is the number that makes three uneven sections obvious at a glance. Verified both courses in the browser including the overrun warning firing and undo reverting the term edit that triggered it.

**Step 3, commit `7272151`: unconfirmed days are drawn as guesses.** Anything past `knownGoodThrough` gets a faint diagonal hatch in Week and Month (not a grey out, they are real days, they are just not confirmed), a legend swatch on Month, and a quiet line above the week grid saying where the confirmed part stops. Today shows a nudge when the confirmed-through date has gone stale, with a one click "confirmed to <date+14>" button, because a marker nobody moves drags the whole calendar into hatching and stops meaning anything. Verified in the browser: with the date at 8 Sep, September rendered 18 of 25 cells hatched with a clean boundary and August none; with the date pushed into the past the nudge appeared with the correct day count and the button restored it.

**Testing note worth keeping:** writing state straight into localStorage to force a test case does not work. The app's own debounced save overwrites it and the page then renders against unmodified state, which reads as a bug in the feature under test. Drive the real UI instead.

**Step 4, commit `c12cc88`: disruptions with partial cohorts and a ripple preview.** An event can now take students instead of taking the period. `EventImpact` is `none | cancels | thins`; a thinned meeting still happens and you still turn up, but the sequence holds, because nothing new should be taught to a class that is half at an SAT. That category simply did not exist before: the model knew cancelled or normal and nothing between. `eventImpact()` derives the value from the old `cancelsClasses` flag for anything saved earlier, and the editor writes both fields together so they never drift.

New `rippleOf()` in `src/domain/pacing.ts` plans every affected section twice, with and without the draft event, and the editor shows the difference before you commit: meetings hit, meetings lost, and where each section's last lesson moves to. A three day school wide cancellation reads as four rows, Lang +3d, EAP 1 +7d, EAP 2 +7d, EAP 3 +4d. Checked the prediction against reality afterwards: it said EAP 1 would slip 8 Sep to 9 Sep, and after saving the pacing table said exactly that, with meetings left dropping 60 to 58.

`EventEditor` moved out of `Month.tsx` into `src/components/EventEditor.tsx` so a meeting can open it too. That entry point matters: the real workflow is finding out two days ahead while looking at the day, so `MeetingSheet` has a "Something came up" button that opens a disruption already scoped to that date, section and period. A meeting already disrupted shows the reason and offers "Edit the disruption" instead.

Thinned meetings render as a soft amber, never struck through, because they are not cancellations: half dots in Month, an amber cell in Week, a "9 out" chip and the reason in Today. Test event was undone afterwards, state left as found.

**Step 5, commit `97910db`: sync stops destroying the other device.** Push and pull moved the whole state as one blob, so the last device to sync silently wiped whatever the other one had done. Mark a lesson taught on the phone in a corridor, open the laptop that evening, gone. Now every editable record carries `updatedAt` (new `Stamped` interface in `types.ts`), deletions leave a tombstone in `AppState.deleted`, and `src/lib/merge.ts` folds the server copy into this device record by record, newest wins. `syncNow()` in `storage.ts` does GET, merge, PUT in one go. "Sync now" is the button; the two overwrite-everything paths sit behind a fold with a confirmation each, because they are genuinely dangerous now that a real merge exists.

Two rules that matter. An unstamped record counts as never edited, not as edited whenever its copy happened to be written, otherwise adding one event on the laptop refreshes the whole copy and every untouched record on it starts beating real edits from the phone. And a conflict is only counted when both sides genuinely changed the same record since this device last synced, so the number means something instead of firing on every ordinary sync.

Verified two ways. 26 assertions against the merge logic (bundled with esbuild, run in node from the scratchpad, no test harness added to the repo). Then live against a real `server/server.mjs`, simulating the phone by writing to the server directly: the phone's lesson edit arrived, its delivery arrived, its deletion removed the event here, the laptop's own edit to a record both had touched won on time and was reported as a conflict, and a second sync said both copies already agreed. The live run is what caught both of the rules above, after the unit tests had passed. State restored afterwards via the forced pull, sync fields cleared, test server and its data removed.

**Worth doing separately:** those 26 merge assertions live in the scratchpad and will be gone next session. Merge logic is the one part of this app where a silent bug costs real work, so it is the one part worth a permanent test file and a runner.

**Step 6, commit `ba23342`: the glance panel, and a window that stops eating other windows.** `#/glance` is the app boiled down to one narrow read only column: long date and week of term, a hero saying what is on now and how long is left of it (or what is next, or that teaching is done, or that school is closed), any event that costs teaching time, the rest of the day as rows, and a footer with what is waiting to be marked. `desktop/Cadence Glance.command` opens it as its own 420x940 Chrome window with no tabs or address bar. Same Chrome profile as the app, so it reads the same saved data and repaints within a second of an edit made in the main window, which was verified by switching the theme in one window and watching the panel follow.

It runs outside the store deliberately. A panel left open for a week holds a week old copy of everything, and a window that cannot save is a window that cannot flatten a week of work with it.

**No Übersicht widget, and no Notification Centre widget.** A WidgetKit one needs a signed Swift app in Xcode, which Brendan cannot build without a developer account and a web app cannot install anyway. An Übersicht widget cannot read Chrome's localStorage, so it would have to fetch from the sync server and then reimplement the entire timetable engine in the widget to say anything useful. The Chrome app window gives the same panel, live, with nothing to install, so that is what got built. Called out here because the plan said Übersicht and this is not that.

**Two real bugs found while testing it, both fixed in the same commit.** A window left open since the previous session flushed its stale in memory copy over localStorage when it was hidden, and erased a restore that had been verified minutes earlier. That is the same failure as the sync bug, one machine instead of two. Saving now checks what is already stored and, if it is newer than what is about to be written, folds the two together with the same record by record merge the server sync uses. Proved it by writing a repair to localStorage, reloading so the stale window flushed on the way out, and confirming the repair survived. Second bug: the store added `beforeunload` and `visibilitychange` listeners but only removed the first, so a discarded provider kept writing.

Third bug, in Glance itself: when a class was on now, the next one was filtered out of the list but the hero was not showing it either, so the next lesson of the day was invisible. It is hidden from the list only when the hero actually names it.

**Verification note:** to test a time of day that is not now, override `window.Date` in the page and let the panel's own 30 second tick pick it up, or fire a `focus` event to force it immediately. No reload, so the override survives. Checked the hero on now mid lesson, the hero next with four meetings listed, a plain event chip, and a school wide cancellation with every row struck through.

**Step 7, commit `d564a4b`: the timetable as a calendar feed.** New `src/domain/ics.ts` renders state as an `.ics`: every meeting with its lesson title, room and time, school events, no-school days and every assignment due date. A cancelled meeting is dropped rather than struck through, so the day reads as empty with the reason sitting on it as an all day event; a short handed meeting stays and says so in the title. Times are floating local, deliberately, because period 1 is period 1 wherever the laptop is. Settings > Calendar feed has a download button that needs no server, and shows a subscription address once sync is set up.

The app renders the file and the server only holds it. The alternative was reimplementing the timetable, the disruption calendar and the lesson projection inside `server.mjs` in order to say anything useful, which is the entire domain engine in a second language.

Calendar apps subscribe with a plain URL and cannot send a header, so `GET /calendar.ics` takes a token in the query string, `sha256(CADENCE_KEY + ':calendar')` cut to 32 characters. Derived rather than configured, so there is nothing extra to set and it does not give the key away. `PUT /calendar.ics` still wants the real key. Every sync republishes the feed, so a lesson moved here moves in Apple Calendar within the hour.

Verified three ways. 19 assertions against the builder in node (CRLF, 75 octet folding, unique UIDs, all day DTEND exclusivity, cancelled days emitting no class, range filtering, category switches). An independent Python parser unfolded the fetched file and round tripped all 409 events with no malformed lines and no missing required properties. Then live: server up, PUT and GET checked including 401 on a missing token, a wrong token, a wrong key, and a 400 on a body that is not a calendar; then the real Settings UI, where Sync now published the feed, stored the address and showed it. Test server and its data removed, sync fields cleared, state confirmed unchanged at 2 events, 48 deliveries, 36 lessons.

Clearing the server address now also clears the stored feed address, because an address that leads nowhere is worse than none.

## 2026-08-25 — Cadence step 8, commit 3c9436f

**Asked:** continue the agreed build order. Step 6 of the plan: curriculum paste
import, so the AP Lang pacing documents can go in without retyping.

**Did:**
- `src/domain/curriculumText.ts`, a parser with no dependency on the store. Reads
  markdown outlines, numbered lists, bulleted lists, spreadsheet tables (tab or bar
  separated) and week by week pacing guides. Headings from `Unit 2`, `Week 3`,
  markdown `#`, a trailing colon or a shouted line. Objective split on a tab, a bar,
  a dash or a colon. `(2 periods)` or `x2` at the end sets the period count. Header
  rows and stray prose are reported as ignored rather than dropped silently.
- Curriculum > Paste: a live preview modal showing the units, the numbered lessons in
  the order they will land, the objectives, the doubles and the skipped lines. Add to
  the end, or Replace behind a confirm that names how many lessons and how many
  recorded meetings it is about to destroy. Also offered from the empty state.
- 41 node assertions on the parser, all passing, plus a real paste driven through the
  UI: 6 lessons across 2 units, orders continuing from 16, objectives and doubles
  carried, then deleted back out to the original 36 lessons and 10 units.

**Decisions:**
- Where the parser has to guess it guesses towards a lesson. A heading read as a
  lesson is one line to fix; a lesson read as a heading is a lesson lost.
- A table row counts as a list item, so rows pasted under a bulleted section are not
  read as notes on the bullet above.
- A unit whose name already exists takes the new lessons instead of a second unit of
  the same name appearing beside it.

**Bug found and fixed while verifying:** undo has not been saving since step 4. An
undo hands back a state with an older `updatedAt`, and merge on write treated this
window's own last write as a newer stranger, so it merged the undone change straight
back in. The UI showed the undo, storage kept the change, and a reload brought it
back. Two fixes: a write merges only when the stored copy is not the one this window
last saw, and undo now stamps the records it restores so a sync cannot resurrect them
either. Verified by reload.

**Note for the tools:** `cmd+z` sent through the browser pane's key action never
reaches the page. A synthetic `keydown` on `window` does. Plain letter keys work
either way.

## 2026-08-25 — Cadence Desk step A, commits 480373a and 4d3a9ef

**Asked:** a to do list with priorities, a notes/ideas area, and a private
per student log behind a passcode set at login. Then, mid build: green accents
and a more modern but classical diary look.

**Decisions taken before building.** Told him plainly that a passcode with no
encryption is theatre, because the state is one plain JSON blob readable from
devtools, from state.json on the droplet, or from any backup. He chose real
encryption (AES-GCM, PBKDF2 derived key, ciphertext is what reaches storage)
and a per student log rather than free notes. Costs accepted: no recovery if
the passcode is forgotten, no global search, last writer wins across devices.
Building it in three commits: tasks, notes, then the encrypted vault.

**Done, commit 480373a — tasks with a priority.** TaskItem gained priority,
detail and doneAt; a new Note type and a notes collection went into the model,
merge and seed ready for step B. New Desk view at #/desk, key D, in the nav
and the command palette: a composer, a list ordered high first then soonest
due then newest, an editor modal, and a done list with Clear. Today's card
reads the same order, shows the priority stripe and links through.

**Bug found by testing, fixed in the same commit.** The Segmented control had
no explicit button type, so inside a form every click on it submitted the
form. Adding a task with a priority added the wrong task with the wrong
priority. Worth noting: I first assumed the mismatch was my test harness
firing events synchronously and said so. It was not. Adding waits did not fix
it, and dumping the stored records showed a real rotation of values. Check the
data before blaming the tooling.

**Done, commit 4d3a9ef — green ink on ruled paper.** Accent from ink indigo to
bottle green in both themes, faint horizontal diary rules under the content
scrolling with the page, a second green hairline under the topbar and beside
the sidebar, the brand mark off violet, card head icons in accent, neutrals
pulled a shade off orange. Signal colour untouched: late is still red, due is
still blue. Verified both themes in the browser.

**Next:** step B, the Notes tab on Desk. Then step C, the encrypted per student
log. Steps 7 and 8 of the original plan (cover sheet, InkPad marking forecast)
still outstanding.
