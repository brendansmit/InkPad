# Session Notes


## 2026-09-02 Cadence: a menu bar widget, and the InkPad link that I broke

**Asked, first:** the InkPad assignments could not be linked to anything. The
modal said "Set up sync first: InkPad is read through your own server."

**Cause, mine:** when the sync key became optional the night before, because the
login session now stands in for it, I updated the sync path and forgot the
InkPad path. `src/lib/inkpad.ts` still refused unless both `syncUrl` and
`syncKey` were filled in, and `syncUrl` is now deliberately blank because blank
means "the server that served this page". The same guard in Assignments.tsx hid
the InkPad button on the cards outright. The live server was configured fine the
whole time.

**Fixed:** both fetches take the resolved base rather than raw `syncUrl`, refuse
only when there is no server at all, send the key header only when there is a
key, and carry `credentials: 'same-origin'`. The server's `inkpadRefused` now
accepts the app's own session, matching what `/state` already did. Commit
`f320b5f`, deployed.

**Asked, second:** a little desktop widget.

**Told him plainly:** a real macOS Notification Centre widget needs an Xcode
project signed with a developer account, and on a free account it stops working
every seven days. He has no account. So a menu bar item instead. He chose that,
and chose next class with time and room, the rest of today, and punch in and out.

**Two server additions first**, both opt in, neither changing what any existing
caller gets:
- `/punch?do=state` says whether you are clocked in and writes nothing. Until
  now `/punch` could only toggle, so the only way to find out was to clock in
  and read the reply, which is not a question, it is a shift.
- `/timetable/occurrences?include_extra=1` stops dropping extra periods. They
  are dropped by default because InkHeron reads that feed to decide where a test
  can go and an extra period is not the next lesson. A widget telling you where
  to be at 11:05 wants the opposite. Every occurrence now carries an `extra`
  flag either way. Commit `246d84a`, deployed.

**The widget:** `Cadence/widget/`, one Swift file built by `swiftc` into an app
bundle. No Xcode project, no signing, no dependencies. `setup.sh` works both
tokens out on the droplet (they are sha256 of `CADENCE_KEY` plus a purpose) and
writes them into `~/.config/cadence-widget/config.json` at mode 600, so nothing
is typed, nothing is printed and nothing secret is in the repo. A LaunchAgent
starts it at login, with KeepAlive off so Quit means Quit. Commit `b96de62`.

**Deploy order mattered:** the widget asks `do=state`, which the live server did
not understand yet and would have treated as a toggle, clocking him in for real.
Deployed the server change before ever running the app.

**Verifying a menu bar:** `screencapture` has no Screen Recording permission
here, so I could not look at it. Added `--once`, which prints the bar title and
the menu lines and exits, sharing the code that draws them rather than copying
it. Against his live data it printed `BAR: EAP 2 · 13:30` with both remaining
classes and room 105, and `do=state` read twice in a row without toggling.

**Two real bugs found by that:** the dump deadlocked because it blocked the main
thread waiting for replies that come back on the main thread, and it reported
"Cadence: set up" because it loaded the config into a local and never assigned
it. Both would have been invisible in the GUI.

**Display only:** his short names carry stray double spaces, so `EAP  3` reads
as a bug in the widget. Whitespace is collapsed for display and never written
back.

**Dismissed, not built:** he dismissed the first pass of these questions, so
nothing was started until he answered them.

## 2026-09-03 — Cadence widget: it disappeared, and why

**Asked:** "The widget was there for a day, now it's gone. I need it to be
persistent like an app until I choose to close it."

**Cause, confirmed not guessed:** `launchctl list` showed exit -11, and two
crash reports carried the same trace, an over-release during an autorelease
pool drain inside `NSApplication.run()`. The second was stamped 07:25:44, about
thirty seconds after the period 1 warning appeared, which is when the panel
dismisses itself. It died on close, not on open. `NSWindow` made in code sets
`isReleasedWhenClosed` to true by default; the panel was also held in a
property, so closing it handed back an object ARC still owned.

**Fixed:** `isReleasedWhenClosed = false` on the panel, and the warning sound
held in a property rather than fired and forgotten, since a local `NSSound` can
be deallocated before it finishes playing.

**A false pass worth remembering:** the first test built for this, 40 rapid
open and close cycles, passed on the broken build too. It pumped its own run
loop, and the crash lives in `NSApplication.run()`'s pool drain, so it never
went near the fault. Said so rather than claiming a fix. The test that works
runs the real GUI with `--at 07:25` and waits past the auto-dismiss: old binary
exits 139, new one is still up at fifty seconds with no crash report written.
That scaffolding was removed before committing, since `--at` already does it.

**Persistence:** LaunchAgent `KeepAlive` is now `SuccessfulExit=false`, so
launchd revives it after a crash and respects Quit, which exits 0. Verified in
both directions, SIGKILL brought it back with a new pid, and a throwaway job
exiting 0 started exactly once in twenty seconds against a five second
throttle. stderr now goes to `~/Library/Logs/cadence-widget.log`.

**State:** one instance running, live data correct, commit `2282861` pushed to
the Cadence repo.

## 2026-09-03 (later) Cadence widget: the second disappearance was width

**Asked:** "It keeps randomly disappearing."

**Not the crash.** The process had been up 2 hours 19 minutes, had sat through
the 09:20 warning that killed it the day before, and had written no new crash
report. So the app was running and only the icon was missing, which is a
different fault from the one fixed that morning.

**Cause, proven by him not me:** the menu bar was full. He removed another icon
and it came back. His Mac has a notch, the item asked for a wide variable title
like `EAP 3 · until 10:15`, and macOS evicts what does not fit. His earlier
"it stays vanished" referred to the crash episode, where the process was dead,
not to this.

**Fixed:** dropped "until" from the title, nineteen characters to thirteen. The
word was redundant anyway, since the green dot already distinguishes being in
the class from waiting for it. Commit `ed5a2f0`.

**Offered, declined:** logging the item's frame on each refresh to catch the
next eviction. His own test answered it, so the instrumentation was not built.

**Still long, not changed:** the post-timetable title `No more classes` is
fifteen characters, now the widest state. Raised, not acted on.

## 2026-09-03 (last) Cadence widget: minutes left, not the end time

**Asked:** he had freed space in the menu bar by removing icons that did not
need to be there, so he did not want the title compressed further. What he
wanted instead was a countdown during a lesson, and the next class as soon as
the current one ends.

**Built:** inside a lesson the bar now reads `EAP 3 · 39 min left` and ticks
down, with `1 minute left` spelled out at the end because "1 min left" reads
like a typo. The second half of the request needed no work, since the widget
already rolls to the next class the moment the current one ends.

**No new timer:** redraw already runs every twenty seconds, which is plenty for
a per minute countdown.

**Checked across a day:** 07:39 amber `EAP 1 in 1 min`, 07:41 green `39 min
left`, 08:19 `1 minute left`, 08:21 amber `EAP 3 in 9 min`, 12:30 `No more
classes`.

**Worth remembering:** `--at` on its own runs the real GUI. Dumping the title
for a given time needs `--once --at 07:41`. Two test sweeps hung before I
noticed I was launching menu bar apps rather than printing.

**Commit:** `6d1ecd9`, pushed.

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

**Commit `7b9e4b9`, pushed.**
