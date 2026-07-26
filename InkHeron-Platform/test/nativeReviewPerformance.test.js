import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const html = fs.readFileSync(path.join(process.cwd(), 'public/teacher/native-review.html'), 'utf8');

test('review page loads independent essay data concurrently and caches the assignment queue', () => {
  const loadAll = html.match(/async function loadAll\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(loadAll, /Promise\.all\(\[/, 'review and feedback suggestions should share one network round trip');
  assert.match(loadAll, /review\?compact=1/, 'the marking page should not download revision history and profile data it does not render');
  assert.match(loadAll, /sessionStorage\.getItem\(cacheKey\)/, 'essay navigation should reuse the assignment queue');
  assert.match(loadAll, /cacheQueue\(\)/, 'the first dashboard response should populate the queue cache');
});

test('small review mutations update local state instead of reloading the essay payload', () => {
  const uses = html.match(/\bloadAll\b/g) || [];
  assert.equal(uses.length, 5, 'only boot, AI reanalysis, finish marking and attention-error recovery may use the full reload');
  assert.match(html, /upsertAnnotation\(result\.annotation\)/, 'annotation responses should update the local review');
  assert.match(html, /tab\.data\.scores = result\.scores/, 'rubric responses should update the active rubric');
  assert.match(html, /addFeedbackItem\(result\.item\)/, 'feedback responses should update the local feedback list');
});

test('attention decisions update immediately and roll back if saving fails', () => {
  const handler = html.match(/async function resolveContested\(c, action\)\{([\s\S]*?)\n\}\nasync function acceptSuggestion/)?.[1] || '';
  const localUpdate = handler.indexOf('resolveLiteracySuggestion(c.id)');
  const networkSave = handler.indexOf("await api('/api/native/pads/'");
  assert.ok(localUpdate !== -1 && networkSave !== -1 && localUpdate < networkSave, 'attention UI should update before waiting for the network');
  assert.match(handler, /pendingAttention\.has\(c\.id\)/, 'repeat clicks should be ignored while saving');
  assert.match(handler, /review\.suggestions\.push\(c\)/, 'failed saves should restore only the failed suggestion');
  assert.doesNotMatch(handler, /snapshot\.annotations/, 'one failed save must not roll back other attention decisions');
  assert.match(handler, /Decision restored/, 'failed saves should explain the rollback');
});

test('review page inline JavaScript parses', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.doesNotThrow(() => new Function(script));
});
