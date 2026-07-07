/**
 * Parent report-card snippet generator.
 *
 * Grounded in the same kind of evidence as the teacher writing-profile
 * dashboard: err/100 trend, top codes with fix rates, stylometric trends,
 * the student's current strengths/targets, and rubric trajectory. Turns
 * that into one warm, jargon-free paragraph a parent can read. Nothing is
 * stored: the teacher gets {snippet} back to edit and paste into a report
 * card themselves.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent } from './settingsStore.js';
import { aggregateStyleProfile } from './styleMetrics.js';


const TOP_CODES_LIMIT = 5;

const DOER_SYSTEM_PROMPT = `You write ONE short paragraph for a parent about their child's English writing progress, based only on the evidence given. The parent does not know teaching jargon or any code names from the evidence, so translate everything into plain warm English.

Length: 60 to 100 words, one paragraph, no headings, no lists. Pick only the two or three numbers that matter most instead of listing everything you were given. Warm and encouraging, like a teacher writing home, but honest about what still needs work.

Never mention AI, a computer program, a tool, a checker or any automated process. Write as if the teacher noticed all of this directly.

No em dashes, no en dashes, no Oxford commas. Metric units only if any unit comes up.

Return ONLY JSON:
{"snippet": "..."}`;

function parseJsonObject(raw) {
  raw = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function round(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function gatherEvidence(db, studentId) {
  const padRows = db.prepare(`
    SELECT np.id AS pad_id, np.word_count, np.created_at,
           (SELECT COUNT(*) FROM student_literacy_evidence sle WHERE sle.native_pad_id = np.id) AS error_count
    FROM native_pads np
    WHERE np.student_id = ?
    ORDER BY np.created_at ASC, np.id ASC
  `).all(studentId);
  const errRates = padRows.map((row) => {
    const wc = Number(row.word_count ?? 0);
    const errors = Number(row.error_count ?? 0);
    return wc ? round((errors / wc) * 1000, 1) : 0;
  });

  const topCodes = db.prepare(`
    SELECT label, evidence_count, open_count, resolved_count
    FROM student_literacy_issue_stats
    WHERE student_id = ?
    ORDER BY evidence_count DESC
    LIMIT ?
  `).all(studentId, TOP_CODES_LIMIT);

  const snapshotRows = db.prepare(`
    SELECT total FROM score_snapshots
    WHERE student_id = ? AND rubric_kind = 'internal'
    ORDER BY recorded_at ASC, id ASC
  `).all(studentId);

  const profileRow = db.prepare(
    'SELECT writing_summary, voice_summary, targets_json FROM student_writing_profiles WHERE student_id = ?'
  ).get(studentId);

  const styleProfile = aggregateStyleProfile(db, { studentId });

  return {
    err_per_100_trend: {
      first: errRates.length ? errRates[0] : null,
      last: errRates.length ? errRates[errRates.length - 1] : null,
      essays_seen: errRates.length,
    },
    top_codes: topCodes.map((c) => ({
      label: c.label,
      evidence_count: c.evidence_count,
      resolved_count: c.resolved_count,
      open_count: c.open_count,
    })),
    stylometric_trends: styleProfile.features,
    writing_summary: profileRow?.writing_summary ?? '',
    voice_summary: profileRow?.voice_summary ?? '',
    strengths_and_targets: profileRow ? JSON.parse(profileRow.targets_json || '[]') : [],
    rubric_trajectory: {
      first: snapshotRows.length ? Number(snapshotRows[0].total) : null,
      last: snapshotRows.length ? Number(snapshotRows[snapshotRows.length - 1].total) : null,
    },
  };
}

/**
 * Write one parent-friendly report snippet for a student. Never throws;
 * on any failure (including a missing OpenRouter key) returns a clean,
 * teacher-facing error message instead.
 */
export async function generateReportSnippet(db, { studentId } = {}, { chat = callChat } = {}) {
  try {
    if (!studentId) return { status: 'error', message: 'No student selected.' };

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) return { status: 'error', message: 'Student not found.' };

    const evidence = gatherEvidence(db, studentId);

    const result = await chat(db, {
      intent: readDoerIntent(db),
      messages: [
        { role: 'system', content: DOER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(evidence) },
      ],
      maxTokens: 400,
      temperature: 0.3,
    });
    const output = parseJsonObject(result?.choices?.[0]?.message?.content);
    const snippet = typeof output?.snippet === 'string' ? output.snippet.trim() : '';
    if (!snippet) return { status: 'error', message: 'Could not write a report snippet right now.' };

    return { status: 'ok', snippet };
  } catch (error) {
    console.warn('[reportSnippet]', error?.message ?? error);
    const message = /openrouter_api_key/i.test(error?.message ?? '')
      ? 'Add an OpenRouter API key in settings before generating report snippets.'
      : 'Could not write a report snippet right now.';
    return { status: 'error', message };
  }
}
