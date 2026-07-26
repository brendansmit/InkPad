import literacyCodes from '../data/literacyCodes.json' with { type: 'json' };

export const LITERACY_TAXONOMY_VERSION = '2026-07-26';

const SUPPLEMENTAL_CODES = [
  { code: 'Sp', label: 'Spelling', family: 'Spelling', category: 'surface' },
  { code: 'Caps', label: 'Capital letter', family: 'Capitalisation', category: 'surface' },
  { code: 'P', label: 'Punctuation', family: 'Punctuation', category: 'format' },
  { code: 'Embed', label: 'Quotation embedding', family: 'Punctuation', category: 'format' },
  { code: 'FOR', label: 'Formatting', family: 'Formatting', category: 'format' },
  { code: 'Exp', label: 'Expression', family: 'Expression', category: 'surface' },
  { code: 'WW', label: 'Wrong word', family: 'Word choice', category: 'surface' },
  { code: 'Rep', label: 'Repetition', family: 'Expression', category: 'surface' },
];

const REPLACED_LEGACY_CODES = [
  { code: '^', label: 'Missing word', family: 'Legacy grammar', category: 'grammar' },
  { code: 'Gra', label: 'Grammar', family: 'Legacy grammar', category: 'grammar' },
  { code: 'AA/Adj', label: 'Adjective form', family: 'Legacy grammar', category: 'grammar' },
  { code: 'STR', label: 'Sentence structure', family: 'Legacy grammar', category: 'grammar' },
  { code: 'WO', label: 'Word order', family: 'Legacy grammar', category: 'grammar' },
  { code: 'V', label: 'Verb formation', family: 'Legacy grammar', category: 'grammar' },
  { code: 'VT', label: 'Verb tense', family: 'Legacy grammar', category: 'grammar' },
  { code: 'del', label: 'Delete word', family: 'Legacy grammar', category: 'grammar' },
  { code: 'inc', label: 'Incomplete sentence', family: 'Legacy grammar', category: 'grammar' },
  { code: 'RO', label: 'Run-on sentence', family: 'Legacy grammar', category: 'grammar' },
];

const MANUAL_CODES = [
  { code: 'MT', label: 'Mistranslated name or saying', family: 'Translation', category: 'grammar' },
  { code: '✓', label: 'Good work', family: 'Teacher marks', category: 'positive' },
  { code: '//', label: 'New paragraph', family: 'Teacher marks', category: 'format' },
];

function freezeDefinition(definition, additions = {}) {
  return Object.freeze({ ...definition, ...additions });
}

export const GRAMMAR_CODE_DEFINITIONS = Object.freeze(
  literacyCodes.map((definition) => freezeDefinition(definition, {
    category: 'grammar',
    source: 'grammar',
    aiEnabled: definition.priority !== 'reserve',
  })),
);

export const SUPPLEMENTAL_CODE_DEFINITIONS = Object.freeze(
  SUPPLEMENTAL_CODES.map((definition) => freezeDefinition(definition, {
    searchLabel: definition.label,
    priority: 'supplemental',
    source: 'supplemental',
    aiEnabled: true,
  })),
);

export const LEGACY_CODE_DEFINITIONS = Object.freeze([
  ...REPLACED_LEGACY_CODES.map((definition) => freezeDefinition(definition, {
    searchLabel: definition.label,
    priority: 'legacy',
    source: 'legacy',
    aiEnabled: false,
  })),
  ...MANUAL_CODES.map((definition) => freezeDefinition(definition, {
    searchLabel: definition.label,
    priority: 'manual',
    source: 'manual',
    aiEnabled: false,
  })),
]);

export const ALL_CODE_DEFINITIONS = Object.freeze([
  ...GRAMMAR_CODE_DEFINITIONS,
  ...SUPPLEMENTAL_CODE_DEFINITIONS,
  ...LEGACY_CODE_DEFINITIONS,
]);

const duplicateCodes = ALL_CODE_DEFINITIONS
  .map((definition) => definition.code)
  .filter((code, index, codes) => codes.indexOf(code) !== index);
if (duplicateCodes.length) throw new Error(`Duplicate literacy codes: ${duplicateCodes.join(', ')}`);

const CODE_BY_ID = new Map(ALL_CODE_DEFINITIONS.map((definition) => [definition.code, definition]));

export const AI_CODE_DEFINITIONS = Object.freeze(
  ALL_CODE_DEFINITIONS.filter((definition) => definition.aiEnabled),
);
export const AI_CODES = new Set(AI_CODE_DEFINITIONS.map((definition) => definition.code));
export const ALL_CODES = new Set(CODE_BY_ID.keys());
export const MANUAL_REVIEW_CODES = new Set(MANUAL_CODES.map((definition) => definition.code));

export function getLiteracyCode(code) {
  return CODE_BY_ID.get(code) ?? null;
}

export function literacyCodeLabel(code) {
  return getLiteracyCode(code)?.label ?? code;
}

export function literacyCodeCategory(code) {
  return getLiteracyCode(code)?.category ?? 'other';
}

export function withLiteracyTaxonomy(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  if (!ALL_CODES.has(metadata.code)) return metadata;
  return { ...metadata, taxonomy_version: LITERACY_TAXONOMY_VERSION };
}

export function grammarCodePrompt() {
  return GRAMMAR_CODE_DEFINITIONS
    .filter((definition) => definition.aiEnabled)
    .map((definition) => `${definition.code} = ${definition.definition}`)
    .join('\n');
}

export function aiCodePrompt() {
  return AI_CODE_DEFINITIONS
    .map((definition) => `${definition.code} = ${definition.definition ?? definition.label}`)
    .join('\n');
}
