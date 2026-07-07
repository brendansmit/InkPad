/**
 * Teacher-correction calibration (the learning loop).
 *
 * The models cannot be fine-tuned, but every marking session leaves three
 * kinds of correction signal in the database:
 *   1. false positives — AI findings the teacher rejected/disagreed with;
 *   2. misses — literacy_code annotations the teacher added by hand
 *      (metadata source 'teacher', via the selection toolbar);
 *   3. recodes — annotation_updated events where the teacher changed the
 *      code the analysis chose (code_from/code_to in the event metadata).
 *
 * buildCalibration turns the most recent of these into a compact prompt
 * block that is appended to the Doer and Checker system prompts on every
 * run. So the analysis gets more accurate for THIS teacher with every essay
 * they mark, without any training step. The block is hard-capped so it can
 * never crowd out the main prompt.
 */

const MAX_CODES_PER_SIGNAL = 5;
const MAX_EXAMPLES_PER_CODE = 3;
const MAX_QUOTE_CHARS = 60;
const RECENT_LIMIT = 60;

function clip(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_QUOTE_CHARS ? `${t.slice(0, MAX_QUOTE_CHARS)}...` : t;
}

function groupByCode(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.code || !row.quote) continue;
    const group = groups.get(row.code) ?? [];
    if (group.length < MAX_EXAMPLES_PER_CODE && !group.includes(clip(row.quote))) group.push(clip(row.quote));
    groups.set(row.code, group);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_CODES_PER_SIGNAL);
}

function safeParse(json) {
  try { return JSON.parse(json ?? '{}'); } catch { return {}; }
}

export function buildCalibration(db) {
  try {
    const rejected = db.prepare(`
      SELECT code, quote FROM ai_literacy_suggestions
      WHERE status = 'rejected'
      ORDER BY resolved_at DESC, id DESC LIMIT ${RECENT_LIMIT}
    `).all();

    const added = db.prepare(`
      SELECT metadata_json, selected_text AS quote FROM native_annotations
      WHERE type = 'literacy_code' AND metadata_json LIKE '%"source":"teacher"%'
      ORDER BY created_at DESC, id DESC LIMIT ${RECENT_LIMIT}
    `).all().map((row) => ({ code: safeParse(row.metadata_json).code, quote: row.quote }));

    const recodes = db.prepare(`
      SELECT metadata_json FROM native_teacher_events
      WHERE action = 'annotation_updated' AND metadata_json LIKE '%code_from%'
      ORDER BY created_at DESC, id DESC LIMIT ${RECENT_LIMIT}
    `).all().map((row) => safeParse(row.metadata_json)).filter((m) => m.code_from && m.code_to);

    const parts = [];

    const falsePositives = groupByCode(rejected);
    if (falsePositives.length) {
      parts.push('The teacher REJECTED findings like these as not errors. Do not flag similar usage:\n'
        + falsePositives.map(([code, quotes]) => `- ${code}: ${quotes.map((q) => `"${q}"`).join(', ')}`).join('\n'));
    }

    const misses = groupByCode(added);
    if (misses.length) {
      parts.push('The teacher had to ADD marks like these by hand because the analysis missed them. Watch carefully for similar errors:\n'
        + misses.map(([code, quotes]) => `- ${code}: ${quotes.map((q) => `"${q}"`).join(', ')}`).join('\n'));
    }

    if (recodes.length) {
      const pairCounts = new Map();
      for (const r of recodes) {
        const key = `${r.code_from} -> ${r.code_to}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
      const pairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CODES_PER_SIGNAL);
      parts.push('The teacher often CHANGES these codes. Prefer the second code when the case is like the example:\n'
        + pairs.map(([pair, n]) => {
          const example = recodes.find((r) => `${r.code_from} -> ${r.code_to}` === pair);
          return `- ${pair} (${n}x)${example?.quote ? `: "${clip(example.quote)}"` : ''}`;
        }).join('\n'));
    }

    if (!parts.length) return '';
    return '\n\nCALIBRATION from this teacher\'s past corrections (weigh heavily, they know their students):\n' + parts.join('\n');
  } catch (error) {
    console.warn('[promptCalibration]', error?.message ?? error);
    return '';
  }
}
