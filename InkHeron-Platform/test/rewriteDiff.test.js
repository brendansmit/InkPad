/**
 * The word diff backs two things that must not drift apart: what the teacher
 * sees as "changed from draft 1", and which marks on a rewrite are allowed to
 * count as new evidence in the literacy profile.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareRewrite,
  diffStats,
  diffWords,
  insertionRanges,
  spanTouchesInsertion,
  tokenizeWords,
} from '../src/services/rewriteDiff.js';

function textOf(segments, type) {
  return segments.filter((s) => s.type === type).map((s) => s.text).join('');
}

test('identical texts are one equal segment', () => {
  const segments = diffWords('She felt empathy.', 'She felt empathy.');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, 'equal');
  assert.equal(insertionRanges(segments).length, 0);
});

test('segments reconstruct the rewrite text', () => {
  const original = 'She felt empathy of the problem and the speech was memorable.';
  const rewrite = 'She felt empathy for the problem, and the speech was truly memorable.';
  const segments = diffWords(original, rewrite);
  const rebuilt = segments.filter((s) => s.type !== 'delete').map((s) => s.text).join('');
  assert.equal(rebuilt, rewrite);
});

test('a corrected word shows as a delete plus an insert', () => {
  const segments = diffWords('empathy of the problem', 'empathy for the problem');
  assert.match(textOf(segments, 'delete'), /of/);
  assert.match(textOf(segments, 'insert'), /for/);
  assert.match(textOf(segments, 'equal'), /empathy/);
});

test('insertion ranges point at the changed word in the rewrite', () => {
  const rewrite = 'empathy for the problem';
  const segments = diffWords('empathy of the problem', rewrite);
  const ranges = insertionRanges(segments);
  assert.equal(ranges.length, 1);
  assert.equal(rewrite.slice(ranges[0].start, ranges[0].end), 'for');
});

test('pure addition at the end is an insert, nothing deleted', () => {
  const segments = diffWords('One sentence.', 'One sentence. And another.');
  assert.equal(textOf(segments, 'delete'), '');
  assert.match(textOf(segments, 'insert'), /And another\./);
});

test('pure deletion is a delete, nothing inserted', () => {
  const segments = diffWords('One sentence. And another.', 'One sentence.');
  assert.equal(textOf(segments, 'insert'), '');
  assert.match(textOf(segments, 'delete'), /And another\./);
});

test('capitalisation and punctuation fixes count as changes', () => {
  const segments = diffWords('she went home', 'She went home.');
  assert.ok(insertionRanges(segments).length > 0, 'a case fix must register as changed text');
});

test('empty original means the whole rewrite is new', () => {
  const segments = diffWords('', 'All of this is new.');
  assert.equal(textOf(segments, 'equal'), '');
  assert.equal(textOf(segments, 'insert'), 'All of this is new.');
});

test('stats count added, removed and the changed share of the draft', () => {
  const stats = diffStats(diffWords('a b c d', 'a x c d e'));
  assert.equal(stats.words_added, 2);
  assert.equal(stats.words_removed, 1);
  assert.equal(stats.original_words, 4);
  assert.equal(stats.rewrite_words, 5);
  assert.equal(stats.changed_ratio, 0.25);
});

test('span overlap decides which marks are new evidence', () => {
  const rewrite = 'empathy for the problem';
  const { insertions } = compareRewrite('empathy of the problem', rewrite);
  // A mark on the corrected word: new evidence.
  assert.equal(spanTouchesInsertion(insertions, 8, 11), true);
  // A mark on untouched carried-over text: the original error surviving.
  assert.equal(spanTouchesInsertion(insertions, 0, 7), false);
  // A mark straddling both still counts.
  assert.equal(spanTouchesInsertion(insertions, 5, 12), true);
});

test('span overlap is defensive about bad offsets', () => {
  const { insertions } = compareRewrite('a b', 'a c');
  assert.equal(spanTouchesInsertion(insertions, null, undefined), false);
  assert.equal(spanTouchesInsertion(insertions, 'x', 3), false);
  // Reversed offsets are normalised rather than silently missing.
  assert.equal(spanTouchesInsertion(insertions, 3, 2), true);
});

test('tokeniser keeps trailing whitespace but bounds the word', () => {
  const tokens = tokenizeWords('hi  there');
  assert.equal(tokens[0].text, 'hi  ');
  assert.equal(tokens[0].start, 0);
  assert.equal(tokens[0].end, 2);
});
