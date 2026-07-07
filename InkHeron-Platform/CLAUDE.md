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

- **Writing portal** — native InkPad (a custom in-browser editor, not Etherpad). Students
  write in the browser; drafts, autosaves and submissions are stored as revisions in the
  database (`native_pad_revisions`), which gives revision replay without Etherpad.
- **Tests portal** — question bank, MCQ/SRQ/FRQ, exam integrity. Specced as a LATER phase,
  not day-one.

The founding problem: Google Docs / Draftback (revision-history replay) are blocked in
China. The original build used Etherpad ("Draftback on your own server") for its timeslider.
Etherpad was REMOVED on 2026-07-02 once the native pad proved stable; existing student
writing was imported into `native_pads` first. Do not reintroduce Etherpad.

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
  managing certs for other subdomains).
- **Writing surface:** native InkPad, served by the Fastify wrapper. (Etherpad removed — see §1.)
- **App:** Node.js + Fastify (single service; no separate writing server any more). Do NOT
  introduce Python in the platform — Python belongs to the separate Writing Analyzer project.
- **Database:** SQLite (single file). Correct for this scale; do not reach for Postgres/MySQL.
- **Domain / registrar:** inkheron.app via Porkbun. DNS-only. NO Cloudflare proxy (orange
  cloud) — its IP ranges are throttled by the Great Firewall. Grey-cloud only if Cloudflare
  DNS is ever used.
- **Control panel:** Dokploy is the intended long-term panel, but for now deploy directly
  (nginx + Fastify app) and add Dokploy later. Do not let Dokploy setup block progress.
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
- **native_pads** — `id`, `student_id`, `assignment_id`, `state` (see §6), `document_json`,
  `plain_text`, `word_count`, `version`, `created_at`, `updated_at`, `submitted_at`.
  UNIQUE on (`student_id`, `assignment_id`) — one pad per student per assignment.
- **native_pad_revisions** — `id`, `native_pad_id`, `reason` ('create'|'autosave'|'submit'|'manual'),
  `document_json`, `plain_text`, `word_count`, `document_version`, `created_at`. The revision
  trail; this is what replaces the Etherpad timeslider.
- **native_paste_events** — `id`, `native_pad_id`, `at`, `length`, `input_type`.
- **native_annotations** — teacher marking on a pad: `type` ('general_comment'|'inline_comment'|
  'literacy_code'|'highlight'), offsets, `selected_text`, `body`, `resolved`, `document_version`.
- **assignment_rubric_criteria** / **assignment_rubric_bands** / **native_rubric_scores** —
  rubric definition and per-pad scores. Criteria carry `rubric_kind` ('internal' | AP estimate).
- **student_writing_profiles** / **student_literacy_issue_stats** / **student_literacy_evidence** —
  the long-term student profile, aggregated from `native_annotations` of type `literacy_code`.

Literacy codes, strengths and targets are now produced INSIDE InkHeron via native annotations
and the profile tables, not read in from the Writing Analyzer (see §9).

The 8 legacy Etherpad tables (`pads`, `submissions`, `grades`, `submission_codes`,
`submission_feedback`, `submission_comments`, `paste_events`, `pad_allocations`) still exist in
the schema but are INERT — retained only to preserve historical data. Do not read from or build
on them.

Key principle: everything keys off the (student, assignment) pair → its native_pad → its
revisions, annotations and rubric scores → the student profile.

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
  "word_count": true,                  // ALWAYS true (native pad shows it, always visible) — no UI toggle
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
- **marked** — teacher has graded; codes/targets/strengths attached. `finish-marking` ALWAYS
  lands here (2026-07-07 teacher decision). It only marks: it reveals nothing to the student.
  Under `feedback_release: "batch"` (the default) the score and feedback stay held until the
  teacher explicitly releases. Marking never auto-opens a rewrite any more.
- **green_pen_open** — legacy in-place rewrite state. No longer produced by `finish-marking`.
  The green-pen rewrite is now a SEPARATE assignment (see below), not a reopening of the same
  pad. The state and its student read-model mapping are retained only for old pads.
- **resubmitted** — student sent the revised version back (used by the rewrite assignment's
  own pads).

Green-pen rewrite flow (2026-07-07): when the teacher RELEASES feedback (class-wide via
`POST /api/assignments/:id/release-feedback`, or per student via
`POST /api/native/pads/:padId/release-feedback`), for any source essay with `green_pen: true`
the platform creates ONE separate rewrite assignment (idempotent, found via `rewrite_of_pad_id`
links, extended with newly released students on later releases). Each released student gets a
fresh `writing` pad in it seeded with their essay plus the teacher's marks as reference, graded
independently with its own rubric. See `ensureGreenpenRewriteForStudents` in nativePads.js.

Two AIs could contradict each other here ("submit locks" vs "green-pen reopens"). Locking is
gated by state; the rewrite is a separate assignment, not a reopen. Always check the state,
never assume a boolean.

---

## 7. Native pad capabilities (formerly Etherpad plugins)

The native InkPad provides in the editor itself what Etherpad used plugins for:
- Headings, alignment and basic formatting toolbar — built into the native editor.
- Word/char count — always visible, driven by `native_pads.word_count`.
- Paste detection — the editor reports paste gestures to `POST /api/native/pads/:id/paste-event`,
  logged in `native_paste_events`. (Use the explicit `paste` DOM event, NOT `inputType`, because
  Chinese IMEs route composition text through the clipboard and trip `insertFromPaste`.)
- Teacher comments and highlights — `native_annotations`, not `ep_comments_page`.
- Revision replay — `native_pad_revisions`, not the Etherpad timeslider.

No Etherpad plugins are installed or supported. Do not add any.

---

## 8. AI / OpenRouter model selection (when AI features are built)

- **Doer** = capable model (Claude, default-selected tier) for heavy extraction/structuring.
- **Checker** = a DIFFERENT, cheaper, faster model (e.g. Gemini Flash / DeepSeek) that validates
  the doer's output against source. Different family on purpose — a model is bad at catching its
  own blind spots. Checker flags only; it NEVER auto-corrects.
- Doer and Checker are stored as fuzzy intent settings, not concrete model ids:
  `ai_doer_intent` and `ai_checker_intent`. The Checker setting must remain a different family
  from the Doer setting.
- **Fuzzy model-name resolution:** never hardcode an exact OpenRouter model string. Store INTENT
  (family + tier), resolve against the live model list at call time, pick closest match. A
  confident near-match auto-resolves; a weak match surfaces to the human rather than silently
  calling the wrong model. Cache the resolved id; on an unknown-model error, re-fetch and
  re-resolve. Log what it resolved to.

(These matter for the Tests portal AI extraction and any Analyzer touchpoints, not the day-one
writing build.)

### 8.1 Literacy AI policy (teacher decision, 2026-07-02 — supersedes "hidden until accepted")

- Literacy codes are FORMATIVE, not grading factors. Students are L2 learners; codes exist to
  build each student's error dataset and drive practice, never to punish. Grammar/spelling/
  punctuation only affects a grade when it destroys meaning. Any AI prompt that estimates
  grades must be told this explicitly.
- AI literacy findings AUTO-APPLY as real marks when the Doer and Checker agree at
  confidence >= 0.75 with no flag (`autoPromoteSuggestions` in nativePads.js). Contested
  findings (low confidence or `code_questioned`) stay pending for the teacher. The teacher can
  DISAGREE with any mark (pending or auto-applied): `POST .../suggestions/:id/disagree`
  retracts the annotation and its profile evidence.
- Completeness over caution: the coder flags EVERY genuine error (40-50 per essay is normal).
  The dataset across essays is the product — it is what makes "these are YOUR typical errors"
  possible.
- The AI GRADE ESTIMATE anchoring rule is unchanged: never shown during marking.
- Every submit also records a deterministic stylometric fingerprint (`style_metrics` table,
  src/services/styleMetrics.js). The AI voice narrative may only describe patterns those
  numbers support.

---

## 9. Boundary with the Writing Analyzer

The Writing Analyzer is a SEPARATE local Python/Flet desktop app for the teacher's own offline
analysis. It is no longer in InkHeron's runtime path. Since the Etherpad removal, literacy codes,
strengths and targets are captured INSIDE InkHeron: the teacher applies them as `native_annotations`
during marking, the feedback/green-pen view reads those annotations, and they aggregate into the
`student_writing_profiles` tables (§4). Do not reintroduce a dependency on the Analyzer importing
codes into InkHeron, and do not build InkHeron portal logic inside the Analyzer.

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
