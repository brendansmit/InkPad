import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const html = fs.readFileSync(path.join(process.cwd(), 'public/teacher/native-review.html'), 'utf8');

test('review page loads independent essay data concurrently and caches the assignment queue', () => {
  const loadAll = html.match(/async function loadAll\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(loadAll, /Promise\.all\(\[/, 'review and feedback suggestions should share one network round trip');
  assert.match(loadAll, /sessionStorage\.getItem\(cacheKey\)/, 'essay navigation should reuse the assignment queue');
  assert.match(loadAll, /cacheQueue\(\)/, 'the first dashboard response should populate the queue cache');
});

test('small review mutations update local state instead of reloading the essay payload', () => {
  const uses = html.match(/\bloadAll\b/g) || [];
  assert.equal(uses.length, 4, 'only boot, AI reanalysis and finish marking may use the full reload');
  assert.match(html, /upsertAnnotation\(result\.annotation\)/, 'annotation responses should update the local review');
  assert.match(html, /tab\.data\.scores = result\.scores/, 'rubric responses should update the active rubric');
  assert.match(html, /addFeedbackItem\(result\.item\)/, 'feedback responses should update the local feedback list');
});

test('review page inline JavaScript parses', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.doesNotThrow(() => new Function(script));
});
