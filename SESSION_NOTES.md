# Session Notes

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

## 2026-08-25 — Cadence Desk steps B and C, commits 1ab96eb, 48b3bb1, 68f1818, 350557c

**Done, commit 1ab96eb — the Notes tab.** Jot box at the top, cards below,
pinned first then most recently touched, editor in a modal. The editor keeps a
local copy and writes on blur, on Done, on close and on unmount rather than on
every keystroke: every store mutation is an undo step, and a long note typed
straight into the store would bury an hour of real work under hundreds of them.
Caught before shipping that Escape closes a modal without blurring, so the
original LazyInput version would have lost the last thing typed.

**Done, commit 48b3bb1 — the private log, crypto and plumbing.** Passcode goes
through PBKDF2-SHA256 at 250,000 rounds to an AES-GCM 256 key; the key seals
the whole log in one box; the box is what sits in localStorage, in state.json
and in every backup. AES-GCM authenticates, so a wrong passcode fails to
decrypt rather than producing plausible rubbish, and no separate verifier is
needed. Merge treats it like settings: neither side can read it, so the later
write wins the lot. A destroy leaves a tombstone at `vault:one`, because a
stale phone quietly resurrecting a deleted private log is the worst thing this
feature could do. Node tests over the bundled module cover create, right and
wrong passcode, tampered ciphertext, nonce freshness, rekey, and nine merge
cases; all pass. Tests live in the scratchpad, same as the other three.

**Done, commit 68f1818 — the UI.** Settings holds a Private log card that sets,
changes and destroys the passcode; the Desk holds a Private tab with the door
and, behind it, students with dated entries, a class chip kept inside the box,
and a Lock button. Two things the browser taught me that reasoning had not:

- Writes have to go through a queue. Sealing is asynchronous, so three entries
  typed in the same breath all read the same copy and the last one silently
  threw the other two away. Reproduced it, fixed it, reproduced the fix.
- My first "somebody else changed this box" check locked the log every time
  you typed, because the render between sealing and the state catching up looks
  exactly like a stranger's box. It now remembers every box this tab wrote.
  Verified the real case with Cmd Z, which swaps the box under an open session:
  it locks and says so.

Verified in the browser end to end: passcode too short, passcodes not matching,
wrong passcode, right passcode, add and edit and delete entries, delete a
student, assign a class, lock, full page reload, change passcode with the old
one rejected and the contents intact, destroy with the tombstone written, and
both themes. At no point did any student name or entry text appear in
localStorage. Test data cleaned up afterwards; the app is back to no log.

**Decisions accepted by you up front:** real encryption over a passcode gate,
per student log rather than one running diary, and the three costs that come
with it (no recovery, no global search, last writer wins between devices).

**Also documented:** README now has a Desk section and a private log section
saying plainly what it costs, including that WebCrypto needs https or
localhost, so a droplet on plain http cannot open the log.

**Next:** step 7 of the original plan, the cover sheet. Then step 8, the InkPad
link and marking forecast.

## 2026-08-25 — Cadence step 7, the cover sheet, commits e0fe4d6, f75ee8e

**Asked:** "go do whatever you can next", taken as the batch go-ahead for the
remaining plan steps.

**Built:** the cover sheet. `#/cover?date=YYYY-MM-DD`, opened by a Cover button
in the Today header in its own tab. One printable page per day: every meeting in
period order with time, room, class size, the projected lesson, its aim,
activities, homework, materials with links, what to collect or hand out, and
where the class got to last time. Cancelled meetings say so and stop, thinned
ones warn against teaching new material. Duties, calendar events and the day
note follow. Read only and outside the store, same reasoning as Glance: a
document you print must not be able to write state back.

**Decisions:** forced light theme (nobody prints a dark page); the title is set
to `Cover notes <date>` because browsers name the PDF after it, and restored on
the way out; work handed out or collected prints once per class per day rather
than once per meeting, and never against a cancelled meeting.

**Two bugs found by testing in the browser and fixed before commit:** a class
that meets twice in one day printed "hand out" twice, and once the first meeting
of the day was cancelled the hand-out vanished from the sheet entirely.

**Verified:** typecheck and production build clean, no console errors, and the
sheet rendered correctly for a normal day, a thinned day, a cancelled period, a
day with materials and a day note, and a closed weekend. Test data was written
into localStorage and removed again afterwards, byte for byte back to 26194.

**Next:** step 8, the InkPad link and marking forecast.

## 2026-08-25 — Cadence step 8, the InkPad link and marking forecast, commits 234c4d9, 30ead82, c577939, 754bdf9, 706267d, 38b0d3d

**Asked:** "go do whatever you can next", still running under the batch
go-ahead. This closes the last of the eight plan steps.

**Marking forecast (234c4d9, Cadence):** `markingForecast(state, from, weeks)`
in the domain layer, shown on Assignments. It counts what is waiting per
section, spreads it over the weeks ahead by due date, and says which weeks are
heavy. Status stays a judgement, so nothing here changes it.

**Summary endpoint (30ead82, InkHeron):** `GET /api/summary/assignments`, new
`src/routes/summary.js`, 7 tests in `test/summary.test.js` all green on node 24.
Counts only: students set, not started, handed in, marked, waiting, plus the
raw pad states. No names, no essay text, no marks. Demo and ghost students are
excluded through `realStudentsWhere`, and `assignment_students` overrides the
class roster when rows exist for that assignment.

**Decisions on the endpoint:** counts only, so a leaked token leaks titles and
tallies and nothing about a student; fail closed, so with
`INKHERON_SUMMARY_TOKEN` unset the route 503s to everybody including a
signed-in teacher; missing, malformed and wrong tokens all get the same 401;
and the comparison is on SHA-256 digests rather than the raw strings, because
`timingSafeEqual` throws on a length mismatch and the token's length is not
something a caller should be able to measure.

**Cadence proxy (c577939):** `GET /inkpad/assignments` on the sync server. The
browser asks the sync server, the sync server asks InkHeron. The token sits in
`INKPAD_TOKEN` on the server and never reaches a page. Only `class_id`, `limit`
and `include_archived` are passed through, so nothing a page puts in a query
string can be aimed at anything else over there. Upstream failures are reported
without echoing the request, since the token is in it.

**Cadence app (754bdf9):** `src/lib/inkpad.ts` plus an InkPad button on each
assignment card. The modal lists sections against InkHeron assignments, offers
`Match by title`, and `Pull counts` writes In and Marked. `inkpadId` is per
section, not per assignment, because one Cadence assignment spans several
sections while an InkHeron assignment belongs to one class. Matching is offered
rather than applied automatically: a title alone cannot tell which class copy
belongs to which section, and a wrong guess pulls the wrong numbers. A pull
never touches the status column. A class of nobody is not believed, so
`expected` is only overwritten when the far side reports students.

**Docs (706267d, 38b0d3d):** Cadence README gained the two env vars, the route,
a marking forecast section and an InkHeron counts section. `deploy/DEPLOY.md`
gained a summary token section: what the endpoint hands out, that it is off
until the variable is set, how to generate and revoke it, and how Cadence
consumes it.

**Four bugs found and fixed before commit:** `Failed to fetch` and
`fetch failed` were both surfaced to you as-is and now say where the request
was going and why it failed; a dangling `inkpadId` rendered the section select
blank, so it now shows `gone from InkPad`; and a dead SQL helper using
`LATERAL`, which SQLite does not have, was removed.

**Verified end to end** against a seeded InkHeron on 8791 behind the proxy on
8792: counts through the proxy 200, no key 401, wrong upstream token 502 with
the upstream reason and no echo, unreachable droplet 502 ECONNREFUSED, nothing
configured 503. In the browser: options populated, Pull disabled at zero links,
Match by title filled all three sections, Pull wrote 4/4, 3/1, 2/1 matching the
server exactly, the header chip went 12 to mark down to 3 and the forecast
recalculated, a second pull said already up to date, and deleting an InkHeron
assignment produced "Pulled 0. 1 linked to work InkPad no longer lists." with
that section untouched. Your own state was restored afterwards and diffed:
only timestamps differ. The 10 second proxy timeout branch is written but was
not exercised.

**Not deployed.** The summary endpoint is committed but the droplet has not
been touched and `INKHERON_SUMMARY_TOKEN` is not set anywhere. Deploying is
your call.

**Next:** the eight step plan is done. Suggested separately, not built: the
Cadence merge, ics, curriculum, vault, forecast and inkpad tests currently live
only in a scratchpad and should become a real test file with a runner.

---

## 2026-08-25 (later) - Cadence to do list: urgency lights and drag to reorder

**You asked** whether the widget work was actually finished and easy to use, and
after that: make the to do list adjustable in urgency, draggable to rearrange,
with a traffic light system. You said go on the plan.

**The audit first.** I drove the browser rather than opining. Five findings, one
of them a real code bug: Desk does not light the More tab on mobile
(App.tsx:161), Glance goes empty after the last lesson of the day, the Needs you
titles truncate hard, and the Cadence tests still live only in a scratchpad. All
suggested, none built.

**Built, in three commits on the Cadence repo:**

- `af8b3a9` traffic light and drag. A red, amber or green dot on every task,
  click cycles it in place, no modal. The word is on the tooltip and the aria
  label too, so the light is never colour alone. Rows drag by a grip using
  pointer events, with arrow keys on the grip doing the same move from the
  keyboard. No drag library: React is still the only runtime dependency.
- `cbc6cf7` Today's card gets the same dots and follows the same order. One sort
  function now, not two, so the two surfaces cannot disagree. Deliberately not
  draggable: it shows the top eight of a longer list.
- `ead497d` touch fixes, below.

**The decision that mattered.** Auto sorting and hand sorting cannot both be
true. Once you drag anything, your order wins and stays won, the light becomes a
tag rather than a sorter, and a Sort by urgency button hands it back to the
machine on request. Reasoning is in the Desk.tsx header comment.

**Two real bugs found by testing, not by reading.** The drop handler read the
drag from a render closure, so a drag that started and finished inside one frame
did nothing; it now lives in a ref. And the grip was hover revealed and 18px
wide, meaning invisible and unhittable on the phone layout the pointer events
existed for in the first place. A refused `setPointerCapture` also used to kill
the drag outright and now degrades to an uncaptured one.

**Verified** in the browser on both viewports: drag reorder, keyboard nudge,
dot cycling, the sort button, the colours against the dark tokens, and a touch
pointer drag under mobile emulation. Typecheck and production build clean. Your
two real tasks were used as the test fixtures and were restored afterwards to
their exact original shape, no priority and no order, and diffed to confirm it.

**Still not deployed.** The InkHeron summary endpoint remains committed and
untouched on the droplet.
