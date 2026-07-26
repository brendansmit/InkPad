/**
 * Green-pen implementation scorer (phase D2).
 *
 * Judges whether a student's rewrite actually acted on the feedback, versus
 * making cosmetic edits. Two evidence layers, merged:
 *
 *   1. Deterministic diff. Word-level LCS similarity computed twice — on raw
 *      tokens and on normalized tokens (lowercased, punctuation stripped).
 *      Change that disappears under normalization is cosmetic (case and
 *      punctuation shuffling). Per span-anchored feedback item we also check
 *      whether the flagged text still appears unchanged in the rewrite.
 *   2. One AI judgement call over original, rewrite and the feedback list,
 *      deciding per item whether it was addressed and whether the revision
 *      was meaningful overall.
 *
 * A span-anchored item counts as addressed only when BOTH layers agree the
 * flagged text changed; the AI alone cannot mark an untouched span addressed.
 * `meaningful` is the AI verdict gated by the diff: if the deterministic diff
 * shows no non-cosmetic change, the rewrite cannot be meaningful.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent } from './settingsStore.js';
import { literacyCodeLabel } from './literacyCodeRegistry.js';



const JUDGE_SYSTEM_PROMPT = `You judge whether a student's rewrite acted on their teacher's feedback. You are given the ORIGINAL text, the REWRITE, and a numbered FEEDBACK list (literacy codes with the flagged quote, inline comments, and improvement targets).

For each feedback item decide "addressed": did the student genuinely fix or act on it in the rewrite? Fixing the quoted error counts. Deleting the sentence containing it counts. Leaving it unchanged or making an equivalent error does not.

Also decide overall:
- "meaningful": true only if the rewrite shows real revision work (reworded ideas, fixed errors, restructured sentences), false if it is essentially the same text with trivial edits.
- "summary": one or two plain sentences for the teacher describing what the student did and did not act on. No em dashes, no en dashes, no Oxford commas.

Return ONLY JSON:
{"items":[{"index":0,"addressed":true,"note":"<very short reason>"}],"meaningful":true,"summary":"..."}`;

export function tokenize(text, { normalize = false } = {}) {
  let t = String(text ?? '');
  if (normalize) t = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return t.split(/\s+/).filter(Boolean);
}

function lcsLength(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function similarity(tokensA, tokensB) {
  const total = tokensA.length + tokensB.length;
  if (total === 0) return 1;
  return (2 * lcsLength(tokensA, tokensB)) / total;
}

/**
 * Deterministic diff verdict between original and rewrite.
 * cosmetic_ratio: of the change that happened, what share vanishes when case
 * and punctuation are ignored (1 = all cosmetic, 0 = all substantive).
 * has_substantive_change: any change survives normalization.
 */
export function diffVerdict(originalText, rewriteText) {
  const rawSim = similarity(tokenize(originalText), tokenize(rewriteText));
  const normSim = similarity(tokenize(originalText, { normalize: true }), tokenize(rewriteText, { normalize: true }));
  const changeRaw = 1 - rawSim;
  const changeSubstantive = 1 - normSim;
  const cosmeticShare = changeRaw <= 1e-9 ? 1
    : Math.max(0, Math.min(1, (changeRaw - changeSubstantive) / changeRaw));
  return {
    raw_similarity: rawSim,
    normalized_similarity: normSim,
    cosmetic_ratio: cosmeticShare,
    has_substantive_change: changeSubstantive > 0.002,
  };
}

// Did the exact flagged text survive into the rewrite untouched?
function spanStillPresent(rewriteText, selectedText) {
  const needle = String(selectedText ?? '').trim();
  if (!needle) return false;
  return rewriteText.includes(needle);
}

function parseJudgement(raw) {
  raw = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch { return null; }
}

export async function scoreRewrite(db, { rewritePadId } = {}, { chat = callChat } = {}) {
  try {
    const rewrite = db.prepare(
      'SELECT id, student_id, plain_text, rewrite_of_pad_id FROM native_pads WHERE id = ?'
    ).get(rewritePadId);
    if (!rewrite || !rewrite.rewrite_of_pad_id) return { status: 'skipped' };
    const original = db.prepare('SELECT id, plain_text FROM native_pads WHERE id = ?').get(rewrite.rewrite_of_pad_id);
    if (!original) return { status: 'skipped' };

    const annotations = db.prepare(`
      SELECT id, type, selected_text, body, metadata_json FROM native_annotations
      WHERE native_pad_id = ? AND type IN ('literacy_code', 'inline_comment')
      ORDER BY start_offset
    `).all(original.id);
    const targets = db.prepare(`
      SELECT id, title, explanation FROM native_feedback_items
      WHERE native_pad_id = ? AND kind = 'target' ORDER BY sort_order, id
    `).all(original.id);

    // Feedback items in one numbered list for the judge.
    const items = [
      ...annotations.map((a) => {
        let metadata = {};
        try { metadata = JSON.parse(a.metadata_json || '{}'); } catch { metadata = {}; }
        const code = a.type === 'literacy_code' ? (metadata.code || a.body || '') : null;
        return {
          kind: a.type, id: a.id, code, label: code ? literacyCodeLabel(code) : null,
          quote: a.selected_text, comment: a.type === 'inline_comment' ? a.body : null,
          span_unchanged: spanStillPresent(rewrite.plain_text, a.selected_text),
        };
      }),
      ...targets.map((t) => ({
        kind: 'target', id: t.id, title: t.title, explanation: t.explanation, span_unchanged: null,
      })),
    ];

    const diff = diffVerdict(original.plain_text, rewrite.plain_text);

    let judgement = null;
    let modelId = '';
    if (items.length > 0 || rewrite.plain_text) {
      const listing = items.map((it, i) => {
        if (it.kind === 'literacy_code') return `${i}. [code ${it.code}: ${it.label}] flagged text: "${it.quote}"`;
        if (it.kind === 'inline_comment') return `${i}. [comment] on "${it.quote}": ${it.comment}`;
        return `${i}. [target] ${it.title}: ${it.explanation}`;
      }).join('\n');
      const result = await chat(db, {
        intent: readDoerIntent(db),
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: `ORIGINAL:\n${original.plain_text}\n\nREWRITE:\n${rewrite.plain_text}\n\nFEEDBACK:\n${listing || '(none)'}` },
        ],
        maxTokens: 1500,
        temperature: 0,
      });
      modelId = result?.model ?? '';
      judgement = parseJudgement(result?.choices?.[0]?.message?.content);
      if (!judgement) throw new Error('unparseable judgement response');
    }

    const aiItems = new Map((judgement?.items ?? []).map((it) => [it.index, it]));
    const judged = items.map((it, i) => {
      const ai = aiItems.get(i);
      const aiAddressed = ai?.addressed === true;
      // Span-anchored items need both layers: the AI says addressed AND the
      // flagged text actually changed. Targets have no span; the AI decides.
      const addressed = it.span_unchanged === null ? aiAddressed : (aiAddressed && !it.span_unchanged);
      return { ...it, addressed, ai_note: ai?.note ?? '' };
    });

    const codes = judged.filter((it) => it.kind === 'literacy_code')
      .map((it) => ({ id: it.id, code: it.code, quote: it.quote, addressed: it.addressed, note: it.ai_note }));
    const comments = judged.filter((it) => it.kind === 'inline_comment')
      .map((it) => ({ id: it.id, quote: it.quote, comment: it.comment, addressed: it.addressed, note: it.ai_note }));
    const targetVerdicts = judged.filter((it) => it.kind === 'target')
      .map((it) => ({ id: it.id, title: it.title, addressed: it.addressed, note: it.ai_note }));

    const meaningful = judgement?.meaningful === true && diff.has_substantive_change ? 1 : 0;
    const addressedJson = JSON.stringify({
      codes,
      targets: targetVerdicts,
      inline_comments: comments,
      inline_comments_addressed: comments.filter((c) => c.addressed).length,
      inline_comments_total: comments.length,
      diff,
    });
    const summary = typeof judgement?.summary === 'string' ? judgement.summary : '';

    db.prepare(`
      INSERT INTO implementation_scores
        (rewrite_pad_id, original_pad_id, student_id, addressed_json, cosmetic_ratio, meaningful, summary, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rewrite_pad_id) DO UPDATE SET
        original_pad_id = excluded.original_pad_id,
        addressed_json = excluded.addressed_json,
        cosmetic_ratio = excluded.cosmetic_ratio,
        meaningful = excluded.meaningful,
        summary = excluded.summary,
        model = excluded.model
    `).run(rewrite.id, original.id, rewrite.student_id, addressedJson, diff.cosmetic_ratio, meaningful, summary, modelId);

    return { status: 'ok' };
  } catch (error) {
    console.warn('[implementationScorer]', error?.message ?? error);
    return { status: 'error' };
  }
}
