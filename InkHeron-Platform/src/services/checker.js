/**
 * Checker pass for the literacy coder (CLAUDE.md §8).
 *
 * A DIFFERENT, cheaper model family from the Doer, used to validate the
 * Doer's findings against the source text. The Checker only FLAGS; it never
 * rewrites or invents findings.
 *
 * Two layers:
 *   1. Deterministic verbatim check — the quote must match the pad text at
 *      exactly [start_offset, end_offset). This is what sets `verbatim` and
 *      is what callers drop on. It never depends on a model.
 *   2. One batched model call (different family from the Doer) that judges
 *      whether each code is defensible. This only fills `confidence` and
 *      `flag`. If the call fails (no key, network), findings pass through
 *      with flag 'checker_unavailable' — the deterministic layer still ran.
 */
import { callChat } from './openRouter.js';
import { parseJsonArraySalvage } from './literacyCoder.js';
import { buildCalibration } from './promptCalibration.js';

const CHECKER_INTENT = 'google gemini flash';

const CHECKER_SYSTEM_PROMPT = `You are a strict verifier of literacy error findings made by another model on a student paragraph. You NEVER add findings and NEVER rewrite anything. Each numbered finding shows the code, the quoted span and the FULL SENTENCE it sits in. For each one, judge only:
- "defensible": is the labelled error genuinely present at the quoted span, read inside its sentence? A correct standard English phrase flagged as an error is NOT defensible. Neither is natural everyday usage: if fluent speakers write or say the sentence exactly that way (informal register, sentence-initial And/But, stranded prepositions, singular they, common colloquial phrasing), mark it NOT defensible even if a style guide would object. Read the whole sentence aloud in your head; if it sounds like normal English, the finding is wrong. Check each finding independently; do not assume the other model is right.
- "confidence": 0 to 1, how sure you are of your defensible judgement. Calibrate honestly: 0.9+ means you re-read the span and are certain; use 0.5-0.7 when the error is arguable, the code seems wrong for the error, or the span is ambiguous. Your verdicts gate whether findings auto-apply, so a lazy default of high confidence defeats the entire check. In a typical batch some findings deserve doubt; if you mark every finding above 0.9, you are almost certainly not checking.

Return ONLY a JSON array, one object per finding, same order:
[{"index": 0, "defensible": true, "confidence": 0.9}]`;

function parseCheckerResponse(raw) {
  raw = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = raw.indexOf('[');
  if (start < 0) return null;
  const end = raw.lastIndexOf(']');
  const items = parseJsonArraySalvage(end > start ? raw.slice(start, end + 1) : raw.slice(start));
  if (!items) return null;
  const byIndex = new Map();
  for (const it of items) {
    if (!it || !Number.isInteger(it.index)) continue;
    byIndex.set(it.index, {
      defensible: typeof it.defensible === 'boolean' ? it.defensible : null,
      confidence: typeof it.confidence === 'number' ? Math.max(0, Math.min(1, it.confidence)) : null,
    });
  }
  return byIndex;
}

// The full sentence containing [start, end): expand to the nearest sentence
// boundary (., !, ?, or line break) on each side.
export function sentenceAround(text, start, end) {
  const t = String(text ?? '');
  let s = Math.max(0, Math.min(Number(start) || 0, t.length));
  let e = Math.max(s, Math.min(Number(end) || s, t.length));
  while (s > 0 && !'.!?\n'.includes(t[s - 1])) s--;
  while (e < t.length && !'.!?\n'.includes(t[e])) e++;
  if (e < t.length && '.!?'.includes(t[e])) e++;
  return t.slice(s, e).trim().slice(0, 300);
}

/**
 * Verify Doer findings against the pad text.
 *
 * input  : db, { padPlainText, findings }
 *          findings: [{ start_offset, end_offset, quote, code, category, ... }]
 * returns: the same findings, each with a `checker` field:
 *          { verbatim: boolean, confidence: number|null, flag: string|null }.
 *          Callers drop findings where verbatim is false.
 */
export async function verifyFindings(db, { padPlainText = '', findings = [] } = {}, { chat = callChat } = {}) {
  const withVerbatim = findings.map((finding) => {
    const { start_offset, end_offset, quote } = finding;
    const verbatim = Number.isInteger(start_offset) && Number.isInteger(end_offset)
      && end_offset > start_offset
      && padPlainText.slice(start_offset, end_offset) === quote
      && quote.length > 0;
    return { ...finding, checker: { verbatim, confidence: null, flag: verbatim ? null : 'not_verbatim' } };
  });

  const toJudge = withVerbatim.filter((f) => f.checker.verbatim);
  if (toJudge.length === 0) return withVerbatim;

  let verdicts = null;
  try {
    const listing = toJudge.map((f, i) =>
      `${i}. code=${f.code} quote="${f.quote}" sentence="${sentenceAround(padPlainText, f.start_offset, f.end_offset)}"`).join('\n');
    const result = await chat(db, {
      intent: CHECKER_INTENT,
      messages: [
        { role: 'system', content: CHECKER_SYSTEM_PROMPT + buildCalibration(db) },
        { role: 'user', content: `TEXT:\n${padPlainText}\n\nFINDINGS:\n${listing}` },
      ],
      maxTokens: 4000,
      temperature: 0,
    });
    verdicts = parseCheckerResponse(result?.choices?.[0]?.message?.content);
  } catch (error) {
    console.warn('[checker] unavailable:', error?.message ?? error);
  }

  toJudge.forEach((finding, i) => {
    const v = verdicts?.get(i);
    if (!v) {
      finding.checker.flag = 'checker_unavailable';
      return;
    }
    finding.checker.confidence = v.confidence;
    if (v.defensible === false) finding.checker.flag = 'code_questioned';
  });

  // Structural calibration: prompt-level pleading does not stop checker
  // models rubber-stamping everything at 0.9+ (seen live with gemini flash:
  // 46/46 findings, zero contested). So on any real batch the lowest-
  // confidence ~10% are flagged for the teacher, BUT only among findings the
  // checker actually doubted (confidence < 0.9). Making the teacher re-review
  // things the checker was 90%+ sure of wastes their time; if the checker
  // rated everything >= 0.9 we flag nothing extra and trust the genuine flags
  // (code_questioned, not_verbatim, MT manual review) to carry the contest.
  if (verdicts) {
    const judged = toJudge.filter((f) => f.checker.flag === null && typeof f.checker.confidence === 'number');
    if (judged.length >= 5) {
      const quota = Math.ceil(judged.length * 0.1);
      judged
        .filter((f) => f.checker.confidence < 0.9)
        .sort((a, b) => a.checker.confidence - b.checker.confidence)
        .slice(0, quota)
        .forEach((f) => { f.checker.flag = 'least_confident'; });
    }
  }

  return withVerbatim;
}
