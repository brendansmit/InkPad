# Session Notes

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

## 2026-08-26 — Cadence: your feedback batch, then live at cadence.inkheron.app

**Asked:** Nine things in one go. Fix the nav bug, stop saying "meetings", number lessons the way I do (week number plus lesson number), give me a running tally of classes held per class, change the urgency marker, flag anything that is about to cost me classes until I acknowledge it, rebalance the Today page, add a work clock with a 40 hour week and room for NFC stickers later, and deploy so my iPhone can subscribe to the calendar. Push to and deploy from git@github.com:brendansmit/Cadence-.git.

**Naming decision you should know about:** "lesson" was already taken. In Cadence a lesson is a piece of content in the course sequence, numbered W3 L2. The thing that happens at a time in a room is now a **class**, which is your own word from "the number of classes I've had per class". So: lessons are what you teach, classes are when you teach them. The week length is read off the timetable, not hardcoded to five, so a course that meets four times a week numbers in fours.

**Order changed:** I moved the Today layout to last, after the tally, the impact banner and the clock existed, rather than building the page twice.

**Done, commit by commit:**
- `a63757d` meetings renamed to classes throughout, and W/L numbering in Curriculum
- `86b111b` "Classes so far", a per section count of classes held, lost and left, with how far behind the leader each section is
- `f546ec7` an impact banner on Today for events that eat classes, which stays until you press "Seen it" and comes back if the event is edited
- `cf514dd` the work clock: arrive, leave, a 40 hour week bar, day bars, forgotten punch repair, and a `/punch` endpoint an NFC sticker can hit
- `14c6ca5` Today rebalanced. The count and the marking list now sit abreast under the timeline instead of everything piling into the right rail
- `1c4d544` deploy script

**Live:** https://cadence.inkheron.app on droplet 2, pm2 app `cadence` on port 3470, TZ Asia/Shanghai (the work clock decides which day a punch belongs to from the server's local date, and a droplet defaults to UTC). Caddy route added to /opt/healthspan/Caddyfile, cert issued, ufw opened to the docker bridge only so 3470 is not public. Key, calendar token and punch token are in /opt/cadence/ecosystem.config.cjs, chmod 600. `deploy/deploy.sh` rebuilds and pushes.

**Deployed by rsync, not git pull:** the droplet has no GitHub key and the repo is private. A deploy key was generated at /root/.ssh/cadence_deploy on droplet 2 and its public half handed over, so git pull becomes possible the moment it is added to the repo's deploy keys. The code deployed is exactly the pushed commit either way.

**Found while there:** droplet 1 is running and inkheron-wrapper is active, but **inkheron.app now resolves to 207.207.210.229 and .107, not 167.172.71.219**. Confirmed from a clean network, so it is not the local proxy. That is why InkPad looks down. It is a DNS record, not a server.

**Test data:** the mock exam event and two fake shifts I injected to see the banner and the week bar were removed from local state before finishing. The app rewrites localStorage on load, so they had to be cleared from the read only Glance route.

## 2026-08-26 (later) — Cadence wiped back to empty, and the to do flag fix

**Asked:** Clear out the classes and content, it was all last semester's and the kids only start next week, so you need a clean slate. Fix the to do list: clicking the flag to change urgency should not shoot the row to a new position mid cycle. The only assignments that exist are two AP Lang essays and one more, on InkPad. Then deploy it, that is what I will use.

**You chose:** wipe absolutely everything, bell schedule included. Not just content: no term, no periods, no timetable slots, no classes.

**Done:** `6a93459`
- `makeEmptyState()` now really is empty. `storage.ts` uses it for a first run *and* as the base `migrate()` fills missing arrays from, which was the real landmine: a saved state missing one array used to get the sample courses back.
- New `src/domain/tasks.ts` holds the to do ordering, because Desk, Today and the store all have to agree about it and the store could not import from a view.
- `setTaskPriority(id, priority, visibleOrder?)` freezes the order on screen in the same mutation that changes the flag, so one undo puts both back. Same rule dragging already had, and "Sort by urgency" still hands the list back to the machine. Wired in Desk and in Today's card.

**Verified:** every view renders empty without crashing, each with its own call to action (Pacing, Curriculum and Classes all offer "Add a course"; Today offers "Open the timetable"). Cycled a flag twice on the bottom row and it stayed put, then "Sort by urgency" moved it, so both halves work.

**Assignments not added, and why:** a Cadence assignment needs a courseId and a section. Wiping everything means there is nothing to attach one to. The three that exist on InkPad are MLK Rhetorical Analysis Essay and Argument Essay - Organ Donation for AP Lang, and Personal Statements Second Draft across EAP 1, EAP 2 and EAP 3. They go in the moment the classes exist.

**Deployed:** live at https://cadence.inkheron.app, opens empty, no console errors. The server had no state to wipe.

**Addendum, same day:** you reported Cadence still loading full. Not a deploy failure, the droplet was serving the right bundle. The empty start only applies to a browser that has never opened Cadence, and yours saved a copy of the sample the first time you opened the link, then loads from that copy. Settings > Start empty clears it. While checking, found that button's confirmation still promised to keep the bell schedule, which stopped being true when I changed the wipe. Corrected and deployed.

---

## 2026-08-26 (later) - Cadence: public holidays and school closures

**You asked:** add "public holiday" to the event Kind list, and add "school is closed" to "What it does to your classes".

**The second one was not a UI change.** Closing a day meant a calendar exception, one record per date, so a three day public holiday was three separate entries and the event you had just made sat next to them doing nothing. A closure is now a fourth event impact and runs for the event's whole date range.

**Where it hooks in:** `effectiveWeekday` in schedule.ts, not the per class checks, because a closed school is the day being gone rather than something done to a class. Everything downstream follows on its own: week grid hatches, month cell greys, workload skips it, pacing rolls lessons forward, the calendar feed drops those classes. A hand written exception on that exact date still outranks the event, being the more deliberate statement. A closed day borrows the event title so it reads "Mid-Autumn Festival" rather than sitting blank.

**Two bugs the new impact would have caused, both fixed:** `pendingImpacts` and `rippleOf` counted the classes an event lands on by planning the days with the event already applied. That works for an event which leaves the classes standing and finds nothing at all for one that deletes the day, so a week long closure would have saved silently with "lands on no classes" in the ripple panel and no warning on Today. Both now count against the world without the event.

**Verified** with a 32 check domain script (in scratchpad, not the repo) plus the browser: 3 day closure closes all 3 days, an exception still wins, ripple reports 10 classes lost, Today reads "Closes the school, taking 10 classes", week and month go closed, the .ics drops those classes and labels the event "(school closed)".

**Also fixed in passing:** the cover sheet for a closed day read "Mid-Autumn Festival There is nothing to cover." The built in label ends in a full stop, an event title does not.

**Decision:** `holiday` and `public-holiday` are separate kinds, not a rename. A school break and a statutory day the whole country takes are different things to plan around.

**Commits:** d39b21e, 6fc9054, 106e97c. Deployed, live bundle index-o-SpCN2W.js.

**Noted while deploying:** the server now reports `hasState: true`, so you have synced at least once, and the calendar feed answers 200 instead of 404.

**Follow up, same day:** the month's "This month" list truncated the event name ("Chinese Nati..."). One flex line in a narrow column, so the "school closed" chip took its width out of the title's. Gave that list its own class rather than changing `.mini-row`, which the ripple panel also uses and where one line is right: title on its own line, chip and weekday underneath, clamped at two lines. Verified at 1140, 768 and full width. Commit c5ffb0f-ish, live bundle index-C5Rk6ZsT.js.
