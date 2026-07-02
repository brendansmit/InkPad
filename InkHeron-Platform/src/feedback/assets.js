import zlib from 'node:zlib';
import path from 'node:path';
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

function normalizeHolisticRubric(json) {
  const bands = Array.isArray(json?.bands ?? json?.scale ?? json?.levels)
    ? (json.bands ?? json.scale ?? json.levels).slice(0, 20).map((band, bandIndex) => ({
      score_value: Number.isFinite(Number(band?.score_value ?? band?.score)) ? Number(band.score_value ?? band.score) : bandIndex,
      label: cleanText(band?.label ?? String(band?.score_value ?? band?.score ?? bandIndex), 80),
      descriptor: cleanText(band?.descriptor ?? band?.description ?? '', 500),
    }))
    : [];
  return {
    mode: 'holistic',
    criteria: [{
      label: cleanText(json?.label ?? json?.title ?? 'Overall', 120) || 'Overall',
      description: cleanText(json?.description ?? 'Overall performance across the rubric.', 500),
      weight: Number.isFinite(Number(json?.weight)) ? Number(json.weight) : 1,
      bands,
    }],
  };
}

function defaultApRows() {
  return [
    {
      label: 'Thesis',
      description: 'Responds to the prompt with a defensible thesis.',
      bands: [
        { score_value: 0, label: '0', descriptor: 'No defensible thesis.' },
        { score_value: 1, label: '1', descriptor: 'Defensible thesis present.' },
      ],
    },
    {
      label: 'Evidence and Commentary',
      description: 'Uses evidence and explains how it supports the line of reasoning.',
      bands: [0, 1, 2, 3, 4].map(score => ({
        score_value: score,
        label: String(score),
        descriptor: score === 0 ? 'Little or no evidence or commentary.' : `AP row score ${score}.`,
      })),
    },
    {
      label: 'Sophistication',
      description: 'Demonstrates sophistication of thought or style.',
      bands: [
        { score_value: 0, label: '0', descriptor: 'No sophistication point.' },
        { score_value: 1, label: '1', descriptor: 'Sophistication point earned.' },
      ],
    },
  ];
}

function normalizeApRubric(json) {
  const rows = Array.isArray(json?.rows ?? json?.criteria) && (json.rows ?? json.criteria).length
    ? normalizeCriteria(json.rows ?? json.criteria)
    : normalizeCriteria(defaultApRows());
  return {
    mode: 'ap',
    criteria: rows.slice(0, 3),
  };
}

function normalizeAnalyticRubric(json) {
  return {
    mode: 'analytic',
    criteria: normalizeCriteria(Array.isArray(json) ? json : json.criteria),
  };
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
    } else if (!Array.isArray(json)) {
      const rubricMode = String(json.mode ?? json.rubric_type ?? '').toLowerCase();
      if (rubricMode === 'holistic') parsed = normalizeHolisticRubric(json);
      else if (rubricMode === 'ap') parsed = normalizeApRubric(json);
      else parsed = normalizeAnalyticRubric(json);
    } else {
      parsed = normalizeAnalyticRubric(json);
    }
  } catch (_) {
    parsed = kind === 'strength_target' ? parseSectionedFeedback(text) : { mode: 'analytic', criteria: [] };
  }
  return parsed;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function unzipEntries(buffer) {
  const entries = new Map();
  let eocd = -1;
  const min = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('invalid_zip');
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('invalid_zip_directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const filename = buffer.toString('utf8', offset + 46, offset + 46 + filenameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('invalid_zip_local_file');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else data = null;
    if (data) entries.set(filename, data);
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
}

export function extractDocxText(buffer) {
  const entries = unzipEntries(buffer);
  const xml = entries.get('word/document.xml');
  if (!xml) throw new Error('docx_document_missing');
  return decodeXmlEntities(
    xml.toString('utf8')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfText(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  await document.destroy();
  return pages.filter(Boolean).join('\n\n').trim();
}

export async function extractFeedbackUploadText({ filename = '', mimeType = '', buffer }) {
  const ext = path.extname(filename).toLowerCase();
  if (['.txt', '.csv', '.json'].includes(ext) || /^text\//.test(mimeType) || mimeType === 'application/json') {
    return buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  }
  if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText(buffer);
  }
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    return extractPdfText(buffer);
  }
  const err = new Error('unsupported_file_type');
  err.statusCode = 400;
  throw err;
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

function parseSettingsJson(settingsJson) {
  try {
    return JSON.parse(settingsJson || '{}');
  } catch (_) {
    return {};
  }
}

// The list of strengths/targets table ids configured on an assignment (up to 2).
function configuredFeedbackTableIds(settings) {
  const raw = Array.isArray(settings.feedback_tables)
    ? settings.feedback_tables
    : (settings.feedback_table ? [settings.feedback_table] : []);
  const ids = [];
  for (const item of raw) {
    const str = String(item || '').trim();
    if (str && !ids.includes(str)) ids.push(str);
    if (ids.length >= 2) break;
  }
  return ids;
}

// Resolve one table id ("asset:N" or "default"/"") to its strengths/targets set.
export function resolveFeedbackTable(db, tableId) {
  const id = String(tableId || '').trim();
  const match = id.match(/^asset:(\d+)$/);
  if (!match) {
    return { id: 'default', title: 'Default InkHeron list', strengths: feedbackLibrary.strengths, targets: feedbackLibrary.targets };
  }
  const row = db.prepare(`
    SELECT id, kind, title, assignment_type, content_text, parsed_json, is_archived, created_at, updated_at
    FROM feedback_assets
    WHERE id = ? AND kind = 'strength_target' AND is_archived = 0
  `).get(Number(match[1]));
  if (!row) {
    return { id: 'default', title: 'Default InkHeron list', strengths: feedbackLibrary.strengths, targets: feedbackLibrary.targets };
  }
  const asset = publicFeedbackAsset(row);
  const parsed = asset.parsed;
  return {
    id,
    title: asset.title || `Table ${asset.id}`,
    strengths: parsed.strengths?.length ? parsed.strengths : feedbackLibrary.strengths,
    targets: parsed.targets?.length ? parsed.targets : feedbackLibrary.targets,
  };
}

// All tables configured on an assignment, each resolved to its options. Always
// returns at least the default list so a reviewer never sees an empty picker.
export function feedbackTablesForAssignment(db, settingsJson) {
  const settings = parseSettingsJson(settingsJson);
  const ids = configuredFeedbackTableIds(settings);
  if (!ids.length) return [resolveFeedbackTable(db, 'default')];
  return ids.map((id) => resolveFeedbackTable(db, id));
}

// The strengths/targets set to use for a specific essay. Prefers the table the
// reviewer applied to this pad, else the assignment's first table, else default.
export function feedbackOptionsForAssignment(db, settingsJson, appliedTable = '') {
  const tables = feedbackTablesForAssignment(db, settingsJson);
  const applied = String(appliedTable || '').trim();
  const chosen = (applied && tables.find((t) => t.id === applied)) || tables[0];
  return { strengths: chosen.strengths, targets: chosen.targets };
}
