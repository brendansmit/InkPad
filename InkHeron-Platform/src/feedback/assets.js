import { feedbackLibrary } from './library.js';

const VALID_KINDS = new Set(['strength_target', 'rubric']);

function cleanText(value, limit = 20000) {
  return String(value ?? '').trim().slice(0, limit);
}

function optionId(prefix, index, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44);
  return `${prefix}_${slug || index + 1}`;
}

function normalizeOption(item, prefix, index) {
  if (typeof item === 'string') {
    const [title, ...rest] = item.split(/[:-]/);
    return {
      id: optionId(prefix, index, title || item),
      title: cleanText(title || item, 120),
      explanation: cleanText(rest.join('-') || item, 500),
    };
  }
  const title = cleanText(item?.title ?? item?.label ?? item?.name, 120);
  const explanation = cleanText(item?.explanation ?? item?.description ?? item?.descriptor ?? title, 500);
  return {
    id: cleanText(item?.id, 80) || optionId(prefix, index, title || explanation),
    title: title || `Option ${index + 1}`,
    explanation,
  };
}

function parseSectionedFeedback(text) {
  const result = { strengths: [], targets: [] };
  let section = '';
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^strengths?\b/.test(lower)) {
      section = 'strengths';
      continue;
    }
    if (/^targets?\b/.test(lower)) {
      section = 'targets';
      continue;
    }
    const cleaned = line.replace(/^[-*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!cleaned || !section) continue;
    result[section].push(normalizeOption(cleaned, section === 'strengths' ? 'strength' : 'target', result[section].length));
  }
  return result;
}

function normalizeCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];
  return criteria.slice(0, 12).map((criterion, index) => ({
    label: cleanText(criterion?.label ?? criterion?.title ?? criterion?.name, 120) || `Criterion ${index + 1}`,
    description: cleanText(criterion?.description ?? criterion?.descriptor ?? '', 500),
    weight: Number.isFinite(Number(criterion?.weight)) ? Number(criterion.weight) : 1,
    bands: Array.isArray(criterion?.bands) ? criterion.bands.slice(0, 20).map((band, bandIndex) => ({
      score_value: Number.isFinite(Number(band?.score_value ?? band?.score)) ? Number(band.score_value ?? band.score) : bandIndex,
      label: cleanText(band?.label ?? String(band?.score_value ?? band?.score ?? bandIndex), 80),
      descriptor: cleanText(band?.descriptor ?? band?.description ?? '', 500),
    })) : [],
  }));
}

export function parseFeedbackAsset(kind, contentText) {
  if (!VALID_KINDS.has(kind)) {
    const err = new Error('invalid_feedback_asset_kind');
    err.statusCode = 400;
    throw err;
  }
  const text = cleanText(contentText, 60000);
  let parsed = {};
  try {
    const json = text ? JSON.parse(text) : {};
    if (kind === 'strength_target') {
      parsed = {
        strengths: Array.isArray(json.strengths) ? json.strengths.map((item, index) => normalizeOption(item, 'strength', index)) : [],
        targets: Array.isArray(json.targets) ? json.targets.map((item, index) => normalizeOption(item, 'target', index)) : [],
      };
    } else {
      parsed = { criteria: normalizeCriteria(Array.isArray(json) ? json : json.criteria) };
    }
  } catch (_) {
    parsed = kind === 'strength_target' ? parseSectionedFeedback(text) : { criteria: [] };
  }
  return parsed;
}

export function publicFeedbackAsset(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    assignment_type: row.assignment_type,
    content_text: row.content_text,
    parsed: JSON.parse(row.parsed_json || '{}'),
    is_archived: row.is_archived === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function loadActiveFeedbackAssets(db, kind = '') {
  const where = kind && VALID_KINDS.has(kind) ? 'WHERE kind = ? AND is_archived = 0' : 'WHERE is_archived = 0';
  const params = kind && VALID_KINDS.has(kind) ? [kind] : [];
  return db.prepare(`
    SELECT id, kind, title, assignment_type, content_text, parsed_json, is_archived, created_at, updated_at
    FROM feedback_assets
    ${where}
    ORDER BY assignment_type COLLATE NOCASE, title COLLATE NOCASE, id
  `).all(...params).map(publicFeedbackAsset);
}

export function feedbackOptionsForAssignment(db, settingsJson) {
  let settings = {};
  try {
    settings = JSON.parse(settingsJson || '{}');
  } catch (_) {
    settings = {};
  }
  const table = String(settings.feedback_table || '');
  const match = table.match(/^asset:(\d+)$/);
  if (!match) return feedbackLibrary;
  const row = db.prepare(`
    SELECT id, kind, title, assignment_type, content_text, parsed_json, is_archived, created_at, updated_at
    FROM feedback_assets
    WHERE id = ? AND kind = 'strength_target' AND is_archived = 0
  `).get(Number(match[1]));
  if (!row) return feedbackLibrary;
  const parsed = publicFeedbackAsset(row).parsed;
  return {
    strengths: parsed.strengths?.length ? parsed.strengths : feedbackLibrary.strengths,
    targets: parsed.targets?.length ? parsed.targets : feedbackLibrary.targets,
  };
}
