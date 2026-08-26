# Session Notes

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

**Follow up, same day:** the month's "This month" list truncated the event name ("Chinese Nati..."). One flex line in a narrow column, so the "school closed" chip took its width out of the title's. Gave that list its own class rather than changing `.mini-row`, which the ripple panel also uses and where one line is right: title on its own line, chip and weekday underneath, clamped at two lines. Verified at 1140, 768 and full width. Commit f6de078, live bundle index-C5Rk6ZsT.js.

## 2026-08-26 (later) - Cadence: deleting a timetable version, and finding the bell schedule

Asked for two things: a way to delete a version of a timetable, and "a way to
build a time table with times and periods". Pushed back on the second, because
the Bell schedule tab already is that builder. Confirmed: they had not seen the
tab. So the fix there was discoverability, not a new feature.

Built (commit 91b40e0, deployed to cadence.inkheron.app):

- Delete a version, behind the usual Confirm, on the Grid tab beside the
  version picker. Only offered while a version would survive it: nothing in
  the app makes a timetable from nothing and activeTimetable falls back to
  timetables[0], so deleting the last one would strand the app.
- The date window closes behind a deleted version. newVersion ends the
  previous version the day before the new one starts, so lifting one out
  would otherwise leave dates no version claims, where activeTimetable
  quietly plans the wrong week instead of complaining. The neighbour
  inherits the window, at either end of the list.
- Fixed a pre-existing off-by-one in newVersion, found while testing the
  above: it built the previous version's end date via toISOString, which
  reads a local midnight back in UTC and returns yesterday east of
  Greenwich. Every new version had been leaving a one day hole. Now addDays.
  Same timezone trap that bit my own test script earlier today.
- The Grid tab with no periods drew five day headings over an empty table
  and read as broken. It now says "No bell schedule yet" and offers a button
  straight to the Bell schedule tab. That is what hid the builder.

Verified in the browser on the real data, both delete branches (deleting the
later version, and deleting the earlier one so the survivor absorbs its start
date), then Cmd+Z back to exactly the original single version. Tombstones
recorded, so a sync will not resurrect a deleted version.

Still not approved, do not build unasked: the brighter course colours plan
(bright yellow, green, pink, orange). It needs SectionPill and CourseTag
changed first, because they use the raw course colour as text on a wash of
itself, which only reads because every current palette entry is dark.

## 2026-08-26 (later) - Cadence: 24 hour clock, and the highlighter colour set

**You asked** for two things. First, to change how a period's time reads, from
"7:40 am to 8:20 am" to something more visible. Second, for brighter class
colours: bright yellow, bright green, pink and orange, the ones you actually use
to mark up a timetable.

**Clock, commit 1318a10.** `fmtClock` now writes 24 hour by default and a new
`fmtClockRange` is the single way a span is written, so every screen writes it
alike. The timetable, the week grid, the class sheet and Today all went through
it. In the timetable's period column the time was 11px in the faintest ink,
sitting under the period name like a footnote. It is now 12.5px at weight 550 in
`--ink-2`, with tabular numerals so the colons line up down the column. The am/pm
form is still there behind a flag, unused, in case a printed cover sheet wants it.

**Colours, commit ef11ea5.** You had hard refreshed and said the colours were
not changed. They were not: that job had been planned earlier and never built. I
said so rather than dressing it up.

The reason the palette was ten muted colours is that the app could not safely
draw anything else. `SectionPill`, `CourseTag`, the week grid label and the
curriculum marks all painted the raw hex straight onto text over a 14% wash of
the same colour. That only works while every colour is already dark. A bright
yellow label would have been invisible on a light background.

So the reading problem was fixed first. A new `inkVars` hands an element the raw
colour plus both theme-corrected versions, and a `.c-ink` rule in views.css picks
one. Doing it in CSS rather than JS means an inline style does not need to know
the theme and nothing re-renders when the theme changes.

`readable` had to be rewritten. It clamped HSL lightness, and lightness is not
perceived luminance: a saturated yellow at l=0.40 is still far too bright to read
on paper white, while a blue at the same lightness is comfortably dark. It now
bisects lightness until relative luminance hits a target, leaving hue and
saturation alone so the colour still says which class it is.

Then the six brights went in: yellow, green, pink, orange, cyan, violet. Sixteen
swatches now, wrapping onto two rows in the Course modal.

**Decision: verified numerically, not by eye.** I wrote a throwaway script that
composites the wash over each theme's real surface and checks the WCAG ratio for
every palette colour at section tints 0, 1 and 2. First run reported 38 failing
combinations, including the bright yellow at 4.72:1 and a scatter of muted tints
between 4.1 and 4.49. I retuned the luminance targets and ran it again: 96
combinations, zero failures. Then checked it visually in both themes with AP Lang
temporarily set to bright yellow, and put it back to its original colour.

**A real bug found on the way, in commit 91b40e0.** Testing that a version delete
closes the date window behind it turned up an older fault in `newVersion`: it
built the previous version's end date by reading a local midnight back out in
UTC, which east of Greenwich returns yesterday. Live, a version starting 26 Aug
had closed the one before it on 24 Aug, leaving 25 Aug claimed by no timetable at
all. `activeTimetable` silently falls back to the first timetable across a hole
like that, so it would have planned the wrong week without ever complaining. Now
uses string arithmetic and writes 25 Aug.

**Your existing courses were not repainted.** This adds options.

Both commits are live at cadence.inkheron.app, bundle index-C1iEAl9F.js, and
pushed to origin/main. Console errors seen during the session were Vite HMR
double-mount noise from many hot edits; a clean production build is silent.

**Still waiting on you:** the three InkPad assignments (MLK Rhetorical Analysis,
Argument Essay - Organ Donation, Personal Statements Second Draft) cannot be
added until your classes exist again, because an assignment needs a course and
sections to attach to. Say the word once they are in and I will add them.

## 2026-08-26 (later) - Cadence: a section holds its own colour

**You asked** to change the Shade slider to a hex code input, and when I asked
whether to keep the tint mechanism as a fallback you said migrate it out,
otherwise it gets cluttered. Commit eaeb63d, deployed, bundle index-ZYu7xIIR.js.

A section used to carry a `tint`, a number from 0 to 1, and its real colour was
computed from the course colour on every render. The slider set that number. A
hex is not a distance from anything, so the section needed a colour of its own.

**What the field is now.** A hex text box, a native colour well beside it so you
can point instead of type, and the same sixteen swatches the Course editor
offers. A bare "ffd400" works, so does the three digit shorthand. Half typed
text is left exactly as typed rather than rewritten under the cursor, and
applies nothing until it is a whole colour.

**Decision: unset is still a real state.** It means "wear the course colour",
and it is not the same as a hex that happens to match, because unset follows if
you ever recolour the course and a pinned hex does not. So a tint of zero
migrates to unset rather than to a copy of the course colour, and both the
migration and the editor fold a colour identical to its course's back to unset.
"Match the course" is the way back by hand. I caught this on the first run of
the migration, where Lang and EAP 1 had been given pinned copies of their course
colours, which would have quietly broken recolouring later.

**The migration lives in `migrate` in storage.ts**, so it covers a sync pull and
an imported backup as well as a local load, not just this machine.

**A new section still starts a step round the wheel** from its course, so the
second and third class of a course can be told apart at a glance. That is now
baked in once at creation rather than derived forever, which leaves it free to
be overwritten. `sectionColour` survives only for that and for the migration.

**Verified on your real data.** Lang and EAP 1 are unset and follow their
courses, EAP 2 kept #4c7085 and EAP 3 kept #5c669b, which are the exact hexes
their old tints of 0.5 and 1 were already drawing. No `tint` survives anywhere.
Set EAP 2 to bright yellow by typing the hex, confirmed it flowed through to the
week grid and stayed legible, then undid it.
