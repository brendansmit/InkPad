# InkHeron Buildbook — INDEX

The buildbook is split one file per phase so a session loads only what it needs.
To work: read `CLAUDE.md`, then this index, then the single phase file, then recent
`SESSION_NOTES.md`. Build one numbered step at a time. Each step is self-contained
(Goal / Depends on / Build / Done when).

Invocation pattern: **"Build Phase X, Step Y."**

---

## Day-one scope = Writing portal end to end
login → dashboard → write → submit → mark → green-pen → resend.
Tests portal is a later phase, sketched not detailed.

---

## Phases

- **Phase 1 — Foundation & reachability** `buildbook/phase-1-foundation.md`
  Droplet, nginx HTTPS + WebSocket, Etherpad up, domain resolving, reachable from China,
  Fastify wrapper skeleton, SQLite schema created. (Mostly ops. Highest overrun risk. Do first.)

- **Phase 2 — Identity & auth** `buildbook/phase-2-auth.md`
  Students/classes tables, hashed passwords, login, sessions, teacher-reset recovery,
  student self-change password. Platform owns identity.

- **Phase 3 — Writing surface** `buildbook/phase-3-writing.md`
  Provision one pad per (student, assignment), hand student into Etherpad via session API,
  wrapper shell around the pad, formatting toolbar, spellcheck flag, ep_countable always-on,
  save-state UI.

- **Phase 4 — Assignment lifecycle & submission** `buildbook/phase-4-lifecycle.md`
  Assignments + settings_json, opens_at/due_at, the pad state machine, exam vs draft lock,
  submit action, Server酱 WeChat notification.

- **Phase 5 — Paste detection plugin** `buildbook/phase-5-paste.md`
  Custom ep_ plugin reading inputType, store paste_events, surface flag to teacher.
  (Day-one scope, biggest single time-risk — schedule early despite its phase number.)

- **Phase 6 — Teacher dashboard** `buildbook/phase-6-teacher.md`
  Assignment dashboard (status + paste flag per student), review surface (text, timeslider
  replay, literacy coding view, selectable strengths/targets, grade field), batch grade-release
  with held/released state, CSV export. Wire to existing teacher UI files.

- **Phase 7 — Green-pen loop** `buildbook/phase-7-greenpen.md`
  Attach codes/targets/strengths to a submission, reopen pad on marking, student green-pen view
  (answer-free grammar legend, coaching targets, expandable strengths), resend. Analyzer boundary.

- **Phase 8 — Teacher settings & admin** `buildbook/phase-8-settings.md`
  Teacher-only settings screen: enter/update OpenRouter API key and Server酱 key (server-side,
  masked, with a test-key button), class + student management, roster import. Secrets never reach
  the client.

- **Phase 9 — Tests portal (LATER, sketch only)** `buildbook/phase-9-tests.md`
  Question bank, CSV import + AI extraction (doer/checker), passages, MCQ/SRQ/FRQ,
  shuffle-within-group, pooling (off/background/live, exam-disabled, self-correcting difficulty),
  focus-warning, timer. Not day-one.

Design system reference (read when building any UI): `DESIGN.md` (root). Tokens, components,
warmth principles. The mockups in `ui/` are the reference implementation.

---

## Generation status (fill in as phase files are written)

- [x] DESIGN.md
- [x] phase-1-foundation.md
- [x] phase-2-auth.md
- [x] phase-3-writing.md
- [x] phase-4-lifecycle.md
- [x] phase-5-paste.md
- [x] phase-6-teacher.md
- [x] phase-7-greenpen.md
- [x] phase-8-settings.md
- [x] phase-9-tests.md (sketch)

---

## 4-day shape (from CLAUDE.md context)

- **Day 1:** Phase 1 complete (ops + reachability) + this buildbook finalised. Most likely to overrun.
- **Days 2–3:** Phases 2–5 built against spec. Paste detection (P5) pulled early alongside the writing surface.
- **Day 4:** Phases 6–7 wired to existing UI, end-to-end test with a real student account, buffer.

Coding is done by Claude / ChatGPT / Kimi. The human is architect + integrator. The contract in
CLAUDE.md + these step files is what keeps three AIs building one system instead of three halves.
