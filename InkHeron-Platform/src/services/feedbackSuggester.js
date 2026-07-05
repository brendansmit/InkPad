/**
 * Strengths/targets suggester.
 *
 * Runs after submit and triangulates the assignment prompt, the essay text,
 * the rubric bands and the student's recurring literacy issues into a short
 * list of strengths and targets. These are hidden suggestions: the teacher
 * picks which ones become real feedback (see native_feedback_items and the
 * accept/reject endpoints in nativePads.js). Nothing here auto-applies.
 */
import { callChat } from './openRouter.js';
import { parseJsonArraySalvage } from './literacyCoder.js';

const DOER_INTENT = 'anthropic claude haiku';
const CHECKER_INTENT = 'google gemini flash';
const MAX_STRENGTHS = 3;
const MAX_TARGETS = 5;

const DOER_SYSTEM_PROMPT = `You read one student essay against its assignment prompt and rubric, and against the student's recurring issues from past essays, and suggest strengths and targets for the teacher to consider. This is formative coaching for an English learner (L2), not a grade. Grammar and spelling issues are practice targets, never punishment.

Tie every item to what the rubric expected versus what the essay actually did. A strength is something the essay does well against the rubric or the prompt. A target is something the essay could do better against the rubric or the prompt, especially if it matches one of the student's recurring issues. "try_now_prompt" on a target is one short, concrete instruction the student could apply right now in a revision.

Give 2 to 3 strengths and 3 to 5 targets, most important first.

Write like a friendly teacher talking directly to the student, not like a report. Use "you", use contractions, keep sentences short. Low C1 level. No em dashes, no en dashes, no Oxford commas. Metric units only if any unit is mentioned. Titles stay short, 3 to 6 words.

Example of the tone shift, same finding:
Too stiff: title "Improve verb tense consistency", explanation "The essay demonstrates inconsistent temporal marking."
Wanted: title "Keep your tenses steady", explanation "You start in the past then jump to the present in the same sentence. Pick the time frame first, then keep every verb in it."

Return ONLY JSON:
{"strengths": [{"title": "...", "explanation": "..."}], "targets": [{"title": "...", "explanation": "...", "try_now_prompt": "..."}]}`;

const CHECKER_SYSTEM_PROMPT = `You verify suggested essay feedback against the essay it was built from. You NEVER add or rewrite content. For each numbered item, judge:
- "supported": does the essay actually show what this item claims (whether praising a strength or pointing at a gap)?
- "confidence": 0 to 1, how sure you are.

Return ONLY a JSON array, one object per item, same order:
[{"index": 0, "supported": true, "confidence": 0.9}]`;

function parseObject(raw) {
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

function parseSettingsJson(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeItems(list, extraFields) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.title === 'string' && item.title.trim())
    .map((item) => {
      const normalized = {
        title: item.title.trim().slice(0, 180),
        explanation: typeof item.explanation === 'string' ? item.explanation.trim().slice(0, 4000) : '',
      };
      for (const field of extraFields) {
        normalized[field] = typeof item[field] === 'string' ? item[field].trim().slice(0, 2000) : '';
      }
      return normalized;
    });
}

function loadRubricContext(db, assignmentId) {
  const criteria = db.prepare(`
    SELECT id, rubric_kind, label, description
    FROM assignment_rubric_criteria
    WHERE assignment_id = ?
    ORDER BY rubric_kind ASC, sort_order ASC, id ASC
  `).all(assignmentId);
  if (!criteria.length) return [];
  const bandRows = db.prepare(`
    SELECT b.criterion_id, b.label, b.descriptor
    FROM assignment_rubric_bands b
    JOIN assignment_rubric_criteria c ON c.id = b.criterion_id
    WHERE c.assignment_id = ?
    ORDER BY b.sort_order ASC, b.score_value ASC, b.id ASC
  `).all(assignmentId);
  const bandsByCriterion = new Map();
  for (const band of bandRows) {
    const list = bandsByCriterion.get(band.criterion_id) ?? [];
    list.push({ label: band.label ?? '', descriptor: band.descriptor ?? '' });
    bandsByCriterion.set(band.criterion_id, list);
  }
  return criteria.map((c) => ({
    rubric_kind: c.rubric_kind ?? 'internal',
    label: c.label,
    description: c.description ?? '',
    bands: bandsByCriterion.get(c.id) ?? [],
  }));
}

/**
 * Analyse one submitted pad and write hidden strength/target suggestions to
 * ai_feedback_item_suggestions for the teacher to accept or reject.
 */
export async function suggestFeedbackItems(db, { padId } = {}, { chat = callChat } = {}) {
  try {
    const pad = db.prepare('SELECT id, plain_text, student_id, assignment_id FROM native_pads WHERE id = ?').get(padId);
    if (!pad || !pad.plain_text || !/\w/.test(pad.plain_text)) return { status: 'skipped' };

    const assignment = db.prepare('SELECT settings_json FROM assignments WHERE id = ?').get(pad.assignment_id);
    const settings = parseSettingsJson(assignment?.settings_json);

    const rubric = loadRubricContext(db, pad.assignment_id);

    const issueRows = db.prepare(`
      SELECT code, category, label, evidence_count, open_count
      FROM student_literacy_issue_stats
      WHERE student_id = ?
      ORDER BY open_count DESC, evidence_count DESC
      LIMIT 10
    `).all(pad.student_id);

    const evidence = {
      assignment_prompt: settings.prompt || '',
      essay: pad.plain_text,
      rubric,
      student_recurring_issues: issueRows,
    };

    const result = await chat(db, {
      intent: DOER_INTENT,
      messages: [
        { role: 'system', content: DOER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(evidence) },
      ],
      maxTokens: 2000,
      temperature: 0,
    });
    const modelId = result?.model ?? '';
    const doerOutput = parseObject(result?.choices?.[0]?.message?.content);
    if (!doerOutput) throw new Error('unparseable feedback suggestion response');

    const strengths = normalizeItems(doerOutput.strengths, []).slice(0, MAX_STRENGTHS)
      .map((item) => ({ kind: 'strength', ...item, try_now_prompt: '' }));
    const targets = normalizeItems(doerOutput.targets, ['try_now_prompt']).slice(0, MAX_TARGETS)
      .map((item) => ({ kind: 'target', ...item }));
    const items = [...strengths, ...targets];
    if (!items.length) {
      db.prepare("DELETE FROM ai_feedback_item_suggestions WHERE native_pad_id = ? AND status = 'pending'").run(padId);
      return { status: 'ok' };
    }

    let verdicts = null;
    try {
      const listing = items.map((item, i) => `${i}. [${item.kind}] "${item.title}" — ${item.explanation}`).join('\n');
      const checkerResult = await chat(db, {
        intent: CHECKER_INTENT,
        messages: [
          { role: 'system', content: CHECKER_SYSTEM_PROMPT },
          { role: 'user', content: `ESSAY:\n${pad.plain_text}\n\nITEMS:\n${listing}` },
        ],
        maxTokens: 1200,
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
        verdicts = new Map();
        for (const v of parsed) {
          if (v && Number.isInteger(v.index)) verdicts.set(v.index, v);
        }
      }
    } catch (error) {
      console.warn('[feedbackSuggester] checker unavailable:', error?.message ?? error);
    }

    const surviving = items
      .map((item, i) => ({ ...item, checker: verdicts?.get(i) ?? null }))
      .filter((item) => !(item.checker && item.checker.supported === false && typeof item.checker.confidence === 'number' && item.checker.confidence >= 0.8));

    const clear = db.prepare("DELETE FROM ai_feedback_item_suggestions WHERE native_pad_id = ? AND status = 'pending'");
    const insert = db.prepare(`
      INSERT INTO ai_feedback_item_suggestions
        (native_pad_id, kind, title, explanation, try_now_prompt, model, checker_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    db.exec('BEGIN');
    try {
      clear.run(padId);
      for (const item of surviving) {
        insert.run(padId, item.kind, item.title, item.explanation, item.try_now_prompt, modelId, JSON.stringify(item.checker ?? {}));
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return { status: 'ok' };
  } catch (error) {
    console.warn('[feedbackSuggester]', error?.message ?? error);
    return { status: 'error' };
  }
}
