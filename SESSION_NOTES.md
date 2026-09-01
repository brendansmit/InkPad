# Session Notes


## 2026-08-28 (later still) - Cadence: the calendar feed stops shipping your timetable

**Asked:** "Fix the calendar part, i subscribed and then it populated my iphoe
calendar with all my periods and classes. I only want events that are added to
be included in the subscription calendar, not classes, events and then
assignments maybe."

**Cause:** `publishCalendar` called `buildICS(state)` with no options, and the
library defaults in `src/domain/ics.ts` say `classes: true, events: true,
due: true`. Nothing had ever set them. The live feed on the droplet held 417
entries, 5 of them due dates, so the rest were periods.

**Did:** `Settings` gained `feedClasses`, `feedEvents` and `feedDue`, all
optional. A new `feedParts()` in `ics.ts` resolves them, and both the published
feed and the Download .ics button read it, so the two can never disagree. Unset
means classes off, events on, due dates on: a file you download on purpose may
as well hold everything, but a subscription lands in the calendar you already
live in. Three tick boxes on the Calendar feed card, and a line that owns up
when all three are off.

**Verified** in the preview on the sample data, by intercepting the blob the
download button builds and counting `SUMMARY:` lines. Defaults: 9 entries, 7
due dates and 2 events, 0 classes. Classes ticked on: 297, of which 288 are
classes. Events only: 2. All off: 0, and the empty warning shows. Back to
defaults: 9 again. `tsc --noEmit` and `npm run build` clean.

**Commit:** `c8be40b` on Cadence `main`, pushed and deployed. `/health` came
back `{"ok":true,"hasState":true,"size":16545}`.

**Left for you:** the .ics sitting on the droplet is still the old 417 entry
one. The server only holds what the app last published, so open Cadence once
and let it sync, and the feed shrinks on its own. Apple then re-checks about
hourly. If the classes are still there tomorrow, delete the subscription in
Calendar and add it again.

## 2026-08-29 InkHeron: green pen tally, no auto AI, Run check, live cleanup

**You asked** for four things: check nothing broke, stop copying the marks onto
the green pen rewrite, move the AI off submit and behind a button you press
once the whole class is in, and look at whether a newer model beats the current
one at a similar price.

**Done, five commits on rewrite-scoring:**
- `df059d6` rewrite pads no longer inherit the literacy marks. Comments and
  feedback still copy across, which is what you asked to keep.
- `cae1555` grammar tally on the rewrite: errors in draft 1, how many were
  fixed, how many are new. Fixed comes from the existing diff gated
  implementation score, so it means the same thing as the rest of the app. New
  counts only marks landing on text the student actually changed. Fixed shows
  `--` until the check has run.
- `895eb45` submitting runs nothing but style metrics. No AI on submit at all.
- `83b482e` Run check: a real background job in a new `ai_check_runs` table,
  with an X of Y progress bar and the name of the student being marked. Close
  the tab and walk away, the run keeps going and the page picks it back up when
  you return. A restart marks the run interrupted rather than lying about it.

**Tests:** 269 total, 268 pass. The one failure is the EAP library admin test,
which already failed at the commit I branched from. Not mine.

**Live cleanup, done on the droplet:** backed the database up first
(`data/backups/inkheron.db.pre-cleanup-20260829-023011`, plus the deploy's own
backup), deployed, then deleted the 2099 copied marks off the 49 rewrite pads.
The 82 marks actually made on rewrites were kept, all 36 comments kept, all 49
rewrite texts untouched, no orphaned evidence rows, no student profile stats
affected because none of the copies ever owned one. Server healthy after.

**Model:** staying on Kimi K3. It is $3.00/$15.00 per million and the priciest
in its bracket, and the literacy pass is output heavy so that hurts most, but
the same family half steps are k2.6 ($0.95/$4.00) and k2.5 ($0.60/$3.00) and
dropping reasoning is the wrong trade while the gold standard set is still
thin. Now that Run check gives you identical batches on demand, the honest
move is to A/B them on one real class later rather than guess.

**Flagged:** InkHeron-Platform is not its own git repo. It sits inside the
`Claude` monorepo, so every commit here needs an explicit path. The monorepo
split missed it.

## 2026-08-29 (later) InkHeron-Platform extracted into its own repo

**You asked** me to fix the repo situation I flagged: InkHeron-Platform was
still tracked inside the InkPad monorepo.

**Done:**
- Subtree-split the folder's full history (599 commits on rewrite-scoring,
  286 on main) and pushed both branches to a new private repo,
  github.com/brendansmit/InkHeron-Platform, default branch rewrite-scoring.
- Untracked the folder from InkPad and gitignored it. InkPad now holds only
  the root docs (session notes, handoff guides, README).
- The local folder is now its own repo tracking the new remote, working tree
  identical, status clean.
- Deploy updated: deploy.sh app subdir is now the repo root, DEPLOY.md clone
  URL updated. The droplet's key turned out to be an account-level GitHub key
  so it could already reach the new repo. Re-cloned /opt/inkheron-repo from
  the new repo, fixed the /opt/inkheron-platform/deploy symlink which pointed
  at the old subdir path, deployed. Healthy at c3cb808.
- Old droplet clone kept at /opt/inkheron-repo.inkpad-old as a fallback.
  Delete it once a normal deploy has gone through from the new repo.

**Note:** future InkHeron commits go to the InkHeron-Platform repo. Session
notes stay here in InkPad.

## 2026-08-30 InkHeron: green pen pad health check after Alex's blank screen

**You asked** me to check all the pads are healthy, especially green pen, after
Alex got a blank white screen, and to fix whatever I found.

**Every server side check came back clean:**
- All 49 green pen rewrite pads render through the real view function with
  valid inline JavaScript. Nothing throws, nothing produces a broken page.
- All 109 pads have valid document JSON, no stray script close tags, no raw
  U+2028/U+2029 characters.
- All 49 rewrites still resolve to their original pad and its marks, so
  yesterday's mark cleanup did not cost anyone their feedback.
- Zero 500s in four days. Every static asset and the offline page return 200.
- Alex's own page serves 200 with his full essay and feedback payload.

**The bug I found and fixed (commit 9ba253e, deployed):** the service worker.
A failed navigation responded with `caches.match('/offline')`, which resolves
to undefined when that page is not in the cache. `respondWith(undefined)`
makes the browser paint nothing, which is the blank white screen. Browsers
evict caches under storage pressure, and install used `addAll`, which throws
away the whole batch if one asset fails, so an empty cache was easy to reach.
Now it falls back to a built in offline page, caches assets individually, and
the cache name is bumped to v2 so broken caches get dropped. Four regression
tests, verified failing before the fix.

**Honest caveat:** I could not reproduce Alex's screen directly. His IP is a
Chinese mobile carrier, and a dropped request on that connection hitting the
undefined fallback fits the symptom exactly, but this is the best fitting
cause rather than a confirmed one. If it happens again, ask him to note
whether he had signal, and whether "Try again" now appears.

**One thing for you, not a bug:** Chris's green pen rewrite (pad 76, from
pad 44 on assignment 11) opens with an empty feedback panel. His original is
marked but has no marks, comments or feedback items on it at all, and the
essay is only 568 characters. Nothing to rewrite against. Worth a look.

**Tests:** 273 total, 272 pass. The one failure is still the pre-existing EAP
library admin test.

## 2026-08-30 (later) Investigation only: targets and strengths missing when grading a rewrite

**You asked** why you cannot see the strengths and, more importantly, the
targets when you review and grade a green pen rewrite. You asked me to look
but not change anything, since you are implementing tonight.

**Cause.** The review endpoint builds the feedback rail from
`loadFeedbackItems(db, padId)`, where padId is the REWRITE pad. Feedback items
are never copied onto a rewrite. Comments are copied, feedback items are not.
Live data confirms it: 242 feedback items sit on the original drafts (145
targets, 97 strengths) and exactly 0 on the 49 rewrite pads. So "Strengths and
targets" renders empty with just the add row.

The only place a target appears on a rewrite today is inside the "Green pen
result" card, and only after Run check has scored it. Before you run the
check you are grading with no sight of the targets at all.

**Plan, four small steps, a commit each:**

1. Server, `src/routes/nativePads.js`: add `loadRewriteSourceFeedback(db, pad)`
   next to `loadRewriteErrorTally`. Returns null unless `pad.rewrite_of_pad_id`.
   Otherwise reads `native_feedback_items` for the ORIGINAL pad, splits into
   targets and strengths, and merges the AI verdict per target. The scorer
   already stores `targets: [{id, title, addressed, score, note}]` in
   `implementation_scores.addressed_json`, and that `id` is the original's
   feedback item id, so the merge is a clean join on id, no title matching.
   Carry `student_checked` through as well, since that is the student claiming
   they did it and you want to check that claim. Expose as `draft_feedback` in
   the review payload beside `rewrite_error_tally`.

2. Client, `public/teacher/native-review.html`: a new read-only rail card,
   "From draft 1". Targets first, then strengths. Each target shows title,
   explanation, the try-now prompt, whether the student ticked it, and once
   scored a /10 pill plus the AI note. Put it directly under the grammar tally
   and above "Green pen result", and give it a link to open the original.

3. Same file: drop the per-target list from "Green pen result" so targets are
   not listed twice on one screen. That card keeps the verdict, the ratios and
   the summary.

4. Tests, `test/greenpenReviewUx.test.js`: a rewrite carries the original's
   targets and strengths; an ordinary essay has no `draft_feedback`; verdicts
   merge onto the right target by id; the student tick state comes through.

**Leave alone:** the existing editable "Strengths and targets" card. That is
for feedback on the rewrite itself and it is bound to the rewrite pad id, so
pointing it at the original would make the delete and add buttons write to the
wrong pad. The new card is read-only and separate.

**Main win:** the targets become visible before Run check, not only after.

---

## 2026-08-28 (later again) - Cadence: a standing note on a timetable slot

**Asked:** "When I add a class to the schedule, I want to be able to add an
additional note too. Set that up."

**Found:** `Slot.note` had been in the type since the beginning and was
carefully carried through every save in the slot editor, but no input ever set
it and no view ever read it. A dead field waiting for this.

**Decision:** the note belongs to the slot, so it stands every week the class
runs. The day note on Today already covers the one-off case and was left alone.
Told you the assumption rather than asking.

**Did:** a Note field in the slot editor, for a class or a duty. `dayPlan`
copies `slot.note` onto the occurrence and the duty occurrence, one place, so
every reader sees the same field. Shown in five places: a glyph on the
timetable cell with the text on hover, a line under the lesson on Today, the
same for duty rows, the hover title on a Week cell, in full above the lesson on
the class sheet, and in the calendar description for that class.

**Verified** in the preview on the sample data. Saved a duty note and a class
note through the real dialog; both landed on the right slots and both glyphs
appeared with the right hover text. Week's hover carried lesson and note on two
lines. The class sheet read "Every Monday / Half the group is at band". The
.ics carried the note on all 19 occurrences of that slot. Today was checked by
faking the clock to Monday 24 Aug in the page, which rendered both the duty note
and the class note, then the clock was put back and the sample reloaded.
`tsc --noEmit` and `npm run build` clean.

**Commit:** `05d2757` on Cadence `main`, pushed and deployed. `/health` came
back `{"ok":true,"hasState":true,"size":16675}`.

## 2026-08-31 Cadence: extra periods, a class slot the sequence never lands in

**Asked:** the note should be visible in the timetable, and the real use is an
additional period with one class for a few weeks or the whole semester. Added as
a normal lesson there is no way to tell it apart. Then: put the extra periods in
brackets next to the number of periods left, because that helps pacing, but it
must not be an official pacing thing.

**Built:** a third slot kind on the timetable, `Extra period`. It picks a
section, keeps the class colour, carries its own short name (Support, Writing
clinic) and is drawn with a dashed border. The note added last session now
reads as text in the cell rather than hiding behind a glyph.

The whole point is that it is not one of that class's lessons, so it is kept out
of every figure that decides something:

- the lesson projector in `planSection` skips it, so nothing lands there on its own
- `remainingClasses` and `slack` exclude it, in `planSection` and again in
  `openClassesUntil`, which `outlookFor` uses to overwrite both
- `weeklyLoad` does not count it, so a week does not look a period longer
- `classTally` counts it in its own field, out of held, lost and left, so a
  section cannot look ahead of its parallel section
- assignment runway (`nthClassAfter`, `classesBetween`) does not count it as
  teaching time, so a due date is not set a class early
- an event that lands on one is not reported as a lost lesson

What it does instead is show as a dimmed number in brackets beside the real one:
Pacing table `62 (+16)`, Today's tally `62 left (+16)`, with the breakdown on
hover. Today, Week, the class sheet and the .ics all wear its name instead of
saying no lesson is set. Record a lesson in one by hand and it counts like any
other class.

**Caught in verification:** the first run showed classes left jumping 62 to 78
and slack 58 to 74 after one extra slot was added. `outlookFor` recomputes both
from `openClassesUntil`, which had no idea about extras and was overwriting the
filtered figure. Fixed there, and `extraClasses` is now counted over the same
window so the bracket and the number beside it talk about the same stretch of
the year. `nextClass` also had to skip extras, or Pacing reported the next
lesson as unplanned.

**Verified** in the preview against the sample data: added a Writing clinic on
Monday period 3 through the real dialog. Classes left and slack came back
identical to the baseline before the slot existed, the bracket read `(+16)`, no
projected lesson landed in it, Week and the class sheet showed its name, and the
.ics summary read `Lang · Writing clinic`. `tsc --noEmit` and `npm run build`
clean, console clean on a fresh load.

**Commit:** `b18d1a2` on Cadence `main`, pushed and deployed. `/health` came
back `{"ok":true,"hasState":true,"size":17060}`.

## 2026-08-31 (later) Cadence: drag lessons into order, split multi period lessons

**Asked:** drag to change the order of lessons, so lesson 1 can be shifted to
lesson 3. And if a lesson takes 2 or more periods, split it into that many
lessons, because they sometimes need to be moved apart or land on different days.

**Drag:** a grip on each lesson row, reusing the pointer drag the Desk to do
list already had rather than writing a second one. Works under a finger, and the
arrow keys on the grip still move a row without a mouse. Dragging spans the
whole course, not just one unit card: the landing gap is measured across every
row, while the unit is taken from the card the pointer is inside, because at a
card boundary the row above and the card disagree and the card is the one with a
name on it. Dropping into another unit re files the lesson as well as moving it,
in a single mutation so one undo puts both back. The position is read off the
row below the gap, so the rest of the sequence is not renumbered. The grip is
withheld while the search box has text, since the gaps in a filtered list are
not the gaps in the sequence.

**Split:** setting the lesson field (relabelled "Classes it takes") to 2 or more
and saving turns the lesson into that many lessons, "(1 of 2)" and "(2 of 2)",
consecutive in the sequence, one class each. The first part keeps the original
id so any recorded delivery stays attached to it. Objective, unit and tags copy
to every part; activities, homework and resources stay on part 1, because the
second period usually needs its own and copying just makes rows to clean up.
Paste import expands "(2 periods)" the same way and the toast counts what was
actually created. `periods` stays in the model for anything already stored.

**Known edge:** splitting a part of an earlier split leaves the old sibling
behind with a stale name, for example "(1 of 3)(2 of 3)(3 of 3)" followed by an
orphan "(2 of 2)". The parts are ordinary independent lessons once split and
nothing links them, so renaming siblings would need a group id in the model that
was not asked for. Left as is, and undo reverses the whole split in one press.

**Verified** in the preview against sample data by dispatching real pointer
events: lesson 1 dragged to position 3 landed exactly there, a cross card drag
moved a lesson from unit 1 to unit 2 and changed its unitId, one undo reverted
both the move and the re file, the keyboard nudge swapped two rows, a filtered
list showed 4 rows and 0 grips. Splitting produced positions 6 and 7 with one
period each, the toast read "Split into 2 lessons", re splitting a part renamed
rather than stacking, and Pacing moved from 4 lessons left and +58 slack to 5
and +57, which is the one extra class the split asks for. `tsc --noEmit` and
`npm run build` clean, console clean.

**Note for next time:** `preview_start {name:"cadence"}` now resolves the parent
repo's `.claude/launch.json` and cannot see the Cadence one, so the dev server
had to be started with `npm run dev` from the Cadence folder and the tab opened
with `preview_start {url:"http://localhost:5183"}`.

**Commit:** `f4848c0` on Cadence `main`, pushed and deployed. `/health` came
back `{"ok":true,"hasState":true,"size":18260}`.

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
