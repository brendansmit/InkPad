# Notes for ChatGPT — the stuff that was discussed but never written down

Written 2026-10-03, at the end of a long Claude session. ChatGPT is taking over
because of usage limits.

This is NOT a handover doc. The facts are already in the files:
`SERVER_CONTEXT.md` covers the server, each project has its own
`SESSION_NOTES.md`, and the code is committed and pushed. Read those for what
IS.

This file is only the things that were talked through in chat and never landed
anywhere: the intentions behind decisions, the reasoning, the near-misses, the
things deliberately left undone and why. Without this you would see the
outcomes and not know which ones were chosen on purpose.

---

## 1. The security rule that governs everything

Standing instruction, stated verbatim and not negotiable:

> The OpenRouter API key lives ONLY in `.env` (git-ignored). Never commit it,
> never paste it to me or ChatGPT, never put it in code. `.env` must never be
> committed. `events.db` is also git-ignored.

Treat this as applying to every app on the server, not just speed-dating. Every
app keeps its secrets in a git-ignored `.env` in its own directory. Do not ask
for the key, do not echo it, do not read it into a reply. If you need to know
whether a key is set, check that the variable exists, not what it contains.

## 2. Where the bug work came from, and the no-dismissals rule

The speed-dating bug fixing was not ad-hoc. It came out of a 3-model BugSmash
audit: DeepSeek V4 Pro, Mistral Small 4 and Claude Opus 4.8 each reviewed the
code independently. The instruction was blunt and worth repeating because it
shapes how the work was done: every single identified bug gets addressed, no
dismissals, no "won't fix", no triaging something away as unlikely.

That is why some of the fixes look paranoid relative to their real-world
probability. They were not judged on probability. If you review this code and
think "that guard is unnecessary", it is probably there on purpose.

The follow-up was a separate code review that produced the branch
`claude/code-review-xxa1gv`. That branch has now been merged into main.

## 3. The rate limiter: why the merge discarded one version on purpose

This is the single most important thing in this file, because the merge looks
arbitrary unless you know the reasoning.

The review branch and I had each independently rewritten the login rate
limiter, so `server.js` conflicted. Two versions:

The branch's version:

```js
const ip = (request.headers['x-forwarded-for'] || request.ip || 'unknown').toString().split(',')[0].trim();
```

Mine:

```js
const app = fastify({ logger: false, trustProxy: true });
// ...
const ip = request.ip || 'unknown';
```

Mine won. The reason: nginx **appends** to whatever `X-Forwarded-For` the
client already sent. So on a request that arrives with a forged header, the
value nginx passes through is `<attacker-chosen>, <real client IP>`. Taking
`split(',')[0]` therefore reads a value the attacker fully controls. Rotate it
per request and the rate limiter never fires. It is not a style preference, the
branch's version is bypassable.

`trustProxy: true` makes Fastify parse the header correctly and hand you the
real client in `request.ip`. **General rule for any Fastify app on this server:
set `trustProxy: true` and read `request.ip`. Never parse `X-Forwarded-For`
yourself.**

Second thing in that limiter worth not undoing: it evicts expired entries once
the map passes 5000 keys. Without it, a spray of forged IPs grows the Map
without bound, which is a memory-exhaustion vector. Both halves of that fix
exist for a reason.

The two conflict hunks that actually had to be hand-resolved were both the
static-file allowlist, and there the two versions were genuinely equivalent, so
keeping mine was a coin flip, not a judgement. Don't read significance into it.
The branch's real contributions came through untouched: `INTERESTS_LIST` loaded
from `data/interests.json`, `eventAggregates()` and `countMutualMatches()`.

Merge rather than cherry-pick was a deliberate choice, so the branch's history
stays attached and this reasoning stays findable in the log.

## 4. The near-miss that should make you careful about static file serving

Worth knowing because it was self-inflicted and nearly shipped.

Locking down static file serving to `/public/` looked obviously correct and was
wrong. The guest-facing pages fetch `../data/copy.json` and
`../data/interests.json`, and the venue builder is served from `/index.html`
with `/src/*.js` beside it. Restricting to `public/` would have 403'd all of
them. Guest registration, the main thing the app exists for, would have been
dead in production while every page still loaded and looked fine.

The fix is an explicit allowlist: `public/`, `data/`, `src/` and the root
`index.html`, everything else 403. The true servable surface was established by
grepping every resource reference in the codebase, not by reasoning about what
ought to be public. Do that too if you change it.

Confidence here is unusually high for one reason: the review branch arrived at
the same allowlist independently. Two reviewers converging is the only real
evidence either was right.

The verification matrix that proves it, run on the droplet after every deploy:
app assets and both `data/*.json` return 200, `/` returns 302, and `events.db`,
`.env`, `server.js`, `package.json`, `auth.test.js` all return 403.
`/organiser/me` 401 anonymous, bad-credential login 401. If you touch the
static route, re-run all of it, not a sample.

## 5. Two fixes that were product decisions, not just bug fixes

**`closeRegistration` accepts `'closing'`.** It used to throw if the event was
not in `registration` state, so a double-click returned 400. The fix was not
just "make the error go away", it was a decision about what a second click
should mean: it resets the countdown. That is the intended behaviour now. If
you see `if (event.status !== 'registration' && event.status !== 'closing')`
and think the second clause is sloppy, it is deliberate.

**`endRound` sets `event.status = 'ended'`** once every round has ended. This
introduced a brand new status value, which is the sort of thing that silently
blanks a UI built around a fixed set of states. That was explicitly checked,
not assumed: `renderEventControl` in `public/organiser.html` has an `else`
fallback that renders all panels, so an unrecognised status degrades to showing
everything rather than showing nothing. If you add another status, re-check
that assumption rather than trusting it.

## 6. The production outage, and why this class of bug will happen again

Two separate causes, both now fixed, both near-certain to recur on the next app
you deploy.

**Native modules, silently stale.** The droplet runs Node 24
(NODE_MODULE_VERSION 137). Local dev runs nvm Node 20 (115). npm 11 gates
package install scripts behind an approval prompt, so `npm install` prints a
warning and then does **not** run `node-gyp rebuild`. The stale binary stays in
place, `better-sqlite3` fails to load with `ERR_DLOPEN_FAILED`, PM2
crash-loops, and every route 502s. The restart counter hit 32.

The warning was visible in the deploy output the whole time. That is the lesson
worth carrying: the deploy did not fail, it warned, and the warning was
scrolled past. **After any deploy, check `pm2 jlist` and look at the restart
counter. A climbing counter is a crash loop.** Fix is
`npm approve-scripts --allow-scripts-pending` then
`npm rebuild better-sqlite3 --update-binary --foreground-scripts` and the same
for `bcrypt`.

**nginx and IPv6.** `proxy_pass http://localhost:PORT` resolves to both
`127.0.0.1` and `[::1]`. A Node app listening on `0.0.0.0` is IPv4 only, so
nginx round-robins half the traffic at an address that refuses it. The symptom
is an intermittent 502 at roughly 8% with no application-side error at all,
which is why it survived a long time: nothing in the app logs looked wrong.
Always `127.0.0.1`.

## 7. A dead end, documented so nobody re-investigates it

After both fixes, curl from the laptop still showed roughly 3 in 40 requests
returning `000`. This looked like a third unfixed bug and was chased down
properly: 50 requests direct to the app plus 50 through nginx over HTTPS, all
run from the droplet itself, gave 0 failures out of 100, with zero
corresponding entries in the nginx error log.

It is the local network path, not the server. If you see occasional `000` from
the laptop, that is this, already investigated. Do not spend time on it. Test
from the droplet when you need a clean signal.

## 8. Known and deliberately not fixed

`/etc/nginx/sites-available/lang.inkheron.app` still has
`proxy_pass http://localhost:3002`, so `lang.inkheron.app` carries the exact
IPv6 bug described above and presumably has the same intermittent 502s.

This was found, understood and left alone on purpose, as out of scope for a
speed-dating deploy. It is a one-line fix plus an nginx reload. Worth doing
next time that app is touched, but it was not an oversight.

## 9. The repo situation, which is the thing most likely to bite you

`Documents/Claude` is itself a git repo (remote: `InkPad`) and it contains 20
nested repos, each with its own remote. One project, one folder, one git repo
is the standing rule. All 20 were surveyed and every one is fully pushed.

**The history you need to know.** On 2026-08-28 several projects were split out
of the InkPad monorepo into their own repos. On 2026-08-31 a checkout in the
parent overwrote InkHeron-Platform's real working tree with the frozen copy
left behind by that split, destroying work. That is why
`InkHeron-Platform/` is in the parent's `.gitignore`, with the reason written
in a comment above it. Read that comment before touching parent-level git.

**Four repos are currently sitting in that same trap.** `launcher`,
`model-router-coder`, `prototype-coder` and `Writing analyzer` have dirty
working trees that are pure or near-pure deletions against their own HEAD. 734
deleted lines in launcher. 156 in Writing analyzer's SESSION_NOTES. The same
four `.gitignore` lines missing in three unrelated repos. All four have a
single-commit history reading "Import from InkPad monorepo".

Those working trees are almost certainly stale pre-split copies, older than
HEAD, not newer. **Committing them would delete real post-split work.** They
were deliberately left uncommitted, which is a standing exception to the
otherwise strict "never leave finished work uncommitted" rule, because here
committing is the destructive act. Do not `git add -A` and push them. They need
a human decision about which side is real.

**An unfixed hygiene problem.** The parent repo tracks `grade-importer/`'s
files directly as plain files, while `grade-importer/` is also its own repo with
its own remote. Two repos own the same files, which is precisely the setup that
caused the 2026-08-31 incident. The fix is
`git rm -r --cached grade-importer` in the parent plus a `.gitignore` entry,
same treatment as InkHeron-Platform. This was offered and not yet approved, so
it is still outstanding.

**`grade-importer/grades.db`** is a live binary database, tracked, and showing
as modified. It was left uncommitted on purpose: `admin.inkheron.app` is the
primary instance now, not the local Mac copy, so committing the local database
risks it later overwriting real grade data. Treat tracked live databases as a
hazard generally.

## 10. Conventions that are expected but easy to miss

- Small incremental steps, a git commit as a checkpoint after each working
  step, and push to origin straight after each commit without being asked.
- Verify with tools before handing anything over. Run the tests, run the curl
  matrix, check `pm2 jlist`. Only ask for a human to check what tools cannot
  reach, which means real devices and look-and-feel.
- Append a dated entry to the relevant `SESSION_NOTES.md` after every task,
  automatically. Keep it under about 400 lines and archive the oldest entries
  past that.
- Deploy commands are handed over as full paste-able strings including the ssh
  hop, never a bare server-side path.
- Metric only. No em dashes, en dashes or Oxford commas.
- Do only what was asked. Suggest extras separately rather than bundling them
  in.

## 11. Current state, one line

speed-dating is merged, 72/72 tests passing, deployed, and verified in
production on `speeddating.inkheron.app`. The parent repo and all 20 nested
repos are pushed. The four stale working trees and the grade-importer
double-tracking are the only open items, and both are waiting on a human
decision rather than on work.

---

One caveat on completeness: this was assembled from the conversation it came
out of. A separate code review chat was mentioned as having relevant
discussion, and I had no access to it, so anything that was only ever said
there is not captured here.
