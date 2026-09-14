# Session Notes


## 2026-09-04 Cadence: record the slide a class ended on

**Asked:** "I'd like you to add a little feature that allows me to note which
slide I ended on at the end of the class (only when it's the final period for
that class for the day)."

**Done:** `Delivery.endedOnSlide?: number`, whitelisted in `upsertDelivery` or
it would have been dropped silently on write. `lastPeriodKeys` and
`firstPeriodKeys` in `domain/schedule.ts` share one `edgeKeys(classes, dir)`
helper; a cancelled class is never an ending. The Today row offers the field
only on the last period the section has that day, only once it is taught or
part taught, and it sits closed until tapped. The class sheet has the same
field under the same rule. Carry forward shows "last time: slide N" on the
section's first period next lesson, in the class sheet, and on the cover sheet
beside "got to".

**Kept separate from `gotTo` deliberately:** one is a sentence about the room,
the other is a place in a deck the next lesson wants to print as a number.

**Caught in verification, not reported:** the carry-forward line was showing on
both Monday Lang periods, which is why `firstPeriodKeys` exists. Making the row
wrap so the note could take its own line pushed the lesson onto a second line
on a phone, fixed by putting `.tl-main` on a zero flex basis. The modal footer
was also pushing its confirm button 6px off the right edge at 375px.

**Commit `29c470c`, pushed. Not deployed.** The cover PDF, the mobile sweep and
the week Glance are all still waiting on one `./deploy/deploy.sh`.

## 2026-09-04 Widget: a bell at the end of each period

**Asked:** "beep at break time too", then "break time as in the end of a
period", then "make it a 5 second tone", then "that's a horrible sound that
you've chosen sounds like a bomb warning, make it light and friendly and
jingly."

**Done:** `endedIfDue()` in the menu bar widget's `main.swift`, beside the
existing start warning and five minute chime. It cannot use `currentOrNext()`,
which at the moment a period ends already points at the next one, so it scans
`today` for the slot whose end time is behind it by no more than two minutes.
A laptop opened at lunch therefore does not ring out a period that finished at
09:15. Stamped in a set like the other two warnings so the twenty second redraw
rings once.

**The sound is synthesised**, `bellBuffer` into AVAudioEngine. Every sound macOS
ships is a ping under 2.5s and five in a row is a stutter. The first attempt was
a held two partial tone with a tremolo, which was correctly called an air raid
siren. Replaced with a glockenspiel: struck notes, each a fundamental plus
octave plus twelfth on a fast exponential decay, C E G C rising, a turn back
down, then a chord at 3.1s left to ring out so the five seconds end by fading.
Normalised to 0.92 with a 40ms tail fade; measured peak 0.52.

**Verified:** `--wav` probe rendered the buffer to a file for the user to hear.
A `--bell` flag plays it without waiting for 08:20. A trigger probe against real
server data confirmed one bell at end+1 minute, silence 30 minutes later, and
silence one minute early. `build.sh` now links AVFoundation.

Then shortened on request: five seconds was long enough to stop being a bell
and start being a ringtone you learn to resent. The turn back down went, leaving
four rising notes and the chord, 2.6s in total. Played through the speakers with
`afplay` and approved, "yeah that's fine".

**Commits `dc5c9d0` and `723ec40`, pushed.** The user rebuilds and restarts the
widget themselves: `Cadence/widget/build.sh`.

## 2026-09-04 (later) Widget: clock drift, and a quieter chime

**Asked:** "the timer on the widget is off by a couple of seconds, lock it to
the device time maybe to avoid drift", then "also reduce the volume of the end
of class chime by 25% its quite sharp."

**The clock was never wrong.** `now()` reads the system clock every time it is
called. What was wrong was when it got called: the redraw ran off a repeating
twenty second timer anchored to whenever the app launched, so a minute turning
over was noticed up to twenty seconds late, and the end of period bell rang up
to twenty seconds after the bell.

**Done:** a one second tick started on a whole second with `tolerance = 0`, that
returns immediately unless the clock's minute has changed since the last draw,
so it is free fifty nine times in sixty. Nothing accumulates, so nothing drifts.
Both timers also moved to the common run loop modes: in the default mode alone
they stop dead while a menu is open, which is exactly when somebody is reading
them.

**Measured:** redraw landed 2 ms past the minute boundary, twice in a row, at
09:21:00.002 and 09:22:00.002. Before aligning the tick's phase it was 850 ms
late, because it inherited whatever fraction of a second the app started on.

**Chime down 25 percent** via a master gain before the clip guard, peak 0.49 to
0.37. Trigger probe re-run after both changes: one bell at end+1, silence at
+30, silence at -1.

**Then the chime again, twice more.** Turning it down had not fixed the
sharpness because the level was never the cause. First pass: the octave and the
twelfth were being held as long as the fundamental, where a real struck bar is
bright for an instant and then is just the note, so both partials were made
quieter and given much faster decays (`f56949a`). Asked to go further and make
it warmer, so the twelfth went entirely and the whole phrase dropped an octave
to C5, which is the part that mattered: register is what "sharp" means before
the harmonics get a look in. Strike edge 4ms to 25ms across the two passes.
Approved, "yeah that's better" (`1e1017d`).

**Commits `7b9e4b9`, `f56949a`, `1e1017d`, pushed.**

## 2026-09-06 Cadence: an NFC tag on the work clock

**Asked:** what to program onto an NFC tag so one tap checks in and out of work
through Cadence, with a single tag doing both directions.

**Found it already built.** `/punch` has been in `server/server.mjs` all along
and was live on the droplet: GET or POST, its own token derived from the sync
key, and a toggle that looks for an open shift on today's date and closes it or
opens one, exactly the rule `runningShift` uses in the app. I proposed building
it before I read the file. It needed nothing.

**The tag goes under the fingerprint machine at work**, which rules out writing
the URL to it: an NDEF record is readable by any phone that touches it, and the
token is a bearer credential. So the tag stays blank, erased and locked, and the
phone triggers on its factory UID through a Shortcuts NFC automation. Nobody
else's phone does anything with it, and the token never leaves the phone.

**A real bug fell out of it.** Every POST from Shortcuts failed with "the
network connection was lost" while the same URL in Safari worked. Nothing in
`/punch` reads the request body, so the reply went out and the socket closed
under Caddy while it was still feeding the request upstream. `req.resume()`.
curl never saw it because a two byte body is buffered before the reset.

**And the accident case.** Watched four taps land on the live server ten seconds
apart: in, out, in, out, two complete shifts. A reader that takes the same tag
twice in one pass would do that at 07:48 and the day would count as nothing. A
toggle inside two minutes now changes nothing and says "Ignored, you punched
10 s ago." Only the toggle: an explicit `do=in` or `do=out` still works, and
that is the way back out of a punch you did not mean.

**Commit `b36e73d`, pushed, server deployed on its own** (rsync of server.mjs
and a pm2 restart, not `deploy.sh`, so the four undeployed web changes stay
where they are). Verified live: toggle, repeat ignored, POST with a body 200,
forced out works. Every test shift removed with a tombstone in `state.deleted`
so the phone's merge cannot resurrect it.

**Still theirs to do:** the two on-click tags for the desk and the office door,
and `./deploy/deploy.sh` when they want the web changes out.

## 2026-09-07 Cadence: multi period lessons you can change afterwards

Asked for the curriculum to hold lessons that take more than one class, and to
be able to adjust them later without deleting and replacing, because deleting a
lesson takes its deliveries with it and that is the record of what was taught.

The old editor split blindly: asking for 2 classes made a second lesson and put
"(k of n)" in the titles, and nothing but that title related the parts. Growing
a group left the old last part stranded in the sequence, and shrinking was not
possible at all. Worse, reopening a two class lesson read 1 in the field, so
saving it unchanged silently collapsed the group.

**Four steps, commits `2a2cffe` and `29aacfc`, both pushed.**

1. `partOf?: ID` on `Lesson`: every part after the first points at the first
   one's id. `backfillLessonParts` in `storage.ts` adopts the existing
   "(k of n)" titles on load, so nothing already in the data is orphaned.
2. `saveLesson` reconciles the group instead of splitting: the number goes up,
   comes down, or returns to one, and the parts are renumbered to match.
3. A part with anything real written against it is never deleted. Only a
   `planned` delivery with no pin, no gotTo, no notes and no slide is the
   projector's guess and costs nothing; anything else is a class that happened.
   Kept parts leave the group, keep their name, and the toast says so.
4. The editor counts the parts, so reopening a two class lesson reads 2.

**Verified in a browser against a copy of the live state** (pulled read only,
sync key and URL blanked so the dev copy could never push back): grow 1 to 2,
the head keeps its id and its `taught` delivery; reopen reads 2; grow to 3, no
stranded sibling; plant a record on part 2 and shrink to 1, part 3 goes, part 2
is kept with its delivery intact; a legacy "(1 of 2)"/"(2 of 2)" pair is adopted
on load and saving it unchanged is a no-op. Two defects found and fixed this
way: dropped parts left holes in the ordering, and the toast said "they" of one
part.

**Theirs to do:** the three edits in the UI. I deliberately did not write to
their live state: the phone and the laptop hold copies, and a server side edit
behind their backs is how you get a merge fight. `./deploy/deploy.sh` when they
want it live.

## 2026-09-08 Cadence: real week labels, and the morning three tags undid

Two things: the W/L labels in Curriculum were wrong, and this morning's clock
in had come undone by itself.

**The clock in.** The server log told the whole story: 06:54:41 arrived,
06:56:41 left, then two taps ignored inside the window. Three tags on the way
in, and walking past all three at a normal pace put two minutes and no seconds
between the first and the second, one second outside the 120 s double scan
window, so the morning clocked in and straight back out. Restored the shift on
the server so the arrival still reads 06:54 (backup `state.json.preclockfix`),
rather than punching in fresh at 07:15.

A clock was never the right guard. Time at work is: until you have been in for
thirty minutes a toggle is another tag on the way in and changes nothing. Lunch
is hours later and still works, and `do=out` still leaves whenever you mean it.
Proved against a local server across every branch, including the override.
**Commit `0ac365b`.**

Their own ask alongside it: a way to correct a punch by hand. The only time the
app could fix was a shift you forgot to close. Both times now sit under the
punch on the Hours card, click one and pick the time you mean. A shift is never
allowed to end before it starts, and a refusal says why instead of looking like
a missed click. **Commit `2cefb23`.**

**The week labels.** `lessonRef` divided a lesson's position by the classes a
week, which is right only while every week is full. Term 1 starts on a Tuesday,
the Tuesday class was cancelled, so week 1 held three classes and not five, and
every label after it was two out: position 4 read W1 L4 when the lesson was
taught on the Monday of week 2, exactly as they said.

New `lessonWeekRefs` walks the section's real occurrences, cancelled classes
left out because a cancelled class is not a lesson slot, and numbers them by the
week they fall in. A lesson that already has a delivery keeps its date, so
anything pinned or moved by hand is labelled where it really went. The
arithmetic stays as the fallback for a course with no timetabled section, and a
course with two sections is labelled against the one with the most classes a
week. **Commit `6429a6a`.** Verified in a browser against a copy of their live
state: positions 1 to 3 read W1, position 4 reads W2 L1, and the editor
subtitle agrees.

**Deployed**, site and server, `dist/index.html` checksum matched against the
droplet.

## 2026-09-09 Cadence: birthdays

**Asked:** an area to load student and staff birthdays into the calendar, with
the existing ones on admin.inkheron.app pulled across to save time.

**Decided (theirs):** no link between the two, ever. The admin platform is
being merged away and everything on it removed, so this is a one time copy of
the dates and nothing more. They also overrode the usual "no student names in
Cadence AppState" rule **for birthdays only**, on the grounds that a name plus
a cohort plus a year less date is not identifying. That override does not
extend to roster data.

**Built**, four commits:
- `c45e4f7` a `Birthday` record in state, merged like any other collection
- a Birthdays page: search, Everyone/Students/Staff, sorted by how soon it is,
  add and edit and remove. Not in the sidebar; Settings has the door
- import from a JSON or CSV file, duplicates by name plus day skipped, the
  whole file in as one undoable change
- birthdays under the events in a month cell and a card on Today

**Not done and deliberately:** nothing was written into their live state on the
server. Their phone and laptop hold copies and a server side edit is how a
merge fight starts. The 145 exported rows went to
`~/Downloads/cadence-birthdays.json` for them to import once from a device
running the new build.

**Deployed.** Health check green.

## 2026-09-09 (later) Cadence: birthdays that actually show up

**Asked:** the 145 imported and then did nothing. Nothing on the calendar,
nothing in "this month". Then: give them their own tab, and take them out of
Settings, because going via Settings is rubbish.

**Fixed, `9ea2e1b`:**
- **the calendar feed** carries them now, which was the original ask and the
  part that was missing. One yearly all day event each, transparent, no alarm.
  A 29 February goes in dated from a leap year, the only kind of year that can
  hold the date, and the yearly rule does the sane thing from there. On by
  default, and a fourth tick box next to the other three. Every sync
  republishes the feed, so it lands as soon as they open the new build
- **their own sidebar tab**, in the top group under Desk. The Settings card
  that used to be the only door is gone
- **a Birthdays card on Month**, that month in day order
- **a Birthdays card on Week**, the five days on screen

**Verified:** ICS output checked for DTSTART, RRULE and TRANSP including the
leap day, and Month, Week and the sidebar checked in a browser against the
real 145. **Deployed.**

## 2026-09-09 (last) Cadence: a cake, and past birthdays sink

**Asked:** the sparkle icon should be a cake, put it on the calendar next to
the names too, and a birthday that has already been should drop to the bottom
greyed out, because the top of a list means upcoming.

**Done, `70dfbdc`:** drew a `cake` icon (candle, flame, frosting wave) and used
it everywhere the sparkle was, including beside the names in each month cell.
On Month and on Week the ones still to come sort first and anything already
past goes underneath at 45 per cent, titled "Already been". The Birthdays page
itself already sorted by how soon it is, so a past one is a year away and lands
at the bottom on its own. **Deployed.**

## 2026-09-10 Cadence: the Today button stops moving

**Asked:** the `< Today >` row on Today should stay in that shape and not
collapse to two arrows.

**Cause:** `Today.tsx` only rendered the middle button when `!isToday`, so
landing back on today took it out of the row and slid both arrows sideways.

**Fixed, `8cd7f0f`:** always rendered, `disabled` when you are already on
today, titled "This is today". Checked in a browser that every button in the
topbar keeps the same left edge across the change. **Deployed.**

## 2026-09-14 Cadence: make-up lessons on a Saturday or Sunday

**Asked:** be able to add make-up lessons and say which day's schedule they
run, for Saturdays and Sundays.

**Found:** the engine already did it. `effectiveWeekday()` checks a
`follows-day` exception before it checks for a weekend, so a Saturday marked
"runs Tuesday" already generated the whole Tuesday timetable, deliveries,
pacing and the ICS feed. What was missing was any way to see it or find it.

**Done, `22b080c`:** Week worked out five days and stopped at Friday. It now
builds seven and keeps a weekend day only when school actually runs on it, so
a normal week still draws five columns. `.wk` takes its column count from
`--cols` like the phone glance already did.

**Done, `91a33cb`:** Month hid the weekend unless you flipped the toggle. The
toggle now starts on Full week for any month holding a weekend make-up day,
and obeys you again the moment you touch it.

**Done, `78f6fbb`:** the exception editor moved out of Timetable settings into
`components/DayEditor.tsx`, its middle option reworded to "Make-up day, runs
another day's timetable", and Month grew a Make-up day button that opens it
pointed at the coming weekend. Choosing what the day is now names it for you.
Only Monday to Friday can be followed.

**Done, `f39be0f`:** the Today banner named the followed day out of a five item
array and never said "make-up day" on a weekend. Fixed both.

**Checked in a browser** on sample data: Sat 19 Sep following Tuesday and Sun
27 Sep following Wednesday both appear as extra columns in Week, as cells with
class dots in Month, and run real classes on Today with the right banner. A
week with no make-up day still draws five columns and October still opens on
weekdays only. **Deployed.**

No new record type, so nothing to migrate and nothing new in the merge.


## 2026-09-14 Cadence: the app goes and looks instead of waiting to be reloaded

**Asked:** "You've got to fix how slow the time takes us for the working hours
to reflect... I need to reload the entire fucking page sometimes twice just for
a fucking show... they need to be some sort of auto refresh or something with a
mobile version cause it's fucking useless to get anything new or recent. I have
to close the app reopen the app and hope that it's fixed."

**The actual fault:** the app synced three seconds after *you* changed
something, and at no other time. A punch on the work clock comes from the NFC
sticker straight to the server, so this device never went and looked. Opening
the app only synced when the device had nothing on it at all. WorkClock was
never the problem: it already re-renders every 30 seconds.

**Done, `0fd0895`:** `GET /state?meta=1` answers `{mtime, size}` off one stat,
behind the same auth as `/state`. Every writer, the app and `/punch` alike,
goes through `putState`, so the file's modified time is a complete answer. The
PUT reply carries the same mtime.

**Done, `48f5803`:** `syncIfMoved` in storage.ts asks that endpoint and stops
there when the number is the one this device last wrote. The mtime is recorded
from our own PUT, never from the poll, so a poll that then failed to sync
cannot leave the device believing it took in news it never read.

**Done, `cb2e30f`:** every open syncs, bare device or not, without blocking the
app behind the boot spinner. Coming back to the front syncs at once and starts
a 60 second cheap poll, which stops while hidden. The corner dot pulses while
asking and is now a button that syncs on tap and asks the service worker for a
newer build.

**Done, `e10bc61`:** sw.js version to cadence-v3, or `registration.update()`
finds nothing new to install and the old cached shell stays.

**Checked against a real server** (built app, local droplet stand-in, external
`/punch`): the punch showed up in the app about two seconds after the tab came
back to the front, no reload; a poll with nothing changed makes one small
request and writes nothing; the tap pulses, disables itself and syncs. Polling
correctly pauses while the tab is hidden. **Deployed.**

One pull still costs two writes: the merged state is applied, which counts as a
change, which schedules a sync three seconds later. Not a loop, and left alone.
