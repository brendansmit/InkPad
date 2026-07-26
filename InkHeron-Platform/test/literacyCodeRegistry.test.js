import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CODES,
  ALL_CODES,
  GRAMMAR_CODE_DEFINITIONS,
  LITERACY_TAXONOMY_VERSION,
  getLiteracyCode,
  grammarCodePrompt,
  withLiteracyTaxonomy,
} from '../src/services/literacyCodeRegistry.js';

test('reconciled grammar registry contains 67 complete unique definitions', () => {
  assert.equal(LITERACY_TAXONOMY_VERSION, '2026-07-26');
  assert.equal(GRAMMAR_CODE_DEFINITIONS.length, 67);
  assert.equal(new Set(GRAMMAR_CODE_DEFINITIONS.map(({ code }) => code)).size, 67);
  for (const definition of GRAMMAR_CODE_DEFINITIONS) {
    for (const field of ['code', 'label', 'searchLabel', 'selfCheck', 'definition', 'family', 'priority']) {
      assert.equal(typeof definition[field], 'string', `${definition.code}.${field}`);
      assert.ok(definition[field].trim(), `${definition.code}.${field}`);
    }
    assert.equal(definition.category, 'grammar');
  }
});

test('current registry codes receive a taxonomy version without rewriting unknown historical codes', () => {
  assert.equal(withLiteracyTaxonomy({ code: 'SV-AGREEMENT' }).taxonomy_version, '2026-07-26');
  assert.deepEqual(withLiteracyTaxonomy({ code: 'CUSTOM-OLD' }), { code: 'CUSTOM-OLD' });
});

test('reserve code is retained for teachers but excluded from AI output', () => {
  assert.ok(ALL_CODES.has('NEGATION'));
  assert.equal(getLiteracyCode('NEGATION').priority, 'reserve');
  assert.equal(AI_CODES.has('NEGATION'), false);
});

test('registry keeps historical marks without allowing replaced broad codes in new AI output', () => {
  for (const code of ['Gra', 'VT', 'STR', 'MT', '✓', '//']) assert.ok(ALL_CODES.has(code));
  for (const code of ['Gra', 'VT', 'STR', 'MT', '✓', '//']) assert.equal(AI_CODES.has(code), false);
  for (const code of ['Sp', 'P', 'PREP-WRONG', 'WORD-CLASS']) assert.ok(AI_CODES.has(code));
});

test('prompt contains active grammar definitions without student examples or corpus metadata', () => {
  const prompt = grammarCodePrompt();
  assert.match(prompt, /PREP-WRONG =/);
  assert.match(prompt, /WORD-CLASS =/);
  assert.doesNotMatch(prompt, /Representative|Students affected|Confirmed occurrences|student_id|annotation_id/i);
});
