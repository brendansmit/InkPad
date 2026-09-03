# Session Notes


## 2026-08-31 (later) Cadence: the server becomes the home, and cancelling one class

**Asked:** the installed web app on the phone showed nothing at all: no
timetable, no classes. Then, on being told the app is local first with a
background sync, that this is the wrong way round and the server should be
where the work lives. Then separately: an extra AP Lang period tomorrow is not
happening, and there was no way to say so, because "Skipped" is disabled unless
a lesson is attached to that period.

**Why the phone was empty:** an installed home screen app is its own storage
container, so it started empty and had nothing to fill it. The sync address and
key had never been entered on that device, and the key sits behind a password
field on the laptop and could not be read off the screen. Stopgap used on the
night: Settings, "Export a backup" on the laptop, AirDrop, "Import a backup" on
the phone.

**Built, four commits:**

1. `c610329` The server takes the sign in session as an alternative to
   `X-Cadence-Key` on `/state` and on the calendar publish. Not a hole: the
   cookie is SameSite=Lax so a cross site write cannot carry it, CORS answers
   with a wildcard origin so a browser refuses to send credentials to it, and
   `Sec-Fetch-Site` is checked where the browser sends it. A password still
   owed blocks it, same as the app itself.
2. `80e7a72` The app defaults its sync address to `location.origin`, so a fresh
   install has nothing to type. Requests now carry `credentials: 'same-origin'`.
   The key box stays, for a server you are not signed in to.
3. `f970926` It asks the server the moment it opens rather than waiting for a
   pause in typing, and shows "Fetching your work from the server" while a bare
   device waits. Auto sync quiet window cut from 10 s to 3 s.
4. `073f9d9` A quiet light in the sidebar foot: "Saved on the server", or red
   with the reason when it is not reaching it.
5. `8d59859` "This class did not happen", in the class sheet and in the day
   list menu, working with or without a lesson. Underneath it is an ordinary
   cancelling event scoped to one section, one period, one date, marked
   `singleClass` so "Put it back" can only ever remove one of these and never
   an exam built by hand with the same shape. Same commit: the class sheet now
   reads cancellation, thinning and delivery off live state instead of the
   snapshot it was opened with, which is why the sheet used to sit there
   unchanged after you changed something in it.

**Verified** against a throwaway copy of the real server on port 8795 with its
own data directory: no credential 401, session but password still owed 401,
cross site 401, session GET and PUT 200, key without cookie 200. Then in the
browser: sample data pushed to the server with no key set anywhere, localStorage
wiped, reload, and the whole thing came back and was cached locally again. Then
cancelled a normal class and an extra period, both from the sheet and from the
day list, watched the sequence roll forward, and put both back.

**Deployed.** `/health` `{"ok":true,"hasState":true,"size":18330}`.

**Still open:** the parent repo was switched from `rewrite-scoring` to `main`
partway through the earlier session, so the extra periods notes are committed on
`rewrite-scoring` and everything since is on `main`, against a different copy of
this file. Waiting on a decision before moving anything.

**Noticed, not chased:** service worker registration fails in the in-app browser
pane on localhost. It is a pane limitation, not the app, and the installed app
on the phone already has a worker.

## 2026-08-31 (last) Parent repo: session notes moved back to the live branch

**Asked:** confirmation that nobody else was working in `/Documents/Claude`, so
the branch mess could be sorted out.

**Problem:** two session notes commits (`6d5e878`, `6617a8c`) had been made on
`main`. `main` is 3 commits and 319 behind `rewrite-scoring`, which is the live
line of work and the branch every other recent notes entry sits on. `main` also
carries an old untrimmed 640 line copy of SESSION_NOTES.md, so the two files are
different lineages, not the same file at two points.

**Done:** the two entries were lifted out of `main`, `main` was reset back to
`origin/main` at `47ab179`, and the entries were re-appended to
`rewrite-scoring`'s copy. Then the four oldest 2026-08-28 entries moved into
SESSION_NOTES_ARCHIVE.md to get back under the 400 line limit: 484 lines became
388, with 96 lines moved and nothing dropped.

**How, and why it matters:** the branch was rewritten with plumbing
(`hash-object`, `commit-tree`, `update-ref`) against a temporary index, never by
checking `rewrite-scoring` out. A real checkout across 319 commits would have
rewritten hundreds of InkPad files in the working tree, which is exactly what I
am not allowed to do. `git reset --mixed` plus a single-file checkout put `main`
back without disturbing the modified submodule pointers or `.claude/launch.json`.

**Commits:** `bd84aab` and `b73d99a` on `rewrite-scoring`, pushed. Both branches
now match origin.

**Still open:** the working tree is checked out at `main` while the live work is
on `rewrite-scoring`. Anything committed here lands on the wrong branch again
unless the checkout is switched deliberately, with the InkPad files in mind.

## 2026-09-01 Cadence: InkPad linking works again without a sync key

**Asked:** "I can seem to find the way to link the assignments to what is
available on InkPad." The InkPad button had gone from every assignment card,
and reaching the panel the other way answered "Set up sync first: InkPad is
read through your own server."

**Cause, and it was mine.** Last night's change made the sign in stand in for
the sync key, and a blank server address now means "the server that served this
page". The InkPad code was not updated with it: `src/lib/inkpad.ts` refused
unless both `syncUrl` and `syncKey` were filled in, and `Assignments.tsx:448`
hid the button on the same test. Both are now empty in normal use, so the whole
feature disappeared. Nothing was wrong on the InkHeron side: the droplet has
`INKPAD_URL=https://inkpad.inkheron.app` and a token.

**Done:** both fetches take the resolved base from `syncBase()` rather than the
raw setting, refuse only when there is no server at all, and carry
`credentials: 'same-origin'`. The three components in Assignments.tsx (the
button, the link panel, the roster panel) read `syncBase(settings)`.
`inkpadRefused()` on the server now accepts `appSession(req)` as well as the
key, which is the pair `/state` already takes.

**One trap worth remembering:** an empty `X-Cadence-Key` header is not the same
as no header. The server reads a blank key as a wrong key and refuses before it
ever looks at the session, so `keyHeader()` leaves the header off entirely when
there is no key rather than sending an empty one.

**Verified:** a throwaway server on 8796 against a stub InkPad on 8797, with a
fresh data dir so both settings were blank, which is exactly the broken case.
No credential 401. Key only 200. Session only, no key, 200 on both the list and
the roster, which is the case that was failing. Session cookie plus
`Sec-Fetch-Site: cross-site` still 401. Blank key header plus a good session
200. In the browser the InkPad button reappeared, the panel listed the three
stub assignments, linking a section and pulling wrote In 6 and Marked 2, the
card went to "4 to mark", and the moved dates were reported in the toast rather
than swapped in silently. Console clean apart from the known service worker
failure in the preview pane. Live server still answers 401 to both
uncredentialed shapes after deploy.

**Commit:** `f320b5f` on Cadence `main`, pushed and deployed. `/health` came
back `{"ok":true,"hasState":true,"size":19341}`.

**Still open:** the live site password is still `ChangeMe1`.

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
