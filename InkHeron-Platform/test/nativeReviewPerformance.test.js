import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const html = fs.readFileSync(path.join(process.cwd(), 'public/teacher/native-review.html'), 'utf8');

test('review page loads independent essay data concurrently and caches the assignment queue', () => {
  const loadAll = html.match(/async function loadAll\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(loadAll, /Promise\.all\(\[/, 'review and feedback suggestions should share one network round trip');
  assert.match(loadAll, /sessionStorage\.getItem\(cacheKey\)/, 'essay navigation should reuse the assignment queue');
  assert.match(loadAll, /sessionStorage\.setItem\(cacheKey/, 'the first dashboard response should populate the queue cache');
});
