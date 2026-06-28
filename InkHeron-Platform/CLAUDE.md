# CLAUDE.md — InkHeron Platform

**This file is loaded into every session. Read it fully before doing anything.**
It is the fixed contract. If a build step ever contradicts this file, this file wins —
stop and flag the conflict rather than guessing.

---

## 1. What InkHeron is

A self-hosted classroom and assessment platform, owned outright, built to replace
ClassIn / school systems for a teacher in Hangzhou, China, whose students are in China.
Two sub-portals under one login, sharing student accounts, one database, one teacher
dashboard:

- **Writing portal** — Etherpad-based. Students write in the browser; every keystroke is
  recorded (timeslider). This is the day-one build.
- **Tests portal** — question bank, MCQ/SRQ/FRQ, exam integrity. Specced as a LATER phase,
  not day-one.

The founding problem: Google Docs / Draftback (revision-history replay) are blocked in
China. Etherpad is "Draftback on your own server" — open source, self-hosted, with a
built-in timeslider that scrubs full keystroke history.

---

## 2. Stack (fixed — do not substitute)

- **Host:** DigitalOcean droplet, Singapore (SGP1), Ubuntu 24.04 LTS, 1 vCPU / 1 GB RAM /
  25 GB SSD. Resize in place later if needed.
- **Why Singapore, not Hong Kong / mainland:** AI is routed via OpenRouter, so server region
  is driven by student latency only, not by any AI provider's IP rules. Offshore (Singapore)
  deliberately AVOIDS mainland ICP filing.
- **Reverse proxy / HTTPS:** nginx (same as all other apps on this server). Do NOT install
  or configure Caddy — the server already runs nginx for speed-dating and grammar-arcade, and
  two reverse proxies cannot share ports 80/443. SSL via certbot (already installed, already
  managing certs for other subdomains). Must pass WebSocket upgrade headers to Etherpad or
  live editing breaks — use the standard nginx proxy config from SERVER_CONTEXT.md which
  already includes Upgrade/Connection headers. (This is the classic first-time failure — get
  it right early.)
- **Writing surface:** Etherpad (Node.js).
- **Wrapper app:** Node.js + Fastify. (Same runtime as Etherpad. Do NOT introduce Python in
  the platform — Python belongs to the separate Writing Analyzer project, not here.)
- **Database:** SQLite (single file). Correct for this scale; do not reach for Postgres/MySQL.
- **Domain / registrar:** inkheron.app via Porkbun. DNS-only. NO Cloudflare proxy (orange
  cloud) — its IP ranges are throttled by the Great Firewall. Grey-cloud only if Cloudflare
  DNS is ever used.
- **Control panel:** Dokploy is the intended long-term panel, but for the 4-day build deploy
  directly (nginx + Etherpad + wrapper) and add Dokploy later. Do not let Dokploy setup block
  day one.
- **Notifications:** Server酱 (Server Chan) for WeChat alerts on submission.
- **AI access:** OpenRouter (pay-per-token).

---

## 3. Hard rules (non-negotiable, apply everywhere)

1. **Demo and ghost accounts are statistically invisible.** Every aggregate, tally, count, average,
   export, analytic, paste/focus statistic, and difficulty calibration MUST exclude accounts where
   `is_demo = true` OR `is_ghost = true`. Use the single shared helper (`src/db/realStudents.js`);
   never sprinkle the filter across queries. Demo/ghost accounts still get their own pads, dashboards,
   and the full write/submit/mark/green-pen experience — they just never skew numbers.
2. **Self-host every asset.** No CDNs, no Google Fonts links, no external script tags. Fonts,
   CSS, JS all served from the droplet. (The Great Firewall breaks CDN-loaded assets.)
3. **Metric units only.** Never imperial.
4. **Passwords hashed only.** Never stored in plaintext or reversible encryption. The teacher
   CANNOT view a student's password — only RESET it. Teacher-reset is the ONLY recovery path
   (no email-based self-service reset; email is unreliable in China).
5. **Student-facing copy:** no em dashes, no en dashes, no Oxford commas. Plain instructional
   language pitched at high B1 to low C1. (This matches the teacher's house style across all
   classroom materials.)
6. **Privacy:** student data stays on this droplet. SSH key-only, UFW firewall, full-disk
   encryption at rest, hashed passwords, encrypted nightly backups, purge submissions each term.
7. **Italics in flowing copy:** use a styled span or a properly reset `em`, never a bare `<em>`
   inside a flex container (it orphans the word and breaks wrapping — already hit once).
8. **Secrets are server-side only.** API keys (OpenRouter, Server酱) are entered in a
   teacher-only settings screen and stored server-side (env file or DB on the droplet), never in
   client code, never reachable by a student. Display them masked (e.g. `sk-or-...4f2a`), never
   echo a full key back. A key spends real money — treat it like a password.

---

## 4. Data model (canonical names — three AIs must not disagree)

Use these exact table and field names. SQLite.

- **students** — `id`, `username`, `display_name`, `password_hash`, `class_id`, `created_at`,
  `must_change_password` (bool, true after a teacher reset), `is_demo` (bool, default false),
  `is_ghost` (bool, default false)
- **classes** — `id`, `name`, `created_at`
- **assignments** — `id`, `class_id`, `title`, `type` ('essay' | 'test'), `settings_json`
  (the assignment settings object — see §5), `opens_at`, `due_at`, `created_at`
- **pads** — `id`, `student_id`, `assignment_id`, `etherpad_pad_id`, `state` (see §6),
  `created_at`. UNIQUE on (`student_id`, `assignment_id`) — one pad per student per assignment.
- **submissions** — `id`, `pad_id`, `submitted_at`, `is_graded` (bool), `released` (bool)
- **grades** — `id`, `submission_id`, `score`, `released` (bool), `graded_at`
- **paste_events** — `id`, `pad_id`, `at`, `length`, `input_type` ('insertFromPaste' etc.)
- **codes** / **targets** / **strengths** — produced by the Writing Analyzer and attached to a
  submission for the green-pen view. Stored so the student can see them; NOT generated inside
  InkHeron. Treat as read-in data with a clean boundary.

Key principle: everything keys off the (student, assignment) pair → its pad → its submission.

---

## 5. Assignment settings object (`settings_json`)

One JSON blob per assignment. Every per-task behaviour is a field here, NOT a global install
and NOT a per-student setting. Adding a future toggle = adding a field.

```json
{
  "type": "essay",
  "submit_behaviour": "draft",        // "exam" = terminal lock on submit;
                                       // "draft" = editable until due_at, then locks
  "spellcheck": true,                  // toggles browser-native spellcheck on the pad
  "word_count": true,                  // ALWAYS true (ep_countable, always visible) — no UI toggle
  "paste_detection": true,             // day-one, always on for writing
  "green_pen": true,                   // allow reopen-after-marking rewrite round
  // ---- test-phase fields (ignored for essays) ----
  "shuffle": true,                     // permute within group only, never across
  "pooling": "off",                    // "off" | "background" | "live"; HARD-disabled for exams
  "focus_warning": true,               // test portal only; grace-then-firm
  "timer_minutes": null
}
```

---

## 6. Pad lifecycle state machine

`writing → submitted → marked → green_pen_open → resubmitted`

- **writing** — student editing freely.
- **submitted** — student hit Submit. For `submit_behaviour: "exam"` this is TERMINAL: pad
  locks read-only forever. For `"draft"` it marks "this is the gradeable version" but stays
  editable until `due_at`, at which point it locks.
- **marked** — teacher has graded; codes/targets/strengths attached.
- **green_pen_open** — if `green_pen: true`, marking reopens the pad for the student to revise
  using the feedback. (So lock is not always permanent — marking can release a new round.)
- **resubmitted** — student sent the revised version back.

Two AIs could contradict each other here ("submit locks" vs "green-pen reopens"). It is BOTH,
gated by state. Always check the state, never assume a boolean.

---

## 7. Etherpad plugins

Confirmed: `ep_headings2`, `ep_align`, `ep_comments_page`, `ep_countable`, `ep_stable_authorid`.
Plus a CUSTOM `ep_` paste-detection plugin (reads `inputType`: `insertFromPaste` vs `insertText`)
— this is day-one scope and the single biggest time-risk (custom Etherpad plugins are fiddlier
than app code). Build and test it EARLY, not on day 4.

Formatting toolbar stays available (native Etherpad + ep_headings2 + ep_align). Word/char count
always visible (ep_countable).

---

## 8. AI / OpenRouter model selection (when AI features are built)

- **Doer** = capable model (Claude, default-selected tier) for heavy extraction/structuring.
- **Checker** = a DIFFERENT, cheaper, faster model (e.g. Gemini Flash / DeepSeek) that validates
  the doer's output against source. Different family on purpose — a model is bad at catching its
  own blind spots. Checker flags only; it NEVER auto-corrects.
- **Fuzzy model-name resolution:** never hardcode an exact OpenRouter model string. Store INTENT
  (family + tier), resolve against the live model list at call time, pick closest match. A
  confident near-match auto-resolves; a weak match surfaces to the human rather than silently
  calling the wrong model. Cache the resolved id; on an unknown-model error, re-fetch and
  re-resolve. Log what it resolved to.

(These matter for the Tests portal AI extraction and any Analyzer touchpoints, not the day-one
writing build.)

---

## 9. Boundary with the Writing Analyzer

The Writing Analyzer is a SEPARATE local Python/Flet desktop app. It produces literacy codes,
targets and strengths from marked essays. InkHeron does NOT do that analysis. The clean seam:
Analyzer produces codes/targets/strengths → they attach to a submission → InkHeron's green-pen
view displays them and reopens the pad. Do not build Analyzer logic inside InkHeron. Do not
build InkHeron portal logic inside the Analyzer.

---

## 10. Session protocol (how to work in this repo)

- **Read order each session:** this file → `buildbook/INDEX.md` → the specific phase file →
  recent entries in `SESSION_NOTES.md`. Never load `SESSION_NOTES_ARCHIVE.md` into context;
  grep it only to check a specific past decision.
- **Steps are self-contained.** Build exactly the requested "Phase X, Step Y". Each step states
  Goal / Depends on / Build / Done when. Do not wander beyond the step.
- **Log every session** in `SESSION_NOTES.md`: date, what was built, decisions made, what's next.
- **UI already exists** as clickable mockups (student side + three teacher-side files). Wire the
  backend to the existing design; do not redesign. Reuse the existing design tokens.
- **Multi-AI drift is the main risk.** When in doubt about a name, type, or contract, this file
  and the data model in §4 are the source of truth.
