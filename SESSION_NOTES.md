# Session Notes

## 2026-08-28 - Live two-server app inventory

**Asked:** List every app deployed across both servers.

**Did:** Queried both droplets read-only over SSH and reconciled PM2, systemd,
Docker Compose, reverse-proxy routes, listening ports and top-level deployment
directories. Found 12 running logical apps: seven on `167.172.71.219` and five
on `165.22.242.91`. Also found AI Control deployed on the second server with
both its service and Cloudflare tunnel inactive. Excluded infrastructure,
default web roots and two timestamped Mosaic backup directories.

**Decision:** Treat InkPad's Etherpad and wrapper services as one logical app,
and treat Grammar Arcade as a separate app mounted behind the EAP domain.
Noted that `SERVER_CONTEXT.md` is stale: it omits Cadence on droplet 2 and its
droplet 1 AP Lang, Lang and Admin mappings no longer match live process paths
and ports.

---

## 2026-08-28 (later) - Cadence: pick the InkPad assignment by name

**Asked:** From a screenshot of the InkPad dialog: "This should be more
automated and intuitve. The classes have the same names, I should just have to
click on the assingment name listed in chronological order from newest to
oldest and then it should auto populate. Make it less work to go and click on
start dates for each on every littel thing per class."

**Was:** One dropdown per class, each listing all 17 rows InkHeron holds, so
linking a three-class assignment meant picking the same title three times and
then typing a start date into every row by hand.

**Did:** Three changes, all in `src/lib/inkpad.ts` and
`src/views/Assignments.tsx`.

1. `groupByTitle` collapses the rows to one entry per title, newest first by
   id, with its copies attached. 17 rows became 8 titles. The dialog opens on
   that list, each row showing the classes on it and how many of yours it
   fills.
2. `matchByClass` links a whole group in one click: for each of your sections
   it takes the copy whose InkHeron class name matches the section's name or
   short name, preferring a live copy over an archived one, and never claiming
   the same InkPad row twice. Clicking a title links, pulls counts, sets class
   sizes and fills dates in one go, off the rows already fetched, so there is
   no second network trip. `suggestLinks` is gone, replaced by these two.
3. Start dates now come across. `InkpadAssignment` gained `opensAt`, and the
   old `dueDay` became a shared `calendarDay` used for both ends, so `opens_at`
   fills the assigned date the way `due_at` already filled the due date. The
   toast names only a date that contradicts one you had already set, and stays
   quiet about the ones it merely filled in.

The per-class dropdowns are still there, behind a "Link to a different
assignment" button, for the cases the picker cannot solve: a class you named
differently in Cadence, or two unrelated pieces sharing one title. A zero-match
click writes nothing and explains itself instead.

**Verified** in the preview against a local stub carrying the real 17-row
payload, so no test click could reach the droplet. Picker renders 8 groups
newest-first with correct match badges. Clicking the top one linked all three
EAP sections, wrote ids 21/18/19, counts 2/2/6, class sizes 9/11/22 and start
dates, and reported only the genuine move (EAP 2, 1 Jul to 23 Jul). Clicking
"Personal Statements Second Draft", where EAP 3 has both a live copy and an
archived one, took the live one. Clicking an MLK title from the AP Lang
assignment, whose section is named APL 1, wrote nothing and said so. A second
pull said "Already up to date." `tsc --noEmit` and `npm run build` clean.

**Commit:** `e2ab05f` on Cadence `main`, pushed to GitHub and deployed to
cadence.inkheron.app along with `bc61e4a` before it. `deploy/deploy.sh` ran
clean: pm2 online, `/health` returned `{"ok":true,"hasState":true,"size":15759}`,
so the state file came through untouched. The site itself answers 401 to curl
because of the password door, which is correct.

**Suggested, not built:** merging "Greenpen rewrite: X" with "X" into one
picker row. They are two separate pieces on InkHeron, so this is a judgement
call, not a bug.

## 2026-08-28 — Monorepo split, phases 0-1
Asked: split the InkPad monorepo into per-project repos; survey first.
Done:
- Survey: 11 branches (9 fully merged), 18 tracked projects, 5 broken gitlinks, 9 nested repos, 146 MB .git.
- Decisions: InkPad stays InkHeron's repo (deploy untouched); SmitRecipes/Admin are separate projects; fresh private repos for cold projects; Cadence read-only, untouched.
- Phase 0: committed all local work, tagged archive/monorepo-final, pushed. Set git identity (was hostname fallback).
- Phase 1: deleted 8 merged branches + backup branch; merged mobile-grading-fixes (3 conflicts resolved keeping newer rewrite-scoring code), verified tests, deleted branch. Only main + rewrite-scoring remain.
- Tests need Node 22+ (node:sqlite); shell default is Node 20. 2 pre-existing failures flagged as separate task (EAP admin auth, migration list).
Next: Phase 2 extraction blocked on GitHub repo creation (gh CLI not installed).

## 2026-08-28 — Monorepo split, phases 2-3 (complete)
- Deleted ai-control from droplet 2 on request: /opt/ai-control, env, credentials, systemd unit, builder.inkheron.app nginx site. Code kept in its new repo.
- Installed gh CLI to ~/.local/bin (user's curl failed; my shell reaches GitHub fine), user did device login.
- Secured unpushed work first: ap-lang-dashboard (commit+push), Gramm-Builder (commit+push), class-grouper (9 commits pushed), Admin (7 commits pushed), bug-detector (README committed).
- Secret scan of all candidates: only placeholder .env files, nothing real.
- Created 13 private repos and pushed: class-pet, pixel-cat, writing-analyzer, webstuff, launcher, grade-importer, prototype-coder, model-router-coder, ai-control, outputs, grammar-arcade, jeopardy, bug-detector. Verified content on GitHub per repo.
- Untracked all 16 project dirs + broken gitlinks from InkPad; InkPad now tracks only InkHeron-Platform + root docs. Moved SmitRecipes and Admin out of InkHeron-Platform to top level.
- Added README.md project map; added repo-hygiene guard to global CLAUDE.md.
- Deployed to droplet 1: healthy at fd8b4a2. Tests: 258 pass, same 2 known pre-existing failures.

---

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
