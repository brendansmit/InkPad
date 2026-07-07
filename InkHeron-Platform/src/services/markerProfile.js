/**
 * Marker-preference profile (phase D3).
 *
 * The AI privately estimates a rubric score BEFORE the teacher marks. The
 * estimate is hidden so it cannot anchor the teacher. When the teacher's own
 * score lands, the delta is recorded, and over time the deltas describe how
 * this teacher marks relative to the model.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent } from './settingsStore.js';
import { parseJsonArraySalvage } from './literacyCoder.js';


const CHECKER_INTENT = 'google gemini flash';

function doerSystemPrompt(criteria) {
  const criteriaText = criteria.map((c) => {
    const bands = c.bands.map((b) => `  - score ${b.score_value} (${b.label}): ${b.descriptor}`).join('\n');
    return `Criterion ${c.id} "${c.label}" (score range ${c.min}-${c.max}):\n${bands}`;
  }).join('\n\n');
  return `You score a student essay strictly against the rubric bands given. The student is an L2 (second language) learner: grammar, spelling and punctuation are NOT grading factors and must never lower a score, unless an error is so severe it destroys meaning. Score ideas, organisation and task fulfilment exactly as the rubric bands describe.

RUBRIC:
${criteriaText}

For each criterion, pick the single band score that best matches the essay and give one short sentence of rationale that refers to something specific in the essay. Return ONLY JSON, one object per criterion, same order as given. "criterion_id" is the NUMBER after the word Criterion, never the label. "score" is the NUMERIC band score, never the band name:
[{"criterion_id": 12, "score": 4, "rationale": "one sentence"}]`;
}

const CHECKER_SYSTEM_PROMPT = `You are a strict verifier of rubric score estimates made by another model. You NEVER change a score. For each numbered estimate you are given the criterion's valid score range and the rationale. Judge only:
- "in_range": is the score within the given valid range?
- "grounded": does the rationale actually refer to something in the essay (not a generic statement)?

Return ONLY a JSON array, one object per estimate, same order:
[{"index": 0, "in_range": true, "grounded": true}]`;

function parseCandidates(raw) {
  raw = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = raw.indexOf('[');
  if (start < 0) return [];
  const end = raw.lastIndexOf(']');
  const items = parseJsonArraySalvage(end > start ? raw.slice(start, end + 1) : raw.slice(start));
  if (!items) return [];
  return items.filter((it) => it && it.criterion_id !== undefined && it.criterion_id !== null);
}

// Models sometimes answer with the criterion LABEL and the band NAME instead
// of the numeric ids the prompt demands (seen live with deepseek-chat).
// Map those back rather than dropping the whole estimate.
function normalizeCandidate(candidate, criteria) {
  let criterionId = Number(candidate.criterion_id);
  if (!Number.isInteger(criterionId)) {
    const label = String(candidate.criterion_id).trim().toLowerCase();
    const match = criteria.find((c) => c.label.trim().toLowerCase() === label);
    criterionId = match ? match.id : NaN;
  }
  const criterion = criteria.find((c) => c.id === criterionId);
  let score = Number(candidate.score);
  if (!Number.isFinite(score) && criterion) {
    const bandLabel = String(candidate.score).trim().toLowerCase();
    const band = criterion.bands.find((b) => (b.label ?? '').trim().toLowerCase() === bandLabel);
    if (band) score = Number(band.score_value);
  }
  return {
    criterion_id: criterionId,
    score,
    rationale: typeof candidate.rationale === 'string' ? candidate.rationale.trim().slice(0, 500) : '',
  };
}

function loadRubricByKind(db, assignmentId) {
  const criteria = db.prepare(`
    SELECT * FROM assignment_rubric_criteria WHERE assignment_id = ? ORDER BY rubric_kind ASC, sort_order ASC, id ASC
  `).all(assignmentId);
  if (!criteria.length) return new Map();
  const bandRows = db.prepare(`
    SELECT b.* FROM assignment_rubric_bands b
    JOIN assignment_rubric_criteria c ON c.id = b.criterion_id
    WHERE c.assignment_id = ?
    ORDER BY b.sort_order ASC, b.score_value ASC, b.id ASC
  `).all(assignmentId);
  const bandsByCriterion = new Map();
  for (const band of bandRows) {
    const list = bandsByCriterion.get(band.criterion_id) ?? [];
    list.push({ score_value: Number(band.score_value), label: band.label ?? '', descriptor: band.descriptor ?? '' });
    bandsByCriterion.set(band.criterion_id, list);
  }
  const byKind = new Map();
  for (const c of criteria) {
    const bands = bandsByCriterion.get(c.id) ?? [];
    if (!bands.length) continue;
    const scores = bands.map((b) => b.score_value);
    const kind = c.rubric_kind ?? 'internal';
    const list = byKind.get(kind) ?? [];
    list.push({ id: c.id, label: c.label, bands, min: Math.min(...scores), max: Math.max(...scores) });
    byKind.set(kind, list);
  }
  return byKind;
}

/**
 * ============================ SEAM FOR FABLE ============================
 * Phase D3. See FABLE_HANDOFF.md and CLAUDE.md §8.1 (formative literacy,
 * grade estimate never shown during marking).
 *
 * Contract:
 *   input  : db, { padId }
 *   reads  : native_pads.plain_text, the assignment's rubric criteria/bands
 *            (assignment_rubric_criteria + bands) for each rubric_kind.
 *   does   : Doer + Checker estimate a score per criterion.
 *   writes : one row per (pad, rubric_kind, criterion) into ai_grade_estimates
 *            with ai_score, model, rationale, teacher_score/delta left NULL.
 *            Run at submit time, before the teacher marks. Upsert-safe:
 *            clear prior estimate rows for the pad first.
 *   returns: { status } — never throws to the caller.
 * =======================================================================
 */
export async function estimateRubric(db, { padId } = {}, { chat = callChat } = {}) {
  try {
    const pad = db.prepare('SELECT id, plain_text, student_id, assignment_id FROM native_pads WHERE id = ?').get(padId);
    if (!pad || !pad.plain_text || !/\w/.test(pad.plain_text)) return { status: 'skipped' };

    const rubricByKind = loadRubricByKind(db, pad.assignment_id);
    if (rubricByKind.size === 0) return { status: 'skipped' };

    const surviving = [];
    for (const [rubricKind, criteria] of rubricByKind) {
      const criteriaById = new Map(criteria.map((c) => [c.id, c]));
      const result = await chat(db, {
        intent: readDoerIntent(db),
        messages: [
          { role: 'system', content: doerSystemPrompt(criteria) },
          { role: 'user', content: pad.plain_text },
        ],
        maxTokens: 2000,
        temperature: 0,
      });
      const modelId = result?.model ?? '';
      const candidates = parseCandidates(result?.choices?.[0]?.message?.content ?? '');

      // Deterministic guard: always applied, checker or not. An invalid
      // score poisons the delta data, so drop rather than clamp.
      const inRange = candidates
        .map((c) => normalizeCandidate(c, criteria))
        .filter((c) => {
          const criterion = criteriaById.get(c.criterion_id);
          return criterion && Number.isFinite(c.score) && c.score >= criterion.min && c.score <= criterion.max;
        });
      if (!inRange.length) continue;

      let checkerVerdicts = null;
      try {
        const listing = inRange.map((c, i) => {
          const criterion = criteriaById.get(c.criterion_id);
          return `${i}. criterion="${criterion.label}" valid_range=${criterion.min}-${criterion.max} score=${c.score} rationale="${c.rationale}"`;
        }).join('\n');
        const checkerResult = await chat(db, {
          intent: CHECKER_INTENT,
          messages: [
            { role: 'system', content: CHECKER_SYSTEM_PROMPT },
            { role: 'user', content: `ESSAY:\n${pad.plain_text}\n\nESTIMATES:\n${listing}` },
          ],
          maxTokens: 1500,
          temperature: 0,
        });
        const parsed = parseJsonArraySalvage((() => {
          const raw = String(checkerResult?.choices?.[0]?.message?.content ?? '')
            .replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
          const start = raw.indexOf('[');
          const end = raw.lastIndexOf(']');
          return start < 0 ? '' : (end > start ? raw.slice(start, end + 1) : raw.slice(start));
        })());
        if (parsed) {
          checkerVerdicts = new Map();
          for (const v of parsed) {
            if (v && Number.isInteger(v.index)) checkerVerdicts.set(v.index, v);
          }
        }
      } catch (error) {
        console.warn('[markerProfile] checker unavailable:', error?.message ?? error);
      }

      inRange.forEach((c, i) => {
        const verdict = checkerVerdicts?.get(i);
        // Checker unavailable: keep the deterministically-guarded estimate.
        // Checker present and flags it invalid: drop.
        if (verdict && (verdict.in_range === false || verdict.grounded === false)) return;
        surviving.push({ rubric_kind: rubricKind, criterion_id: c.criterion_id, ai_score: c.score, rationale: c.rationale, model: modelId });
      });
    }

    const clear = db.prepare('DELETE FROM ai_grade_estimates WHERE native_pad_id = ?');
    const insert = db.prepare(`
      INSERT INTO ai_grade_estimates (native_pad_id, student_id, assignment_id, rubric_kind, criterion_id, ai_score, model, rationale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      clear.run(padId);
      for (const s of surviving) {
        insert.run(padId, pad.student_id, pad.assignment_id, s.rubric_kind, s.criterion_id, s.ai_score, s.model, s.rationale);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    if (!surviving.length) console.warn('[markerProfile] no estimate survived validation for pad', padId);
    return { status: 'ok', written: surviving.length };
  } catch (error) {
    console.warn('[markerProfile]', error?.message ?? error);
    return { status: 'error', written: 0 };
  }
}

/**
 * Deterministic (non-AI) half of the marker profile: when the teacher saves
 * their own scores, fill teacher_score and delta on any matching hidden AI
 * estimate rows for this pad + rubric_kind. Safe to call even when no AI
 * estimate exists (it simply updates nothing). Implemented here, not a stub.
 *
 * scores: [{ criterion_id, selected_score }]
 */
export function recordTeacherScores(db, { padId, rubricKind = 'internal', scores = [] } = {}) {
  if (!padId || !Array.isArray(scores) || !scores.length) return { updated: 0 };
  const update = db.prepare(`
    UPDATE ai_grade_estimates
    SET teacher_score = ?,
        delta = CASE WHEN ai_score IS NULL THEN NULL ELSE (ai_score - ?) END,
        scored_at = datetime('now')
    WHERE native_pad_id = ? AND rubric_kind = ? AND criterion_id = ?
  `);
  let updated = 0;
  for (const item of scores) {
    const criterionId = Number(item?.criterion_id);
    const teacherScore = Number(item?.selected_score);
    if (!Number.isInteger(criterionId) || !Number.isFinite(teacherScore)) continue;
    const result = update.run(teacherScore, teacherScore, padId, rubricKind, criterionId);
    updated += result.changes ?? 0;
  }
  return { updated };
}
