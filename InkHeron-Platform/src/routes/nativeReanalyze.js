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
import { autoPromoteSuggestions, retractAiMarksForPad } from './nativePads.js';
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
async function reanalyzePad(db, pad) {
  const padId = pad.id;
  // Replace the previous AI run rather than stacking marks on top of it.
  retractAiMarksForPad(db, padId);
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
}
