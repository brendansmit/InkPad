/**
 * Green-pen mark re-anchoring (client side).
 *
 * The rewrite editor re-attaches the ORIGINAL essay's marks to the student's
 * new text so a mark disappears once they fix it. That logic lives inside the
 * template literal in src/views/nativeWrite.js, so this test lifts the two
 * decision functions out of the source and drives them directly. It covers the
 * accept/reject decision, not the DOM walk around it.
 *
 * Regression guarded: a two-character quote like "of" used to re-attach to any
 * later "of the" in the essay, so a mark the student had ALREADY FIXED popped
 * back up somewhere else and read as a fresh error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/views/nativeWrite.js', import.meta.url), 'utf8');

// Lift the contiguous block from `function contextScore(` through the end of
// `function gpAnchorAccepted(...)`, brace matched.
function liftAnchorLogic() {
  const start = source.indexOf('function contextScore(');
  assert.ok(start > 0, 'contextScore not found in nativeWrite.js');
  const tail = source.indexOf('function gpAnchorAccepted(', start);
  assert.ok(tail > 0, 'gpAnchorAccepted not found in nativeWrite.js');
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', tail); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > 0, 'could not brace match gpAnchorAccepted');
  const block = source.slice(start, end);
  assert.ok(!block.includes('\\'), 'lifted block must contain no escapes to eval safely');
  // eslint-disable-next-line no-new-func
  return new Function(`${block}\nreturn { contextScore, gpAnchorAccepted };`)();
}

const { contextScore, gpAnchorAccepted } = liftAnchorLogic();

const wordish = (ch) => Boolean(ch) && /[\w']/.test(ch);

// Mirrors the search loop in gpRecheck: best scoring whole-word occurrence.
function bestMatch(text, mark) {
  let best = null;
  let idx = 0;
  while ((idx = text.indexOf(mark.quote, idx)) !== -1) {
    const boundaryOk =
      !(wordish(text[idx - 1]) && /^[\w']/.test(mark.quote)) &&
      !(wordish(text[idx + mark.quote.length]) && /[\w']$/.test(mark.quote));
    if (boundaryOk) {
      const score = contextScore(text, idx, mark);
      if (!best || score.total > best.total) best = { idx, ...score };
    }
    idx += 1;
  }
  return best;
}

function markFor(text, quote, occurrence = 0) {
  let at = -1;
  for (let i = 0; i <= occurrence; i++) at = text.indexOf(quote, at + 1);
  assert.ok(at >= 0, `quote ${quote} not found`);
  return {
    quote,
    context_before: text.slice(Math.max(0, at - 24), at),
    context_after: text.slice(at + quote.length, at + quote.length + 24),
  };
}

const ORIGINAL = 'He also uses pathos to make people feel empathy of the segregation problem and the correctness of the claim.';

test('a short mark the student fixed does not re-attach to another "of the" later in the essay', () => {
  const mark = markFor(ORIGINAL, 'of', 0);
  // Student fixed the flagged preposition. The only remaining "of" belongs to
  // a different, untouched clause and must NOT inherit the mark.
  const fixed = 'He also uses pathos to make people feel empathy for the segregation problem and the correctness of the claim.';
  const best = bestMatch(fixed, mark);
  assert.ok(best, 'a candidate occurrence still exists');
  assert.equal(gpAnchorAccepted(mark, best), false);
});

test('a short mark still shows while the student has not fixed it', () => {
  const mark = markFor(ORIGINAL, 'of', 0);
  const best = bestMatch(ORIGINAL, mark);
  assert.ok(best);
  assert.equal(best.idx, ORIGINAL.indexOf('of the segregation'));
  assert.equal(gpAnchorAccepted(mark, best), true);
});

test('a short mark survives an edit elsewhere in the sentence', () => {
  const mark = markFor(ORIGINAL, 'of', 0);
  const edited = ORIGINAL.replace('the claim', 'his central claim');
  const best = bestMatch(edited, mark);
  assert.ok(best);
  assert.equal(gpAnchorAccepted(mark, best), true);
});

test('a long distinctive quote anchors on the quote alone, with little context', () => {
  const mark = markFor(ORIGINAL, 'empathy of the segregation', 0);
  const moved = `Right at the start of the paragraph he shows ${'empathy of the segregation'} problem.`;
  const best = bestMatch(moved, mark);
  assert.ok(best);
  assert.equal(gpAnchorAccepted(mark, best), true);
});

test('a short mark cannot latch on from trailing context alone', () => {
  const mark = markFor(ORIGINAL, 'of', 0);
  // The whole trailing context still matches here, but the student rebuilt the
  // sentence in front of it, so this is a different "of" and must stay clear.
  const rebuilt = 'Segregation mattered. Nothing of the segregation problem is ignored.';
  const best = bestMatch(rebuilt, mark);
  assert.ok(best);
  assert.ok(best.after >= 6, 'trailing context matches in full');
  assert.ok(best.before < 6, 'leading context does not match');
  assert.equal(gpAnchorAccepted(mark, best), false);
});

test('a mark with no stored context still anchors, since nothing can be checked', () => {
  const mark = { quote: 'segregation', context_before: '', context_after: '' };
  const best = bestMatch(ORIGINAL, mark);
  assert.ok(best);
  assert.equal(gpAnchorAccepted(mark, best), true);
});
