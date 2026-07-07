# FABLE_CONTEXT.md — session briefing for the next Fable window

You are Fable, continuing work on InkHeron for the teacher (Hangzhou, EAP +
AP Lang). Read CLAUDE.md first (fixed contract), then this file. SESSION_NOTES.md
has the full history; grep it rather than loading it whole.

## Where things stand (2026-07-06)

- Branch `analysis-ai` is the working branch and IS what production runs.
  Suite: 162/162 green (npm test, Node 24:
  export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH").
- Everything through commit 7aca63d is DEPLOYED to production.
- The whole writing platform is live: AI literacy marking with auto-accept
  (>= 0.75, MT always manual), teacher review page (reject/change any mark,
  selection toolbar, layered marks, per-rubric tabs, feedback banks), green
  pen in-editor rewrites, student/class profile dashboards, batch release
  (default) with per-student send, gradebook export, semester tags, report
  snippets, calibration learning loop (teacher corrections steer the
  prompts), configurable Doer model (setting ai_doer_intent, default
  'deepseek chat v3'; Checker stays 'google gemini flash').

## Test Portal state

- MVP is LIVE (built by Codex, audited, merged, migration 029): question
  bank (/teacher/question-bank), test builder (/teacher/new-test), taking
  page (/native/test/:assignmentId) with server-enforced timer, per-student
  deterministic MCQ option shuffle, focus/blur tracking, MCQ auto-scoring,
  SRQ teacher scoring (/teacher/test-review), FRQ = a native pad submitted
  through the real pad pipeline, results gated on release-feedback.
- PENDING: the teacher is running Codex on CODEX_TESTGP_HANDOFF.md, branch
  `test-greenpen`, two parts:
  1. Green pen for tests: rewrite assignment must become type 'essay' with
     test config stripped; pads seeded FRQ text first then SRQ Q+A blocks;
     FRQ annotations copied; rewrite_of_pad_id = FRQ pad (NULL if no FRQ).
  2. Sections as passages + within-section question shuffle: sections gain
     passage_text (rendered above questions); question order shuffles per
     student WITHIN a section only (LCG seeded (studentId*104729)+sectionIndex),
     never across sections; FRQ sections exempt.

## YOUR JOB when the teacher says Codex is done

1. Audit branch `test-greenpen` against CODEX_TESTPORTAL_HANDOFF.md's nine
   ground rules + the TESTGP spec. Non-negotiables: additive only (no edits
   to src/services/*, src/views/nativeWrite.js, the AI pipeline); auth +
   own-row checks on every route; no answer keys/model answers in any
   student payload before release; migrations registered in
   test/migration.test.js; suite fully green.
2. Merge (prefer --ff-only into analysis-ai), run npm test.
3. Deploy: from repo root (parent Claude/ dir is the git root — NEVER
   git add -A):
   git archive HEAD -- src migrations public | gzip > /tmp/d.tar.gz
   scp -i ~/.ssh/id_ed25519 /tmp/d.tar.gz root@167.172.71.219:/tmp/
   ssh: cp data/inkheron.db data/inkheron.db.pre-X-$(date +%Y%m%d%H%M)
   (ALWAYS back up first), tar -xzf into /opt/inkheron-platform,
   chown -R inkheron:inkheron src migrations public,
   systemctl restart inkheron-wrapper, curl 127.0.0.1:3000/login expect 200.
   Note /opt/eap-platform is a SEPARATE older copy (eap.inkheron.app);
   leave it alone.
4. Log a dated entry at the top of SESSION_NOTES.md, commit it.

## Gotchas that cost time before

- This CLI's grep wrapper (ugrep --ignore-files) silently skips some repo
  files: use /usr/bin/grep or git grep. A file is not gutted just because
  grep returns nothing.
- Working tree has permanent uncommitted noise (package.json pdfjs-dist,
  Admin/, data/): ignore it, never commit or clean it.
- Only deploy the committed tree via git archive, never the working dir.
- Deploys are Fable-only; Codex/Sonnet/Opus handoffs forbid deploying.
- Student-facing surfaces never mention AI. No em dashes, no en dashes, no
  Oxford commas, B1-C1 student copy, metric only.
- POLISH_QUEUE.md collects small marking-room tweaks the teacher reports.

## Open threads beyond the Codex audit

- Real-class validation: a full 50-essay marked assignment has still not
  gone through; treat its feedback as the top priority when it happens.
- Candidate next features the teacher liked: question import/generation
  from a passage, SRQ AI scoring assist, per-question item analytics,
  personal practice generator from profile codes.
- DeepSeek Doer is new in production: watch quality and latency complaints;
  swap via the ai_doer_intent setting if needed (fuzzy intent, e.g.
  'moonshot kimi k2').
