import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// The teacher review page and the student feedback page must render overlapping
// literacy marks with segment rendering (split at every boundary, each segment
// carries ALL covering marks). The old code kept only non-overlapping spans via
// a `sp.s >= lastEnd` filter, which silently dropped a word-level error nested
// inside a clause-level one. Guard against a regression to that behaviour.

test('teacher review renderer uses segment rendering for overlapping marks', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/teacher/native-review.html'), 'utf8');
  assert.doesNotMatch(html, /if\s*\(\s*sp\.s\s*>=\s*lastEnd\s*\)/, 'must not keep only non-overlapping spans');
  assert.match(html, /covering\s*=\s*valid\.filter/, 'segments carry all covering marks');
  assert.match(html, /stack-outer/);
  assert.match(html, /\bwash\b/);
});

test('student feedback renderer uses segment rendering for overlapping marks', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/native-feedback.html'), 'utf8');
  assert.doesNotMatch(html, /if\s*\(\s*sp\.s\s*>=\s*last\s*\)/, 'must not keep only non-overlapping spans');
  assert.match(html, /covering\s*=\s*spans\.filter/, 'segments carry all covering marks');
  assert.match(html, /stack-outer/);
});

test('literacy coder prompt tells the model to report overlapping errors', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/services/literacyCoder.js'), 'utf8');
  assert.match(src, /Errors can overlap/);
  assert.match(src, /report BOTH/);
});

test('green-pen engine wraps the widest quote first so marks can nest', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/views/nativeWrite.js'), 'utf8');
  assert.match(src, /gpOrder[\s\S]{0,80}sort\(\(a, b\) => \(b\.quote/);
});
