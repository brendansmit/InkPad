# Session Notes

## 2026-08-28 - Abandoned creates no longer leave a placeholder behind

**Asked:** "When I click to create something but don't follow through or save, I
don't want the untitled event or assignment or whatever to still exist, it's a
stupid way of doing it."

**What was wrong.** Every create button did the same two things in the same
order: write the record to state, then open the dialog.

```
upsertX(record);
setEditing(record);
```

The dialog's Save already calls `upsertX`, and `upsert` inserts when the id is
new, so the first call bought nothing. What it cost was a stray record every
time you changed your mind. Close, cancel or press Escape and the placeholder
stayed: a "New event" on the calendar, a "New assignment" in the list, a "New
course" with no classes in it. Since the sync fix went in these strays also
travel: they write to the droplet, land in exports and reach the published
calendar.

**Fixed in seven places**, one line removed each, plus a comment saying why the
record is held back:

| File | Handler | Was leaving |
|---|---|---|
| `src/views/Month.tsx` | `addEvent` | New event |
| `src/views/Assignments.tsx` | `create` | New assignment |
| `src/views/Curriculum.tsx` | `addLesson` | New lesson |
| `src/views/Curriculum.tsx` | `addUnit` | New unit |
| `src/views/Classes.tsx` | `addCourse` | New course |
| `src/views/Classes.tsx` | `addSection` | Class 2 |
| `src/views/Timetable.tsx` | `add` (calendar day) | Holiday |

**Deliberately left alone.** Bell schedule periods and terms add a row that is
edited inline in a table. There is no dialog, so there is nothing to defer the
write to. The row is the editor. Deferring those means inventing a modal that
was not asked for.

**Verified in the running app**, not by reading. Every one of the seven was
opened and abandoned by all three exits (Cancel, the X, Escape), then opened and
saved. Counts read out of localStorage after a settle delay, because the persist
is debounced and reading it immediately gives a false negative. All seven hold
nothing on abandon and all seven still save. Lesson kept `order: 1` and its unit
link through the change. Delete inside the section editor on a never-saved
record is a harmless no-op: it removes an id that is not in state and closes the
dialog, and the existing section was untouched.

**Checked before starting:** the droplet's state file had no strays sitting in
it (2 events, 2 courses, 4 sections, 0 assignments, all real names), so this is
a forward fix with no cleanup owed.

`tsc --noEmit` clean, `npm run build` clean, no console errors. Commit
`bc61e4a` on Cadence `main`. Deployed later the same day with `e2ab05f`.

**Also asked:** why none of the existing InkPad assignments show up in Cadence.
They never do, by design. Cadence does not import from InkPad. You make a
Cadence assignment, expand its card, click InkPad and link each of its sections
to work over there. The link is what carries counts back. The pipe itself is
healthy: `/inkpad/assignments` returns 12 right now, including the MLK
Rhetorical Analysis Essay and Argument Essay - Organ Donation for AP Lang and
the four copies of Personal Statements Second Draft. There is nothing to link
them to because the Cadence side has no assignments yet.

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
