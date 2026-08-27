# Session Notes

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

## 2026-08-26 (later) - Cadence: terms gate the schedule, and classes that stop

**You asked** to clear the logged sessions between now and 2 September, or
better, to make the term dates actually mean something, because you had set the
term to start on the 2nd and it was still putting classes on today. Then, mid
turn, for a way to log a class you pick up for a while that does not sit in the
timetable forever: a number of weeks it repeats, defaulting to in perpetuity
with the end being the end of the term. You approved both with "go", and told
me plainly: no dates, no from and to, just a number of weeks. Cleaner. You were
right, and I had proposed the worse version.

**Nothing was ever logged.** I said so before building anything. Occurrences are
generated fresh from the weekly pattern on every render, so there was nothing to
clear. The bug was that `effectiveWeekday` looked at exceptions, closures and
weekends and never once looked at `state.terms`.

**Terms now gate the day** (`1897d3f`). A date outside every term closes the way
a holiday does. Three judgement calls in it:

- An app with no terms yet runs everything. A term list nobody has filled in
  cannot mean school never happens, and a blank grid reads as a broken app.
- A hand written `follows-day` exception still outranks the term dates, so a
  make up day scheduled into the holidays runs. One date written by hand is the
  more deliberate statement than a range.
- An out of term day says why: "Before Autumn", "Between terms", "After Autumn".
  A closure already names itself and this deserves the same. Weekends stay
  unlabelled because they explain themselves.

**A slot can run a set number of weeks** (`7d60eea`). Absent means every week for
as long as the term runs, which is what a timetable is. A count means it runs
that many times and stops. In the cell editor it is a **Repeats** control:
*Every week* or *For a few weeks* with a number, and a line underneath saying
what that comes to, "4 times, last on Thu 24 Sep". The weekly grid shows a small
"4 left" on the cell, greyed once spent, because a weekly pattern has no other
way of saying a thing is temporary.

**One thing you should know, since you asked for a number and not a date.** A
count needs something to count from, so the slot quietly stores the week it was
added. You are never asked for it and never shown it. It is worked out as the
next occurrence of that weekday, so a slot added on a Thursday for four Tuesdays
means the next four Tuesdays, not four weeks from Thursday. It is preserved when
you edit, so changing the room of a class in its third week does not hand it
three weeks back. The visible consequence: a count starts from the week you add
it, not from the start of term.

**Class names are bigger and bolder** (`bf18d08`), 14px at weight 700, up from
12.5px at 650. Held at the old size under 900px where five columns leave no room
to grow. The name is what the grid is scanned for; the lesson and the room are
detail you read after you have found the class.

**Verified.** 13 assertions on the term gate and 15 on the week count, run
against the real domain code, all passing. Then in the browser on a seeded state
with a term of 2 Sep to 18 Dec: 24 to 28 August and 31 Aug to 1 Sep read closed,
2 September onward runs classes, Today says "Before Autumn", the Thursday pickup
carries "4 left", editing it to 2 weeks saved and redrew as "2 left", and the
hint tracked the number and the singular. Deployed, bundle `index-HU37D4vI.js`.

**Still open for you.** If you have real `deliveries` records between now and 2
September, the term gate hides the occurrences but does not delete those
records. I cannot see your production data from here. Say the word and I will
purge them.

## 2026-08-28 - Cadence: reminders, and InkHeron wired in properly

**You asked for** reminders with Server Chan attached, InkPad called on for
submission counts, clicking a count to see who has not submitted, and InkPad
"decently integrated". You cut three of my four suggested reminder triggers:
only the one you write yourself against a date. You settled the due date
question: InkHeron wins when it has one, Cadence when it does not. Then "get
going do it all together at once", so it was built as one batch.

**Auto sync** (`3595279`). It used to publish the calendar and push state only
when you pressed Sync. Now it syncs itself ten seconds after the typing stops,
and immediately when the tab is hidden or closed. The server runs the reminders
and hands out the calendar feed, and both are only ever as true as the last
sync, so a sync that waits for a button press means a reminder about a lesson
you moved on Tuesday.

**Reminders** (`5f39216`, `68d74c2`). A task can carry a `remindAt`. The server
checks every minute and pushes to Server Chan, so a shut browser tab is not a
missed reminder. A reminder more than a few hours late is recorded as dealt with
and not sent, because a 3am push about yesterday is noise. Sent ids are kept in
`data/reminders-sent.json` so a restart does not fire everything twice, and the
file is pruned when a task is deleted.

**Server Chan is live on the Cadence droplet.** `SERVERCHAN_SENDKEY` copied
across from the InkHeron droplet's `/etc/inkheron/serverchan.env` and added to
`/opt/cadence/ecosystem.config.cjs`, pm2 restarted from the ecosystem file so it
actually took. Verified end to end: a throwaway instance on a scratch data dir
fired one real reminder and Server Chan accepted it. **You should have a push on
your phone titled "Cadence reminder self test".** That was me. Nothing to do.

**InkHeron's deadline is the deadline** (`ee81f2f`). A pull now reads `dueAt`
off InkHeron and overwrites the Cadence date, using the local calendar day
rather than a string slice, so a 23:59 deadline does not land on the day before.
No date over there leaves yours alone. A date that moved is said out loud in the
toast, because you typed the old one and told a class.

**The marking pile is counted, not guessed** (`b012fa1`). Sections store
InkHeron's own `toMark`. The forecast uses it when it has it and falls back to
arithmetic on the class list when it does not, and the two are told apart on
screen: a `~` in front of the number means part of that week is worked out from
headcounts. Today the two agree by construction, but the assumption is no longer
Cadence's to make.

**Click the count, see the names** (`d92ef3b` here, `e6790c2` in InkPad). New
InkHeron route `/api/summary/assignments/:id/students`: names and one of four
states, nothing else. No words, no marks, no ids. Cadence proxies it through
your own server so the token never reaches the browser. The names live in one
component and are dropped when the panel closes: they are never put in state,
because state syncs, exports and publishes a calendar.

**One bug worth recording.** My first version of the proxy guard returned the
result of a function that returns nothing, so a request with the wrong key got
a 401 *and* was forwarded to InkHeron carrying the real token. Found by testing
it rather than reading it. Now returns an explicit boolean, and 8 test requests
produce exactly 3 upstream calls, all authorised.

**Two things blocking the InkPad half, and they are your call.**

1. The pipe was never configured at either end. `INKHERON_SUMMARY_TOKEN` is
   unset on the InkHeron droplet and `INKPAD_URL`/`INKPAD_TOKEN` are not in the
   Cadence config. Nothing has ever flowed between them.
2. `summary.js` exists only on `rewrite-scoring`. Production runs `analysis-ai`,
   which is 81 files and 5870 insertions behind inside `InkHeron-Platform/`
   alone. Shipping the roster route means cherry picking `30ead82` and
   `e6790c2` onto `analysis-ai`, not merging the branch. I am not deploying the
   platform your students write on without you saying so.

I have left both tokens unset until that is settled, because pointing Cadence at
a route that is not deployed only produces confusing errors.

**Verified.** Typecheck clean. End to end in the browser against a fake
InkHeron: the roster panel read "3 of 6 still to hand it in", grouped Not
started 2 / Writing 1 / Handed in 2 / Marked 1; the forecast showed `~20` for a
mixed week; the pull toast read "Updated 1. InkHeron moved the due date: EAP 1
from 2 Sep to 4 Sep." Deployed to cadence.inkheron.app.
