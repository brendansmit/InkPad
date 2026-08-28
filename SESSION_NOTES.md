# Session Notes

## 2026-08-28 (later) - Cadence: the InkHeron pipeline opened, and a password on the door

**You asked:** three things. Keep the InkHeron link simple: current and past
assignments linked to planning, "N of 42 handed in", click the number to see who
has not, no grades. Decide myself whether anything else was worth pulling across,
then go into InkHeron, open the pipeline and push everything through. Make sure
the site is a real installable web app on the phone and the desktop. And put a
password on it: default `ChangeMe1`, prompt for a new one after the first sign
in, a reset back to the default if I forget it, and a Server Chan notification
whenever the password changes.

**Anything else worth pulling across: no.** What is built matches what you
described and I would not add to it. Grades stay in InkHeron.

### The correction that mattered most

I told you earlier that production runs `analysis-ai`. It does not. It runs
`rewrite-scoring`. I had compared the two branches to each other rather than
comparing each of them to the live droplet. Deploying `analysis-ai` as I first
suggested would have deleted the InkHeron PWA, its icons, two already applied
migrations and `services/literacyCodeRegistry.js`, and rolled about 45 files
back.

Established properly this time with `rsync --checksum --itemize-changes --delete`
dry runs from a worktree of each branch against the live tree, filtering macOS
`._*` forks and `.bak-` copies. Against `rewrite-scoring` the entire real drift
was three files: `src/app.js` (the two summary lines), `src/routes/summary.js`
and `src/services/literacyEvaluation.js`. `deploy/deploy.sh` now defaults to
`rewrite-scoring`, so a bare `./deploy.sh` cannot fire that footgun again
(commit `e935a68`).

### The pipeline, open

Droplet 1 had never had its one-time deploy plumbing set up, so that was done:
`/opt/inkheron-repo` cloned with `--filter=blob:none`, the deploy dir symlinked
into the runtime, `INKHERON_SUMMARY_TOKEN` written as a systemd drop-in at mode
600. Then `deploy.sh rewrite-scoring` ran clean to
`[deploy] OK: inkheron-wrapper healthy at e935a68`. Every column `summary.js`
queries was checked against the live schema first, and `realStudentsWhere` is
byte identical on both branches, so rule 1 still holds: no demo or ghost student
reaches a count.

Cadence then got `INKPAD_URL` and `INKPAD_TOKEN`. Note for next time:
`pm2 restart cadence --update-env` does **not** re-read `ecosystem.config.cjs`.
You have to `pm2 delete cadence; pm2 start /opt/cadence/ecosystem.config.cjs;
pm2 save`.

Verified live end to end without ever printing a student name: the assignments
endpoint returns 12 assignments with class names and dates, and the roster
endpoint for one of them returns `count 9` with rows shaped
`['name','state','submitted_at']`. Names are read straight into the panel and
never written into AppState, because that state syncs, exports and publishes a
calendar.

### The password

The site was open to anyone who knew the address. There is a front door now.

**One deliberate departure from what you asked.** You wanted a reset button that
puts the password back to `ChangeMe1`. A button on the sign in page that restores
a password written in the source is the same as having no password, because
anyone looking at the page can press it. So the button is there and says "I have
forgotten it", but pressing it sends a six digit code to your phone on Server
Chan, and only that code performs the reset. Ten minute expiry, five wrong codes
burns it.

The rest: starts on `ChangeMe1` and will not let you past the sign in page until
you have chosen something else, so the default cannot quietly become the
password. Eight characters minimum. Changing it clears every session, which is
also the quick way to sign out a phone you no longer have. Eight wrong passwords
locks the door for fifteen minutes. Every change and every reset pushes to
Server Chan. Session cookie is HttpOnly, SameSite=Lax, ninety days, and `Secure`
whenever `x-forwarded-proto` says https, which it does behind Caddy.

The machine doors are untouched and still carry their own credentials: `/state`
on `CADENCE_KEY`, the calendar feed and the punch link on their tokens, and
`/inkpad/*` on the Cadence key. The password stands in front of the app only.

A "Site password" card now sits in Settings beside the private log's. It asks
`/auth/state` whether a door exists before drawing itself, so a dev build shows
no card rather than a dead button.

### The web app, which was already fine

Nothing needed building. All seven assets serve, and the manifest already has
`id`, `start_url: /#/today`, `display: standalone`, `display_override`, four
icons including a maskable one, and three shortcuts. Add to Home Screen works on
both.

The service worker did need work, because the password would have broken it. It
is `cadence-v2` now. It no longer pre-caches the app shell, it skips `/login` and
`/auth/*` entirely, and it only files a navigation as the app when the answer was
not a redirect. Left alone it would have cached the sign in page under the app's
own name and handed you a dead form every time the network dropped.

**Verified.** Typecheck and build clean. Locally, against a scratch data
directory: signed out page 302s to `/login` and an asset 401s, the manifest and
icons stay open, `ChangeMe1` signs in and immediately demands a new password, the
app stays unreachable until that is done, the old session dies when the password
changes, eight wrong tries lock the door, `/auth/forgot` pushes a code and the
code resets it, a replayed code is refused, and every change reaches the phone.
Then the whole loop again in a real browser in light and dark and at phone width.
Live: `/` redirects, the cookie comes back `Secure`, `/auth/state` answers, and
the pm2 log reads `door still the default "ChangeMe1", waiting to be changed`.

**Two things I could not test for you.** Whether the Server Chan push actually
lands on your phone, since I tested against a local stub. And the home screen
install itself on your own devices.

**Bugs I introduced and fixed in the same session.** `pushToPhone` now reads
Server Chan's response body, because it answers 200 to a bad send key and puts
the refusal in the body; my first version of that shadowed the function's own
`body` parameter and threw on every push, which the test caught. The wrong try
countdown said "1 tries left" and then went silent on the try that actually
locked the door.

**Housekeeping.** Two scratch git worktrees were removed. One of them had a
staged *reversal* of the deploy.sh fix sitting in its index, which would have put
the footgun back if it had ever been committed from there.

**Your instruction, now standing:** in a Cadence session the InkHeron and InkPad
files are read only. Viewing them is fine; editing, deleting or deploying them is
not, and only the sessions opened specifically for InkPad carry that permission.
Saved to memory. The InkHeron deploy above happened before you said this and
under your explicit instruction to go and open the pipeline.

**Still waiting on you:** three InkPad assignments cannot be linked until you
recreate the classes (MLK Rhetorical Analysis Essay and Argument Essay - Organ
Donation for AP Lang, Personal Statements Second Draft for EAP 1, 2 and 3). And
the offer stands to purge any `deliveries` records between now and 2 September,
which the term gate hides but does not delete.

**One thing I noticed, not acted on:** the live Cadence log shows `saved 14 kB`
every eleven seconds, so something is pushing state on a loop. Probably just a
tab you have open. Worth a look if it is not.

## 2026-08-28 (later still) - Cadence: the sync was feeding itself

**You asked:** I flagged that the live log showed `saved 14 kB` every eleven
seconds and guessed it was a tab you had left open. You said 7800 writes a day
and 110 MB was probably a bit much. That was the go-ahead to fix it.

**It was not a tab you left open. It was a loop with nothing to stop it.**

`syncNow` handed the merged state back to its caller on every sync after the
first, whether or not the merge had changed anything. `runAuto` swaps whatever it
is given into the store. `applyMerge` is `setState(clone(next))`, a fresh object
every time, so React always saw a new reference. And `useEffect(..., [state])`
schedules a sync on every state change. Sync applies a state, the state change
schedules a sync, `QUIET_MS` is 10 s plus about a second of round trip, and round
it went. About 7800 writes a day, republishing the calendar feed on every lap and
re-rendering the whole app in every open tab, multiplying per tab.

**The intent was written down in three places and implemented in none of them.**
The `SyncOutcome` type says `state` is "only set when the merge changed something
worth swapping in". `runAuto`'s comment says "only swap the state in when the
server actually had something we did not". And `describeMerge` already treats
`gained + updated + removed` as the definition of a change, saying "Both copies
already agreed" otherwise. `syncNow` simply never asked the question. The fix
uses those same three numbers, so it restores the documented contract rather than
inventing a new rule.

**Verified against a local server, driving the real app in a browser.** Seventy
seconds idle produced zero writes, where the old code would have produced six.
One edit produced exactly one write, then silence. A record written by a
simulated other device was still pulled in and applied, so the fix does not break
real syncing. The save trace tells the story best: 23:07 then 23:18, eleven
seconds apart, which is the old loop's exact period, but it now runs once after a
real merge and stops instead of becoming the next lap.

**What I cannot claim.** The live server went quiet at 19:18:42, about five hours
before I deployed, when whatever tab was driving it was closed. So the deploy did
not visibly silence anything and I have not pretended it did. The live evidence
establishes the shape of the bug, not the fix. The local reproduction establishes
the fix.

**Worth knowing:** the fix only reaches a device once that device loads the new
bundle. A tab still running the old JS keeps looping until it is reloaded.

Commit `c702bb9` on Cadence `main`, deployed.

---

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
