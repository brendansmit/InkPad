// Teacher-triggered "Run AI review" for work that is already submitted.
//
// The AI marking chain (literacy coder, style metrics, rubric estimate,
// strength/target suggester) normally fires once, in the background, at the
// moment a student submits. Anything submitted before the AI pipeline existed
// or before the OpenRouter key was configured therefore has zero marks and
// there is no way to catch it up. This route re-runs the same chain on demand
// for one pad (or every eligible pad in an assignment) and reports what it
// produced so the teacher can tell a real "no errors" result from a missing
// key.
import { runLiteracyAnalysis } from '../services/literacyCoder.js';
import { estimateRubric } from '../services/markerProfile.js';
import { recordStyleMetrics } from '../services/styleMetrics.js';
import { suggestFeedbackItems } from '../services/feedbackSuggester.js';
import { generateProfileSummary } from '../services/profileSummarizer.js';
import { autoPromoteSuggestions, retractAiMarksForPad, retractAiFeedbackForPad } from './nativePads.js';
import { readRawSetting } from '../services/settingsStore.js';

const ELIGIBLE_STATES = new Set(['submitted', 'marked', 'green_pen_open', 'resubmitted']);

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function hasText(pad) {
  return !!pad.plain_text && /\w/.test(pad.plain_text);
}

// Run the full chain for one pad and return a count summary. Never throws:
// each service already swallows its own errors and returns a status.
export async function reanalyzePad(db, pad) {
  const padId = pad.id;
  // Replace the previous AI run rather than stacking marks on top of it.
  // Literacy marks and strength/target suggestions both reset; marks and
  // feedback items the teacher placed by hand are untouched.
  retractAiMarksForPad(db, padId);
  retractAiFeedbackForPad(db, padId);
  const literacy = await runLiteracyAnalysis(db, { padId });
  autoPromoteSuggestions(db, padId);
  recordStyleMetrics(db, { padId });
  await estimateRubric(db, { padId });
  await suggestFeedbackItems(db, { padId });
  // Refresh the long-term profile now that new evidence has landed.
  generateProfileSummary(db, { studentId: pad.student_id }).catch(() => {});

  const marks = db.prepare(
    "SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'"
  ).get(padId).n;
  const contested = db.prepare(
    "SELECT COUNT(*) AS n FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'pending'"
  ).get(padId).n;
  const suggestions = db.prepare(
    "SELECT COUNT(*) AS n FROM ai_feedback_item_suggestions WHERE native_pad_id = ? AND status = 'pending'"
  ).get(padId).n;
  return { literacy_status: literacy?.status ?? 'unknown', marks, contested, suggestions };
}


/**
 * Batch "Run check": the whole assignment, as a job the teacher can walk away
 * from.
 *
 * Since 2026-08-29 submitting triggers no AI at all, so this is the only thing
 * that marks a class. A class of thirty essays is twenty minutes of model
 * calls, which is far longer than any proxy will hold a request open, and the
 * teacher explicitly wants to start it and close the tab. So the HTTP call
 * only STARTS the run and returns immediately; the work continues in the
 * server process and writes its progress to ai_check_runs, which the page
 * polls. Nothing depends on the browser staying open.
 */
const PAD_SELECT = 'SELECT * FROM native_pads WHERE assignment_id = ? ORDER BY id ASC';

function eligiblePads(db, assignmentId) {
  return db.prepare(PAD_SELECT).all(assignmentId)
    .filter((pad) => ELIGIBLE_STATES.has(pad.state) && hasText(pad));
}

export function loadCheckRun(db, assignmentId) {
  const row = db.prepare(
    'SELECT * FROM ai_check_runs WHERE assignment_id = ? ORDER BY id DESC LIMIT 1'
  ).get(assignmentId);
  if (!row) return null;
  let perPad = [];
  try { perPad = JSON.parse(row.result_json ?? '[]'); } catch { perPad = []; }
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    completed: row.completed,
    current_student: row.current_student ?? '',
    total_marks: row.total_marks,
    error: row.error ?? '',
    started_at: row.started_at,
    finished_at: row.finished_at ?? null,
    per_pad: perPad,
  };
}

/**
 * Any run still marked 'running' when the process starts is a run whose
 * process died. Nothing is resuming it, so say so rather than leaving a
 * progress bar that will never move again.
 */
export function failInterruptedCheckRuns(db) {
  const res = db.prepare(`
    UPDATE ai_check_runs
    SET status = 'interrupted', finished_at = datetime('now'), updated_at = datetime('now'),
        error = 'The server restarted while this check was running. Run it again.'
    WHERE status = 'running'
  `).run();
  return { interrupted: Number(res.changes ?? 0) };
}

// Drives one run to completion. Never throws: a failure on one pad is recorded
// and the run carries on, because one bad essay must not cost the teacher the
// other twenty nine.
async function driveCheckRun(db, runId, pads) {
  const setProgress = db.prepare(
    "UPDATE ai_check_runs SET completed = ?, total_marks = ?, current_student = ?, result_json = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const nameOf = db.prepare('SELECT display_name FROM students WHERE id = ?');
  const perPad = [];
  let totalMarks = 0;
  try {
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const who = nameOf.get(pad.student_id)?.display_name ?? `Student ${pad.student_id}`;
      setProgress.run(i, totalMarks, who, JSON.stringify(perPad), runId);
      let entry;
      try {
        const r = await reanalyzePad(db, pad);
        totalMarks += r.marks;
        entry = { pad_id: pad.id, student_id: pad.student_id, student_name: who, ...r };
      } catch (error) {
        entry = { pad_id: pad.id, student_id: pad.student_id, student_name: who,
          literacy_status: 'error', marks: 0, contested: 0, suggestions: 0,
          error: String(error?.message ?? error) };
      }
      perPad.push(entry);
      setProgress.run(i + 1, totalMarks, '', JSON.stringify(perPad), runId);
    }
    db.prepare(
      "UPDATE ai_check_runs SET status = 'done', finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(runId);
  } catch (error) {
    db.prepare(
      "UPDATE ai_check_runs SET status = 'error', error = ?, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(String(error?.message ?? error), runId);
  }
}

export async function registerNativeReanalyzeRoutes(app, { db }) {
  // Single pad.
  app.post('/api/native/pads/:padId/reanalyze',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = toPositiveInt(request.params.padId);
      if (!padId) return reply.code(400).send({ error: 'invalid_pad_id' });
      const pad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (!ELIGIBLE_STATES.has(pad.state)) {
        return reply.code(409).send({ error: 'not_submitted', message: 'This pad has not been submitted yet, so there is nothing to review.' });
      }
      if (!hasText(pad)) {
        return { status: 'empty', message: 'This pad has no text to review.' };
      }
      if (!readRawSetting(db, 'openrouter_api_key')) {
        return { status: 'no_key', message: 'No OpenRouter key is set. Add it in Settings, then run AI review again.' };
      }
      const result = await reanalyzePad(db, pad);
      return { status: 'ok', ...result };
    }
  );

  // Every eligible pad in an assignment. Runs sequentially so we stay within
  // one DB connection and do not hammer the model provider in parallel.
  app.post('/api/native/assignments/:assignmentId/reanalyze',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = toPositiveInt(request.params.assignmentId);
      if (!assignmentId) return reply.code(400).send({ error: 'invalid_assignment_id' });
      const assignment = db.prepare('SELECT id FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });
      if (!readRawSetting(db, 'openrouter_api_key')) {
        return { status: 'no_key', message: 'No OpenRouter key is set. Add it in Settings, then run AI review again.' };
      }
      const pads = db.prepare(
        'SELECT * FROM native_pads WHERE assignment_id = ? ORDER BY id ASC'
      ).all(assignmentId).filter((pad) => ELIGIBLE_STATES.has(pad.state) && hasText(pad));

      let totalMarks = 0;
      const perPad = [];
      for (const pad of pads) {
        const r = await reanalyzePad(db, pad);
        totalMarks += r.marks;
        perPad.push({ pad_id: pad.id, student_id: pad.student_id, ...r });
      }
      return { status: 'ok', pads_processed: pads.length, total_marks: totalMarks, per_pad: perPad };
    }
  );
  // Start a batch check over one assignment, then return straight away.
  app.post('/api/native/assignments/:assignmentId/check',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = toPositiveInt(request.params.assignmentId);
      if (!assignmentId) return reply.code(400).send({ error: 'invalid_assignment_id' });
      const assignment = db.prepare('SELECT id FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      const running = db.prepare(
        "SELECT id FROM ai_check_runs WHERE assignment_id = ? AND status = 'running'"
      ).get(assignmentId);
      if (running) return reply.code(409).send({ error: 'already_running', run: loadCheckRun(db, assignmentId) });

      if (!readRawSetting(db, 'openrouter_api_key')) {
        return reply.code(400).send({ error: 'no_key', message: 'No OpenRouter key is set. Add it in Settings, then run the check again.' });
      }

      const pads = eligiblePads(db, assignmentId);
      if (!pads.length) {
        return reply.code(400).send({ error: 'nothing_to_check', message: 'Nothing has been submitted on this assignment yet.' });
      }

      const runId = db.prepare(
        'INSERT INTO ai_check_runs (assignment_id, started_by, total) VALUES (?, ?, ?)'
      ).run(assignmentId, request.session.user.id ?? null, pads.length).lastInsertRowid;

      // Deliberately not awaited: the teacher gets the run id now and the work
      // continues in the background whether or not they stay on the page.
      driveCheckRun(db, runId, pads).catch((error) => {
        console.warn('[check-run]', error?.message ?? error);
      });

      return reply.code(202).send({ run: loadCheckRun(db, assignmentId) });
    }
  );

  // Progress. Safe to poll; also what the page reads on load, so a teacher who
  // comes back an hour later sees the finished result.
  app.get('/api/native/assignments/:assignmentId/check',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const assignmentId = toPositiveInt(request.params.assignmentId);
      if (!assignmentId) return reply.code(400).send({ error: 'invalid_assignment_id' });
      return { run: loadCheckRun(db, assignmentId) };
    }
  );
}
