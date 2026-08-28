/**
 * Word-level diff between an original draft and its green-pen rewrite.
 *
 * Two callers, one implementation on purpose:
 *   1. The teacher review page renders these segments so the change from
 *      draft 1 is visible at a glance instead of having to read both essays.
 *   2. The literacy profile uses the insertion ranges to decide which marks on
 *      a rewrite count as new evidence. A mark sitting on text the student did
 *      not touch is the original error surviving, and a mark on a correction of
 *      a previously flagged error is the same error counted twice; only marks
 *      on text the student actually changed or added are unaided writing
 *      (teacher decision, 2026-08-28, refining the 2026-07-29 blanket
 *      exclusion, which still stands for the stylometric fingerprint).
 *
 * Segment offsets refer to the rewrite for 'equal' and 'insert', and to the
 * original for 'delete', since deleted text exists only in the original.
 */

// LCS is O(n*m); past this the essays are long enough that the table costs more
// than the diff is worth, so fall back to "replaced wholesale".
const MAX_DP_CELLS = 2_000_000;

/**
 * Split into words, keeping trailing whitespace on each token so the segments
 * concatenate back into the source text. `word` is the comparison key and
 * excludes that whitespace; start/end bound the word itself, which is what a
 * mark span is measured against.
 */
export function tokenizeWords(text) {
  const tokens = [];
  const source = typeof text === 'string' ? text : '';
  const pattern = /\S+\s*/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const full = match[0];
    const word = full.replace(/\s+$/, '');
    tokens.push({ word, text: full, start: match.index, end: match.index + word.length });
  }
  return tokens;
}

function pushSegment(segments, type, token) {
  const last = segments.at(-1);
  // Adjacent tokens of the same type come from the same document and are
  // contiguous, so merging keeps the offsets honest and the markup light.
  if (last && last.type === type) {
    last.text += token.text;
    last.end = token.end;
    return;
  }
  segments.push({ type, text: token.text, start: token.start, end: token.end });
}

function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = a[i].word === b[j].word
        ? dp[(i + 1) * width + (j + 1)] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].word === b[j].word) {
      ops.push({ type: 'equal', token: b[j] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      ops.push({ type: 'delete', token: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'insert', token: b[j] });
      j += 1;
    }
  }
  while (i < n) { ops.push({ type: 'delete', token: a[i] }); i += 1; }
  while (j < m) { ops.push({ type: 'insert', token: b[j] }); j += 1; }
  return ops;
}

/**
 * Segments describing how to get from `originalText` to `rewriteText`.
 * Comparison is exact, so a capitalisation or punctuation fix reads as a
 * change: those are precisely the corrections green pen is about.
 */
export function diffWords(originalText, rewriteText) {
  const a = tokenizeWords(originalText);
  const b = tokenizeWords(rewriteText);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix].word === b[prefix].word) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix
    && suffix < b.length - prefix
    && a[a.length - 1 - suffix].word === b[b.length - 1 - suffix].word
  ) suffix += 1;

  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);
  const ops = aMid.length * bMid.length > MAX_DP_CELLS
    ? [
      ...aMid.map((token) => ({ type: 'delete', token })),
      ...bMid.map((token) => ({ type: 'insert', token })),
    ]
    : lcsOps(aMid, bMid);

  const segments = [];
  for (let i = 0; i < prefix; i += 1) pushSegment(segments, 'equal', b[i]);
  for (const op of ops) pushSegment(segments, op.type, op.token);
  for (let i = b.length - suffix; i < b.length; i += 1) pushSegment(segments, 'equal', b[i]);
  return segments;
}

/**
 * Character ranges in the REWRITE covering text the student added or changed.
 */
export function insertionRanges(segments) {
  return segments
    .filter((segment) => segment.type === 'insert')
    .map((segment) => ({ start: segment.start, end: segment.end }));
}

export function diffStats(segments) {
  let added = 0;
  let removed = 0;
  let kept = 0;
  for (const segment of segments) {
    const words = tokenizeWords(segment.text).length;
    if (segment.type === 'insert') added += words;
    else if (segment.type === 'delete') removed += words;
    else kept += words;
  }
  const originalWords = kept + removed;
  const changedRatio = originalWords > 0
    ? removed / originalWords
    : (added > 0 ? 1 : 0);
  return {
    words_added: added,
    words_removed: removed,
    words_kept: kept,
    original_words: originalWords,
    rewrite_words: kept + added,
    changed_ratio: Math.round(changedRatio * 1000) / 1000,
  };
}

/**
 * Does a mark span touch any text the student changed? Zero-length spans count
 * as touching a range they sit inside, so an insertion-point mark is not lost.
 */
export function spanTouchesInsertion(ranges, startOffset, endOffset) {
  const start = Number(startOffset);
  const end = Number(endOffset);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return ranges.some((range) => (low === high
    ? low >= range.start && low <= range.end
    : low < range.end && high > range.start));
}

/**
 * Everything the review page and the profile gate need, from two texts.
 */
export function compareRewrite(originalText, rewriteText) {
  const segments = diffWords(originalText, rewriteText);
  return { segments, stats: diffStats(segments), insertions: insertionRanges(segments) };
}
