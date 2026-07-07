/**
 * TOEFL writing-score estimator (teacher only).
 *
 * Turns the evidence InkHeron already holds for one student into a directional
 * estimate of what their TOEFL iBT writing score might be. This is coaching
 * intelligence for the teacher, never a promise, and it must NEVER reach a
 * student-facing payload, page or push (same wall as ai_grade_estimates).
 *
 * TOEFL iBT writing = two tasks (Integrated, Writing for an Academic
 * Discussion), each banded 0 to 5, reported scaled 0 to 30. The output is a
 * RANGE (scaled_low to scaled_high), never a single number.
 *
 * Modelled line for line on the Doer/Checker pattern in profileSummarizer.js:
 * a capable Doer proposes JSON, a different cheaper Checker
 * validates it against the evidence and can ONLY blank fields it cannot
 * support, never rewrite them.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent, readCheckerIntent } from './settingsStore.js';
import { aggregateStyleProfile } from './styleMetrics.js';
import { realStudentsWhere } from '../db/realStudents.js';

const MIN_ESSAYS = 2;

const DOER_SYSTEM_PROMPT = `You estimate a TOEFL iBT writing score for one English learner (L2) student, based only on the evidence given. This is a directional signal for the student's teacher, never a promise and never shown to the student.

TOEFL iBT writing has two tasks, each banded 0 to 5 and reported on a scaled 0 to 30 range:
- Integrated writing: read and listen, then summarise how the two relate. Rewards accurate reporting, clear organisation, and control of paraphrase.
- Writing for an Academic Discussion: state and support a position in an online discussion. Rewards a clear stance, relevant reasons, range and control of language.

Estimate a RANGE, never a single number. Ground every claim in the numbers you are given. Use the literacy issue rates per 100 words (essays differ in length, so rates not raw counts), the rubric score trajectory, the stylometric fingerprint (overall and by essay type, e.g. sentence control, lexical variety MATTR, transitions), and word counts. When known real TOEFL writing scores for classmates are given, use them to anchor your bands ("students with these numbers scored around X"). The rationale must cite specific evidence (issue rates, MATTR, sentence control, score trend), not vibes.

Bands: integrated_band and discussion_band each 0 to 5 (one decimal is fine). Scaled: scaled_low and scaled_high each 0 to 30 integers, with scaled_low <= scaled_high. confidence 0 to 1 reflecting how much evidence supports the estimate.

Return ONLY JSON:
{"integrated_band": 0-5, "discussion_band": 0-5, "scaled_low": 0-30, "scaled_high": 0-30, "confidence": 0-1, "rationale": "2 to 4 sentences grounded in the evidence"}`;

const CHECKER_SYSTEM_PROMPT = `You verify a TOEFL writing estimate against the evidence it was built from. You NEVER add or rewrite content. For each field judge whether it is actually supported by the evidence given:
- "supported": is the value backed by the evidence?
- "confidence": 0 to 1, how sure you are.

Return ONLY JSON:
{"integrated_band": {"supported": true, "confidence": 0.9}, "discussion_band": {"supported": true, "confidence": 0.9}, "scaled_range": {"supported": true, "confidence": 0.9}, "rationale": {"supported": true, "confidence": 0.9}}`;

function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

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

function clampNumber(value, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function clampScaled(value) {
  const n = clampNumber(value, 0, 30);
  return n == null ? null : Math.round(n);
}

/**
 * Estimate the student's TOEFL writing score from stored evidence and write a
 * new row to toefl_estimates (history is kept, newest wins for display).
 *
 * Returns { status: 'ok' | 'skipped' | 'error', estimate? }.
 */
export async function generateToeflEstimate(db, { studentId } = {}, { chat = callChat } = {}) {
  try {
    if (!studentId) return { status: 'skipped', reason: 'no_student' };

    const student = db.prepare('SELECT id, class_id FROM students WHERE id = ?').get(studentId);
    if (!student) return { status: 'skipped', reason: 'unknown_student' };

    const styleProfile = aggregateStyleProfile(db, { studentId });
    if (styleProfile.essays < MIN_ESSAYS) {
      return { status: 'skipped', reason: 'insufficient_essays', essays: styleProfile.essays };
    }

    const issueRows = db.prepare(`
      SELECT code, category, label, evidence_count, open_count, resolved_count
      FROM student_literacy_issue_stats
      WHERE student_id = ?
      ORDER BY open_count DESC, evidence_count DESC
    `).all(studentId);

    const snapshotRows = db.prepare(`
      SELECT ss.rubric_kind, ss.total, ss.recorded_at,
             COALESCE(json_extract(a.settings_json, '$.essay_type'), 'other') AS essay_type
      FROM score_snapshots ss
      JOIN assignments a ON a.id = ss.assignment_id
      WHERE ss.student_id = ?
      ORDER BY ss.recorded_at ASC
    `).all(studentId);

    const { total: totalWords } = db.prepare(
      'SELECT COALESCE(SUM(word_count), 0) AS total FROM style_metrics WHERE student_id = ?'
    ).get(studentId);

    // Per-100-words rates, never raw counts, so essays of different lengths
    // compare fairly (CLAUDE.md normalization rule).
    const issueRates = issueRows.map((row) => ({
      code: row.code,
      category: row.category,
      label: row.label,
      rate_per_100_words: totalWords > 0 ? round((row.evidence_count / totalWords) * 100) : 0,
      open_count: row.open_count,
      resolved_count: row.resolved_count,
    }));

    // Class anchors: real classmates' known real TOEFL writing scores. Demo and
    // ghost accounts are excluded so they never skew the anchor set.
    const anchorRows = student.class_id ? db.prepare(`
      SELECT k.writing_score, k.noted_at
      FROM known_toefl_scores k
      JOIN students s ON s.id = k.student_id
      WHERE s.class_id = ? AND ${realStudentsWhere('s')}
      ORDER BY k.created_at DESC
      LIMIT 40
    `).all(student.class_id) : [];

    const evidence = {
      total_words_seen: totalWords,
      essays_with_style_data: styleProfile.essays,
      recurring_issue_rates: issueRates,
      score_trajectory: snapshotRows.map((r) => ({ rubric_kind: r.rubric_kind, essay_type: r.essay_type, total: r.total, at: r.recorded_at })),
      style_fingerprint: styleProfile.features,
      style_fingerprint_by_essay_type: styleProfile.by_essay_type,
      class_known_toefl_writing_scores: anchorRows.map((r) => ({ writing_score: r.writing_score, noted_at: r.noted_at })),
    };

    const result = await chat(db, {
      intent: readDoerIntent(db),
      messages: [
        { role: 'system', content: DOER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(evidence) },
      ],
      maxTokens: 1200,
      temperature: 0,
    });
    const doerOutput = parseJsonObject(result?.choices?.[0]?.message?.content);
    if (!doerOutput) throw new Error('unparseable toefl estimate response');

    let fields = {
      integrated_band: clampNumber(doerOutput.integrated_band, 0, 5),
      discussion_band: clampNumber(doerOutput.discussion_band, 0, 5),
      scaled_low: clampScaled(doerOutput.scaled_low),
      scaled_high: clampScaled(doerOutput.scaled_high),
      confidence: clampNumber(doerOutput.confidence, 0, 1),
      rationale: typeof doerOutput.rationale === 'string' ? doerOutput.rationale.trim() : '',
    };

    // Keep the range ordered no matter what the model returned.
    if (fields.scaled_low != null && fields.scaled_high != null && fields.scaled_low > fields.scaled_high) {
      const lo = fields.scaled_high;
      fields.scaled_high = fields.scaled_low;
      fields.scaled_low = lo;
    }

    try {
      const checkerResult = await chat(db, {
        intent: readCheckerIntent(db),
        messages: [
          { role: 'system', content: CHECKER_SYSTEM_PROMPT },
          { role: 'user', content: `EVIDENCE:\n${JSON.stringify(evidence)}\n\nESTIMATE:\n${JSON.stringify(fields)}` },
        ],
        maxTokens: 600,
        temperature: 0,
      });
      const verdicts = parseJsonObject(checkerResult?.choices?.[0]?.message?.content);
      if (verdicts) {
        const blank = (v) => v && v.supported === false && typeof v.confidence === 'number' && v.confidence >= 0.8;
        if (blank(verdicts.integrated_band)) fields.integrated_band = null;
        if (blank(verdicts.discussion_band)) fields.discussion_band = null;
        if (blank(verdicts.scaled_range)) { fields.scaled_low = null; fields.scaled_high = null; }
        if (blank(verdicts.rationale)) fields.rationale = '';
      }
    } catch (error) {
      console.warn('[toeflEstimator] checker unavailable:', error?.message ?? error);
    }

    const model = typeof result?.model === 'string' ? result.model : '';
    const info = db.prepare(`
      INSERT INTO toefl_estimates
        (student_id, integrated_band, discussion_band, scaled_low, scaled_high, confidence, rationale, evidence_json, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      fields.integrated_band,
      fields.discussion_band,
      fields.scaled_low,
      fields.scaled_high,
      fields.confidence,
      fields.rationale,
      JSON.stringify(evidence),
      model,
    );

    return { status: 'ok', estimate: { id: Number(info.lastInsertRowid), ...fields, model } };
  } catch (error) {
    console.warn('[toeflEstimator]', error?.message ?? error);
    return { status: 'error' };
  }
}
