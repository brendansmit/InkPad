# Session Notes


## 2026-09-03 Cadence widget: two tones

**Asked:** a longer warning tone for a class starting, and a different tone at
five minutes left of a lesson. He asked for two repeats, not the three I had
proposed.

**Length comes from repetition.** Every sound macOS ships is under 2.5 seconds,
Funk longest at 2.16 and Submarine at 1.49, so there is no longer file to pick.
Submarine now plays twice, chained off the `NSSound` delegate rather than a
timer, so the repeat starts when the first actually finishes.

**The end of a lesson is different news.** A start warning is about walking
somewhere, the five minute one is about winding up. So it gets no panel, only
Glass twice, bright against Submarine's low ping. It deliberately does not skip
chained lessons the way the start warning does, because the end of the lesson
you are in arrives whatever comes next. That means it fires for every lesson,
four or five times a day. Flagged to him as more frequent than the start
warning; he wanted it anyway.

**Verified:** silent at ten minutes left, fires at five, exactly one line
across fifty seconds and three redraws, and the start warning still fires
fifteen minutes out. The delegate chain was proven in a separate throwaway
binary, which printed play, finish, play, finish, done.

**Not built:** no config key for the five minute mark or for turning it off on
its own. Both tones sit under the existing `warn_sound`.

**Commit:** `a029435`, pushed.

## 2026-09-03 (last) Cadence: cover notes become a real PDF

**Asked:** the Cover sheet should download as a PDF with the resources attached,
and where a resource is a link, which is most of them because he builds slides
in Canva, the cover teacher should be able to click it. Digital first, paper
second.

**The reported problem was smaller than the real one.** The resources were not
links anywhere. `Cover.tsx` drew the label as plain text and the URL beside it
in a span, so even the printed sheet was a URL you had to retype. Fixed on
screen first, then in the PDF.

**Attach can only mean link.** Cadence stores no files, only labels and URLs, so
there is nothing to embed. Said so before building rather than after.

**Built** `src/lib/coverPdf.ts` on jsPDF, A4, taking a plain `CoverDoc` so all
the derivation stays in the view. Each resource label is drawn with
`textWithLink`, which writes a real `/Link` annotation, and the URL still prints
underneath in grey for anyone holding paper.

**Two bugs found by rendering, not by reading.** A class block that spilled onto
a new page then reached back to the previous page's rail position, leaving one
page nearly blank and pushing the last class off the end. And the "continued"
header left its own font behind mid paragraph, so carried lines came out bold
grey. Both invisible in the code and obvious in the picture.

**No PDF tooling on this Mac,** no pdftoppm, mutool, gs or PyMuPDF. Wrote a
short Swift PDFKit renderer to look at arbitrary pages. Worth keeping in mind
next time a PDF needs checking.

**Verified:** link annotations confirmed structurally in the raw file, two links
for two resources with URLs and none for the one without. An eight class day
with long text renders three pages with all eight links intact. Seven edge cases
render without throwing: closed day, no classes, cancelled, thinned, no lesson
planned, resource without a URL, everything empty.

**Cannot verify:** how the annotations behave in whatever reader the cover
teacher opens the file in.

**Commit:** `6a54161` in Cadence, pushed. Not deployed.

## 2026-09-03 (later) Cadence: make the whole site work on a phone

**Asked:** "cadence is fully mobile friendly ... the timetable is impossible to
use on my phone ... shows two days and that's it and then even if I change it to
landscape mode it's fucked ... everything adjusted according to the screen size."

**Found:** not a bug. Both grids carried `min-width: 640px` with `overflow-x:
auto`, so a phone got two columns and a sideways scrollbar. Scrolling sideways
is not the layout adjusting to the screen. Landscape was worse: at 812x375 all
five days showed but only two periods, because the header and tab bar ate about
160px of a 375px tall viewport.

**Done**, five commits on Cadence `main`:
1. `src/lib/media.ts`, a `useMedia`/`usePhone` hook. A grid cannot become a list
   in CSS alone, so the breakpoint has to be readable from render. Timetable
   below 640px is now a weekday bar plus one day of period rows.
2. Same list for Week, with `collapseFree`: runs of two or more empty teaching
   periods fold into one line, because seven "Free" rows pushed the first class
   of the day off the screen.
3. Curriculum lesson rows: actions wrap to their own line and stay solid, since
   a phone has no hover to reveal them.
4. Landscape. On viewports under 500px tall the topbar, padding and tab bar
   shrink and the tab labels go, giving the grid its height back.
5. Sweep of the rest. Cover toolbar hint hidden, Month event chip clipped with
   a title, Today's objective allowed two lines instead of 150px and an
   ellipsis, tally cards two per row.

**Verified:** screenshots at 375x812 for every view, plus a scripted pass over
all eleven routes checking for elements past the viewport edge. Clean. The
Settings terms table still scrolls inside its card, which is the existing and
deliberate behaviour for a six column editable table.

**Then:** "I still need a view of the week at a glance." Fair. The day list
answered "what am I doing now" and threw away the question a week view exists
for. Week on a phone now has a Glance/Day toggle, defaulting to Glance and
remembered in localStorage. Glance is five days in 341px: a 42px rail with the
period code and start time (asked for explicitly, "I'll need time even if its
just the start time"), and cells carrying only a colour and a class code.
Dropping the lesson title, room and run count is what makes five columns honest
rather than a shrunk desktop grid. Tap a cell to open the lesson, tap a day
header to carry that date into Day. Whole week in 357px of height, 461px with
All periods showing. `useMedia` now also syncs on resize and orientationchange.

**Not deployed.** The cover PDF work from earlier today is also pushed and not
deployed; one `./deploy/deploy.sh` covers all of it.

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
