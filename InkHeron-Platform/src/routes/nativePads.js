import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNativeWriteView } from '../views/nativeWrite.js';
import { feedbackOptionsForAssignment, feedbackTablesForAssignment } from '../feedback/assets.js';
import { notifyTeacher } from '../services/serverChan.js';
import { runLiteracyAnalysis, MANUAL_REVIEW_CODES } from '../services/literacyCoder.js';
import { estimateRubric, recordTeacherScores } from '../services/markerProfile.js';
import { scoreRewrite } from '../services/implementationScorer.js';
import { recordStyleMetrics, aggregateStyleProfile, detectStyleAnomaly } from '../services/styleMetrics.js';
import { realStudentsWhere } from '../db/realStudents.js';
import { generateProfileSummary } from '../services/profileSummarizer.js';
import { suggestFeedbackItems } from '../services/feedbackSuggester.js';
import { generateReportSnippet } from '../services/reportSnippet.js';

// Fire-and-forget an async analysis seam without blocking the HTTP response.
// A missing OpenRouter key or a stub is a clean no-op; errors are logged only.
function runInBackground(label, promiseFactory) {
  try {
    Promise.resolve(promiseFactory()).catch((error) => {
      console.warn(`[analysis:${label}]`, error?.message ?? error);
    });
  } catch (error) {
    console.warn(`[analysis:${label}]`, error?.message ?? error);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __routesDir = path.dirname(__filename);
const PASSAGES_DIR = path.join(__routesDir, '..', '..', 'data', 'passages');
const EMPTY_DOC = '{"type":"doc","content":[]}';
const EMPTY_META = '{}';
const MAX_PLAIN_TEXT_LENGTH = 200000;
const MAX_DOCUMENT_JSON_LENGTH = 1000000;
const MAX_COMMENT_LENGTH = 8000;
const MAX_IMPORT_FILE_BYTES = 220000;
const MAX_RUBRIC_LABEL_LENGTH = 120;
const MAX_RUBRIC_DESCRIPTION_LENGTH = 1200;
const ANNOTATION_TYPES = new Set(['general_comment', 'inline_comment', 'literacy_code', 'highlight']);
const PASTE_MODES = new Set(['allow', 'log', 'block']);
const DEFAULT_RUBRIC = [
  { label: 'Thesis', description: 'Clear central idea and control of argument.', weight: 1 },
  { label: 'Evidence', description: 'Relevant examples, quotations or details.', weight: 1 },
  { label: 'Commentary', description: 'Explanation of how evidence supports the idea.', weight: 1 },
  { label: 'Organisation', description: 'Logical sequencing, paragraphing and transitions.', weight: 1 },
  { label: 'Language control', description: 'Sentence control, grammar and word choice.', weight: 1 },
];
const DEFAULT_AP_EXAM_RUBRIC = [
  {
    label: 'Thesis',
    description: 'Responds to the prompt with a defensible thesis.',
    weight: 1,
    bands: [
      { score_value: 0, label: '0', descriptor: 'No defensible thesis.' },
      { score_value: 1, label: '1', descriptor: 'Defensible thesis present.' },
    ],
  },
  {
    label: 'Evidence and Commentary',
    description: 'Uses evidence and explains how it supports the line of reasoning.',
    weight: 1,
    bands: [0, 1, 2, 3, 4].map((score) => ({
      score_value: score,
      label: String(score),
      descriptor: score === 0 ? 'Little or no evidence or commentary.' : `AP row score ${score}.`,
    })),
  },
  {
    label: 'Sophistication',
    description: 'Demonstrates sophistication of thought or style.',
    weight: 1,
    bands: [
      { score_value: 0, label: '0', descriptor: 'No sophistication point.' },
      { score_value: 1, label: '1', descriptor: 'Sophistication point earned.' },
    ],
  },
];
const RUBRIC_KINDS = new Set(['internal', 'secondary', 'exam']);

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function parseSettings(settingsJson) {
  try {
    return JSON.parse(settingsJson ?? '{}');
  } catch (_) {
    return {};
  }
}

function nativeEnabled(assignment) {
  return assignment?.type === 'test' || parseSettings(assignment.settings_json).native_inkpad === true;
}

function countWords(text) {
  const normalized = String(text ?? '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function normalizeDocumentJson(value) {
  const fallback = { type: 'doc', content: [] };
  const doc = value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  const json = JSON.stringify(doc);
  if (json.length > MAX_DOCUMENT_JSON_LENGTH) {
    const error = new Error('document_too_large');
    error.statusCode = 413;
    throw error;
  }
  return json;
}

function documentForPlainText(text) {
  return {
    type: 'doc',
    content: String(text ?? '').split(/\n{2,}/).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph ? [{ type: 'text', text: paragraph }] : [],
    })),
  };
}

function normalizePlainText(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.length > MAX_PLAIN_TEXT_LENGTH) {
    const error = new Error('plain_text_too_large');
    error.statusCode = 413;
    throw error;
  }
  return text;
}

function normalizeComment(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_COMMENT_LENGTH) {
    const error = new Error('comment_too_large');
    error.statusCode = 413;
    throw error;
  }
  return text;
}

function normalizeRubricText(value, maxLength, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return text.slice(0, maxLength);
}

function normalizeHalfScore(value, field) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || !Number.isInteger(score * 2)) {
    const error = new Error(`${field}_must_be_half_step_score`);
    error.statusCode = 400;
    throw error;
  }
  return score;
}

function normalizeMetadata(value) {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return JSON.stringify(metadata);
}

function publicNativePad(row) {
  return {
    id: row.id,
    assignment_id: row.assignment_id,
    student_id: row.student_id,
    state: row.state,
    document: JSON.parse(row.document_json || EMPTY_DOC),
    plain_text: row.plain_text ?? '',
    word_count: Number(row.word_count ?? 0),
    version: Number(row.version ?? 1),
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at ?? null,
  };
}

function publicPolicy(row) {
  return {
    paste_mode: row.paste_mode,
    spellcheck_enabled: row.spellcheck_enabled === 1,
    updated_at: row.updated_at,
    updated_by_teacher_id: row.updated_by_teacher_id ?? null,
  };
}

function publicAnnotation(row) {
  return {
    id: row.id,
    native_pad_id: row.native_pad_id,
    teacher_id: row.teacher_id ?? null,
    type: row.type,
    start_offset: row.start_offset ?? null,
    end_offset: row.end_offset ?? null,
    selected_text: row.selected_text ?? '',
    body: row.body ?? '',
    metadata: JSON.parse(row.metadata_json || EMPTY_META),
    resolved: row.resolved === 1,
    document_version: Number(row.document_version ?? 1),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicRubricScore(row) {
  return {
    criterion_id: row.criterion_id,
    selected_score: Number(row.selected_score),
    note: row.note ?? '',
    updated_by_teacher_id: row.updated_by_teacher_id ?? null,
    updated_at: row.updated_at,
  };
}

function parseMetadataJson(value) {
  try {
    return JSON.parse(value || EMPTY_META);
  } catch (_) {
    return {};
  }
}

function ensureStudentWritingProfile(db, studentId) {
  db.prepare('INSERT OR IGNORE INTO student_writing_profiles (student_id) VALUES (?)').run(studentId);
  const profile = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  return {
    student_id: profile.student_id,
    writing_summary: profile.writing_summary ?? '',
    voice_summary: profile.voice_summary ?? '',
    targets: JSON.parse(profile.targets_json || '[]'),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function normalizeLiteracyKey(row) {
  const metadata = parseMetadataJson(row.metadata_json);
  const code = normalizeRubricText(metadata.code, 40);
  const category = normalizeRubricText(metadata.category, 120);
  const label = normalizeRubricText(metadata.label, 180, code || category || 'Literacy issue');
  return { code, category, label };
}

function recomputeStudentLiteracyStat(db, studentId, code, category, label) {
  const aggregate = db.prepare(`
    SELECT
      COUNT(*) AS evidence_count,
      SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) AS resolved_count,
      MIN(created_at) AS first_seen_at,
      MAX(created_at) AS last_seen_at
    FROM student_literacy_evidence
    WHERE student_id = ? AND code = ? AND category = ?
  `).get(studentId, code, category);

  if (!aggregate || Number(aggregate.evidence_count ?? 0) === 0) {
    db.prepare('DELETE FROM student_literacy_issue_stats WHERE student_id = ? AND code = ? AND category = ?').run(studentId, code, category);
    return;
  }

  db.prepare(`
    INSERT INTO student_literacy_issue_stats (
      student_id, code, category, label, evidence_count, open_count, resolved_count, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(student_id, code, category) DO UPDATE SET
      label = excluded.label,
      evidence_count = excluded.evidence_count,
      open_count = excluded.open_count,
      resolved_count = excluded.resolved_count,
      first_seen_at = excluded.first_seen_at,
      last_seen_at = excluded.last_seen_at,
      updated_at = datetime('now')
  `).run(
    studentId,
    code,
    category,
    label,
    Number(aggregate.evidence_count ?? 0),
    Number(aggregate.open_count ?? 0),
    Number(aggregate.resolved_count ?? 0),
    aggregate.first_seen_at,
    aggregate.last_seen_at
  );
}

function syncLiteracyEvidence(db, pad, annotationRow) {
  if (annotationRow.type !== 'literacy_code') return;
  ensureStudentWritingProfile(db, pad.student_id);
  const key = normalizeLiteracyKey(annotationRow);
  db.prepare(`
    INSERT INTO student_literacy_evidence (
      student_id, assignment_id, native_pad_id, annotation_id, code, category, label,
      selected_text, teacher_note, document_version, resolved, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(annotation_id) DO UPDATE SET
      code = excluded.code,
      category = excluded.category,
      label = excluded.label,
      selected_text = excluded.selected_text,
      teacher_note = excluded.teacher_note,
      document_version = excluded.document_version,
      resolved = excluded.resolved,
      updated_at = datetime('now')
  `).run(
    pad.student_id,
    pad.assignment_id,
    pad.id,
    annotationRow.id,
    key.code,
    key.category,
    key.label,
    annotationRow.selected_text ?? '',
    annotationRow.body ?? '',
    Number(annotationRow.document_version ?? 1),
    annotationRow.resolved === 1 ? 1 : 0
  );
  recomputeStudentLiteracyStat(db, pad.student_id, key.code, key.category, key.label);
}

function loadStudentWritingProfile(db, studentId) {
  const profile = ensureStudentWritingProfile(db, studentId);
  const issues = db.prepare(`
    SELECT code, category, label, evidence_count, open_count, resolved_count, first_seen_at, last_seen_at, updated_at
    FROM student_literacy_issue_stats
    WHERE student_id = ?
    ORDER BY open_count DESC, evidence_count DESC, last_seen_at DESC
  `).all(studentId).map((issue) => ({
    code: issue.code,
    category: issue.category,
    label: issue.label,
    evidence_count: Number(issue.evidence_count ?? 0),
    open_count: Number(issue.open_count ?? 0),
    resolved_count: Number(issue.resolved_count ?? 0),
    first_seen_at: issue.first_seen_at,
    last_seen_at: issue.last_seen_at,
    updated_at: issue.updated_at,
  }));
  const evidence = db.prepare(`
    SELECT sle.assignment_id, sle.native_pad_id, sle.annotation_id, sle.code, sle.category, sle.label,
           sle.selected_text, sle.teacher_note, sle.document_version, sle.resolved, sle.created_at,
           a.settings_json AS assignment_settings_json
    FROM student_literacy_evidence sle
    JOIN assignments a ON a.id = sle.assignment_id
    WHERE sle.student_id = ?
    ORDER BY sle.created_at DESC, sle.id DESC
    LIMIT 30
  `).all(studentId).map((row) => {
    const assignmentSettings = parseSettings(row.assignment_settings_json);
    return {
      assignment_id: row.assignment_id,
      native_pad_id: row.native_pad_id,
      annotation_id: row.annotation_id,
      code: row.code,
      category: row.category,
      label: row.label,
      selected_text: row.selected_text,
      teacher_note: row.teacher_note,
      document_version: Number(row.document_version ?? 1),
      resolved: row.resolved === 1,
      created_at: row.created_at,
      essay_type: assignmentSettings.essay_type ?? 'other',
      supervision: assignmentSettings.supervision ?? 'in_class',
    };
  });
  return { ...profile, literacy_issues: issues, recent_evidence: evidence };
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

// Read model for the teacher student-profile dashboard (OPUS_HANDOFF §3).
// Returns length-normalized headline numbers, the per-essay strip with
// provenance and anomaly flags, recurring-code series, the voice fingerprint
// against the real-student class median, and score history grouped by
// rubric_kind and essay_type. The student variant is produced client-side by
// hiding the anomaly banner and provenance strip; nothing here is student-only.
function loadWritingProfileDashboard(db, studentId) {
  const student = db.prepare(`
    SELECT s.id, s.display_name, s.username, c.name AS class_name
    FROM students s LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id = ?
  `).get(studentId);
  if (!student) return null;
  const isApLang = isApLangClassName(student.class_name);
  const base = loadStudentWritingProfile(db, studentId);

  // Per-essay strip: every pad with a stored fingerprint, oldest first.
  const padRows = db.prepare(`
    SELECT np.id AS pad_id, np.assignment_id, np.word_count, np.state, np.created_at,
           a.title, a.settings_json,
           sm.metrics_json,
           (SELECT COUNT(*) FROM student_literacy_evidence sle WHERE sle.native_pad_id = np.id) AS error_count,
           (SELECT total FROM score_snapshots ss WHERE ss.native_pad_id = np.id AND ss.rubric_kind = 'internal' ORDER BY ss.id DESC LIMIT 1) AS internal_total,
           (SELECT total FROM score_snapshots ss WHERE ss.native_pad_id = np.id AND ss.rubric_kind = 'exam' ORDER BY ss.id DESC LIMIT 1) AS exam_total
    FROM native_pads np
    JOIN assignments a ON a.id = np.assignment_id
    LEFT JOIN style_metrics sm ON sm.native_pad_id = np.id
    WHERE np.student_id = ?
    ORDER BY np.created_at ASC, np.id ASC
  `).all(studentId);

  const essays = padRows.map((row, i) => {
    const settings = parseSettings(row.settings_json);
    const wc = Number(row.word_count ?? 0);
    const errors = Number(row.error_count ?? 0);
    const errPer100 = wc ? Math.round((errors / wc) * 1000) / 10 : 0;
    let metrics = null; try { metrics = JSON.parse(row.metrics_json || 'null'); } catch (_) {}
    const anomaly = detectStyleAnomaly(db, { padId: row.pad_id });
    return {
      index: i + 1,
      pad_id: row.pad_id,
      assignment_id: row.assignment_id,
      title: row.title,
      essay_type: settings.essay_type ?? 'other',
      supervision: settings.supervision ?? 'in_class',
      word_count: wc,
      error_count: errors,
      err_per_100: errPer100,
      internal_total: row.internal_total != null ? Number(row.internal_total) : null,
      exam_total: row.exam_total != null ? Number(row.exam_total) : null,
      metrics,
      anomaly: { status: anomaly.status, anomalies: anomaly.anomalies || [] },
    };
  });

  // Headline numbers: first vs last err/100, totals, rubric first vs last.
  const rateSeries = essays.map((e) => e.err_per_100);
  const errTotal = essays.reduce((s, e) => s + e.error_count, 0);
  const rubricSeries = essays.map((e) => e.internal_total).filter((v) => v != null);
  const headline = {
    err_per_100_first: rateSeries.length ? rateSeries[0] : null,
    err_per_100_last: rateSeries.length ? rateSeries[rateSeries.length - 1] : null,
    err_total: errTotal,
    essays_count: essays.length,
    rubric_first: rubricSeries.length ? rubricSeries[0] : null,
    rubric_last: rubricSeries.length ? rubricSeries[rubricSeries.length - 1] : null,
  };

  // Recurring codes: per-essay err/100 for each code, plus fix rate and trend.
  const codeStats = base.literacy_issues;
  const recurring = codeStats.slice(0, 6).map((issue) => {
    const perEssay = essays.map((e) => {
      const n = db.prepare(
        'SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE native_pad_id = ? AND code = ? AND category = ?'
      ).get(e.pad_id, issue.code, issue.category).n;
      return e.word_count ? Math.round((n / e.word_count) * 1000) / 10 : 0;
    });
    const half = Math.floor(perEssay.length / 2);
    const firstMean = half ? perEssay.slice(0, half).reduce((a, b) => a + b, 0) / half : 0;
    const lastMean = (perEssay.length - half) ? perEssay.slice(half).reduce((a, b) => a + b, 0) / (perEssay.length - half) : 0;
    const delta = lastMean - firstMean;
    return {
      code: issue.code,
      category: issue.category,
      label: issue.label,
      per_essay: perEssay,
      resolved_count: issue.resolved_count,
      evidence_count: issue.evidence_count,
      trend: delta < -0.5 ? 'better' : delta > 0.5 ? 'worse' : 'flat',
    };
  });

  // Voice fingerprint vs the real-student class median (excludes demo/ghost).
  const styleProfile = aggregateStyleProfile(db, { studentId });
  const medianRows = db.prepare(`
    SELECT sm.metrics_json
    FROM style_metrics sm
    JOIN students s ON s.id = sm.student_id
    WHERE s.id != ? AND ${realStudentsWhere('s')}
  `).all(studentId);
  const medianSeries = {};
  for (const r of medianRows) {
    let m = null; try { m = JSON.parse(r.metrics_json); } catch (_) {}
    if (!m) continue;
    for (const k of Object.keys(m)) { (medianSeries[k] = medianSeries[k] || []).push(Number(m[k])); }
  }
  const classMedian = {};
  for (const k of Object.keys(medianSeries)) classMedian[k] = median(medianSeries[k]);

  // Score history grouped by rubric_kind and essay_type.
  const snapshots = db.prepare(`
    SELECT ss.native_pad_id, ss.assignment_id, ss.rubric_kind, ss.total, ss.recorded_at, a.settings_json
    FROM score_snapshots ss JOIN assignments a ON a.id = ss.assignment_id
    WHERE ss.student_id = ?
    ORDER BY ss.recorded_at ASC, ss.id ASC
  `).all(studentId);
  const byRubricKind = {};
  const byEssayType = {};
  for (const s of snapshots) {
    const settings = parseSettings(s.settings_json);
    const etype = settings.essay_type ?? 'other';
    const point = { pad_id: s.native_pad_id, total: Number(s.total), recorded_at: s.recorded_at, essay_type: etype };
    (byRubricKind[s.rubric_kind] = byRubricKind[s.rubric_kind] || []).push(point);
    if (s.rubric_kind === 'exam') (byEssayType[etype] = byEssayType[etype] || []).push(point);
  }

  // essay_type counts, for AP tab locking (needs >= 2 marked of a type).
  const typeCounts = {};
  for (const e of essays) typeCounts[e.essay_type] = (typeCounts[e.essay_type] || 0) + 1;

  return {
    student: { id: student.id, display_name: student.display_name, class_name: student.class_name, is_ap_lang: isApLang },
    profile: { writing_summary: base.writing_summary, voice_summary: base.voice_summary, targets: base.targets },
    literacy_issues: base.literacy_issues,
    recent_evidence: base.recent_evidence,
    essays,
    headline,
    recurring,
    style_profile: styleProfile,
    class_median: classMedian,
    score_history: { by_rubric_kind: byRubricKind, by_essay_type: byEssayType },
    essay_type_counts: typeCounts,
  };
}

function normalizeRubricKind(kind) {
  return RUBRIC_KINDS.has(kind) ? kind : 'internal';
}

// The AP Lang exam estimate only surfaces for AP Language classes, detected by
// the class name (e.g. "AP Lang", "AP Language and Composition").
function isApLangClassName(name) {
  return /\bap\b[\s._-]*lang/i.test(String(name || ''));
}

function loadAssignmentRubric(db, assignmentId, rubricKind = 'internal') {
  const kind = normalizeRubricKind(rubricKind);
  const criteria = db.prepare(`
    SELECT *
    FROM assignment_rubric_criteria
    WHERE assignment_id = ? AND rubric_kind = ?
    ORDER BY sort_order ASC, id ASC
  `).all(assignmentId, kind);
  if (!criteria.length) return { criteria: [] };

  const bandRows = db.prepare(`
    SELECT b.*
    FROM assignment_rubric_bands b
    JOIN assignment_rubric_criteria c ON c.id = b.criterion_id
    WHERE c.assignment_id = ? AND c.rubric_kind = ?
    ORDER BY b.sort_order ASC, b.score_value ASC, b.id ASC
  `).all(assignmentId, kind);
  const bandsByCriterion = new Map();
  for (const band of bandRows) {
    const list = bandsByCriterion.get(band.criterion_id) ?? [];
    list.push({
      id: band.id,
      score_value: Number(band.score_value),
      label: band.label ?? '',
      descriptor: band.descriptor ?? '',
    });
    bandsByCriterion.set(band.criterion_id, list);
  }

  return {
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      assignment_id: criterion.assignment_id,
      rubric_kind: criterion.rubric_kind ?? 'internal',
      label: criterion.label,
      description: criterion.description ?? '',
      weight: Number(criterion.weight ?? 1),
      sort_order: Number(criterion.sort_order ?? 0),
      bands: bandsByCriterion.get(criterion.id) ?? [],
    })),
  };
}

function loadRubricScores(db, padId, rubricKind = 'internal') {
  const kind = normalizeRubricKind(rubricKind);
  return db.prepare(`
    SELECT s.*
    FROM native_rubric_scores s
    JOIN assignment_rubric_criteria c ON c.id = s.criterion_id
    WHERE s.native_pad_id = ? AND c.rubric_kind = ?
    ORDER BY s.criterion_id ASC
  `).all(padId, kind).map(publicRubricScore);
}

// Append a point-in-time snapshot of a pad's current rubric scores to
// score_snapshots, so rubric and AP performance can be tracked over time.
// Called on finish-marking. No-op when the rubric has no scores yet.
function writeScoreSnapshot(db, pad, rubricKind = 'internal') {
  const kind = normalizeRubricKind(rubricKind);
  const rawScores = loadRubricScores(db, pad.id, kind);
  if (!rawScores.length) return;
  // Attach the criterion label so the snapshot is self-describing over time.
  const labels = new Map(loadAssignmentRubric(db, pad.assignment_id, kind).criteria.map((c) => [c.id, c.label]));
  const scores = rawScores.map((s) => ({ ...s, label: labels.get(s.criterion_id) ?? '' }));
  const total = scores.reduce((sum, s) => sum + Number(s.selected_score ?? 0), 0);
  db.prepare(`
    INSERT INTO score_snapshots (native_pad_id, student_id, assignment_id, rubric_kind, scores_json, total, pad_state)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    pad.id,
    pad.student_id,
    pad.assignment_id,
    kind,
    JSON.stringify(scores),
    total,
    pad.state ?? ''
  );
}

function publicFeedbackItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    feedback_key: row.feedback_key ?? '',
    title: row.title,
    explanation: row.explanation ?? '',
    try_now_prompt: row.try_now_prompt ?? '',
    source: row.source ?? 'teacher',
    sort_order: Number(row.sort_order ?? 0),
    student_checked: row.student_checked === 1,
    student_checked_at: row.student_checked_at ?? null,
    created_at: row.created_at,
  };
}

// `source` ('ai' vs 'teacher') and an annotation's `suggestion_id`/AI metadata
// exist for the teacher review UI (native-review.html shows an "AI" tag).
// Marks and feedback always read as the teacher's own to the student, so
// every student-facing response strips them before it leaves the server.
function studentSafeFeedbackItem(item) {
  const { source, ...rest } = item;
  return rest;
}

function studentSafeFeedback(feedback) {
  return {
    strengths: feedback.strengths.map(studentSafeFeedbackItem),
    targets: feedback.targets.map(studentSafeFeedbackItem),
  };
}

function studentSafeAnnotation(annotation) {
  const { source, suggestion_id, ...metadata } = annotation.metadata || {};
  return { ...annotation, metadata };
}

function loadFeedbackItems(db, padId) {
  const rows = db.prepare(`
    SELECT * FROM native_feedback_items
    WHERE native_pad_id = ?
    ORDER BY kind ASC, sort_order ASC, id ASC
  `).all(padId).map(publicFeedbackItem);
  return {
    strengths: rows.filter((item) => item.kind === 'strength'),
    targets: rows.filter((item) => item.kind === 'target'),
  };
}

function normalizeFeedbackItemInput(body) {
  const kind = String(body?.kind ?? '');
  if (kind !== 'strength' && kind !== 'target') {
    const error = new Error('invalid_feedback_kind');
    error.statusCode = 400;
    throw error;
  }
  const title = normalizeRubricText(body?.title, 180);
  if (!title) {
    const error = new Error('title_required');
    error.statusCode = 400;
    throw error;
  }
  const source = body?.source === 'ai' ? 'ai' : 'teacher';
  return {
    kind,
    title,
    feedbackKey: normalizeRubricText(body?.feedback_key, 80),
    explanation: normalizeComment(body?.explanation).slice(0, 4000),
    tryNowPrompt: normalizeComment(body?.try_now_prompt).slice(0, 2000),
    source,
    sortOrder: Number.isInteger(Number(body?.sort_order)) ? Number(body.sort_order) : 0,
  };
}

function copyAssignmentRubric(db, sourceAssignmentId, targetAssignmentId) {
  const criteria = db.prepare(`
    SELECT *
    FROM assignment_rubric_criteria
    WHERE assignment_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(sourceAssignmentId);
  if (!criteria.length) return 0;

  const insertCriterion = db.prepare(`
    INSERT INTO assignment_rubric_criteria (assignment_id, label, description, weight, sort_order, rubric_kind)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertBand = db.prepare(`
    INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  let copied = 0;
  for (const criterion of criteria) {
    const result = insertCriterion.run(
      targetAssignmentId,
      criterion.label,
      criterion.description ?? '',
      Number(criterion.weight ?? 1),
      Number(criterion.sort_order ?? copied),
      criterion.rubric_kind ?? 'internal'
    );
    const bands = db.prepare(`
      SELECT *
      FROM assignment_rubric_bands
      WHERE criterion_id = ?
      ORDER BY sort_order ASC, score_value ASC, id ASC
    `).all(criterion.id);
    for (const band of bands) {
      insertBand.run(
        result.lastInsertRowid,
        Number(band.score_value),
        band.label ?? '',
        band.descriptor ?? '',
        Number(band.sort_order ?? 0)
      );
    }
    copied += 1;
  }
  return copied;
}

function copyPassagePdf(sourceAssignmentId, targetAssignmentId) {
  const source = path.join(PASSAGES_DIR, `${sourceAssignmentId}.pdf`);
  const target = path.join(PASSAGES_DIR, `${targetAssignmentId}.pdf`);
  try {
    fs.copyFileSync(source, target);
    return true;
  } catch (_) {
    return false;
  }
}

function greenpenRewriteSettingsForSource(source, settings) {
  if (source.type !== 'test') {
    return {
      ...settings,
      native_inkpad: true,
      green_pen: false,
      source_assignment_id: source.id,
      greenpen_rewrite: true,
      prompt: settings.prompt || `Rewrite ${source.title} using your feedback.`,
    };
  }
  return {
    type: 'essay',
    submit_behaviour: 'draft',
    spellcheck: true,
    word_count: true,
    paste_detection: true,
    paste_mode: 'log',
    native_inkpad: true,
    green_pen: false,
    greenpen_rewrite: true,
    source_assignment_id: source.id,
    essay_type: settings.essay_type || 'other',
    supervision: 'in_class',
    feedback_release: 'batch',
    prompt: 'Rewrite your test answers using your feedback.',
  };
}

function testSrqQuestionsInOrder(db, settings) {
  const ids = [];
  const sections = Array.isArray(settings.test?.sections) ? settings.test.sections : [];
  for (const section of sections) {
    if (section?.kind !== 'srq') continue;
    for (const id of section.question_ids ?? []) {
      const questionId = Number(id);
      if (Number.isInteger(questionId) && questionId > 0) ids.push(questionId);
    }
  }
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, prompt_text FROM test_questions WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function testAnswerText(answerJson) {
  const answer = parseMetadataJson(answerJson);
  return String(answer.text ?? '').trim();
}

function compositeTestRewriteForStudent(db, { settings, frqPad, attempt }) {
  const parts = [];
  const frqText = String(frqPad?.plain_text ?? '').trim();
  if (frqText) parts.push(frqText);
  if (attempt) {
    const response = db.prepare('SELECT answer_json FROM test_responses WHERE attempt_id = ? AND question_id = ?');
    for (const question of testSrqQuestionsInOrder(db, settings)) {
      const text = testAnswerText(response.get(attempt.id, question.id)?.answer_json);
      if (text) parts.push(`${question.prompt_text}\n${text}`);
    }
  }
  if (!parts.length) return null;
  const plainText = parts.join('\n\n');
  return {
    plainText,
    documentJson: normalizeDocumentJson(documentForPlainText(plainText)),
    wordCount: countWords(plainText),
    copyAnnotationsFromPadId: frqText && frqPad ? frqPad.id : null,
    rewriteOfPadId: frqPad?.id ?? null,
  };
}

function createGreenpenRewriteAssignment(db, sourceAssignmentId, teacherId, requestedTitle) {
  const source = db.prepare(`
    SELECT *
    FROM assignments
    WHERE id = ?
  `).get(sourceAssignmentId);
  if (!source || !nativeEnabled(source)) {
    const error = new Error('assignment_not_found');
    error.statusCode = 404;
    throw error;
  }

  const settings = parseSettings(source.settings_json);
  const title = normalizeRubricText(
    requestedTitle,
    180,
    `Greenpen rewrite: ${source.title}`
  ) || `Greenpen rewrite: ${source.title}`;
  const rewriteSettings = greenpenRewriteSettingsForSource(source, settings);
  const rewriteType = source.type === 'test' ? 'essay' : source.type;

  let targetAssignmentId = null;
  let copiedPads = 0;
  let copiedAnnotations = 0;
  db.exec('BEGIN');
  try {
    const assignmentResult = db.prepare(`
      INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
    `).run(source.class_id, title, rewriteType, JSON.stringify(rewriteSettings), source.due_at ?? null);
    targetAssignmentId = assignmentResult.lastInsertRowid;

    const overrideRows = db.prepare('SELECT student_id FROM assignment_students WHERE assignment_id = ?').all(source.id);
    if (overrideRows.length) {
      const insertOverride = db.prepare('INSERT OR IGNORE INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
      for (const row of overrideRows) insertOverride.run(targetAssignmentId, row.student_id);
    }

    copyAssignmentRubric(db, source.id, targetAssignmentId);

    const sourcePads = db.prepare(`
      SELECT *
      FROM native_pads
      WHERE assignment_id = ?
      ORDER BY student_id ASC, id ASC
    `).all(source.id);
    const sourcePadsByStudent = new Map(sourcePads.map((pad) => [pad.student_id, pad]));
    const attempts = source.type === 'test'
      ? db.prepare('SELECT * FROM test_attempts WHERE assignment_id = ? ORDER BY student_id ASC, id ASC').all(source.id)
      : [];
    const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.student_id, attempt]));
    const studentIds = source.type === 'test'
      ? [...new Set([...sourcePads.map((pad) => pad.student_id), ...attempts.map((attempt) => attempt.student_id)])].sort((a, b) => a - b)
      : sourcePads.map((pad) => pad.student_id);
    const insertPad = db.prepare(`
      INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version, rewrite_of_pad_id)
      VALUES (?, ?, 'writing', ?, ?, ?, 1, ?)
    `);
    const insertAnnotation = db.prepare(`
      INSERT INTO native_annotations (
        native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, resolved, document_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const sourceAnnotationRows = db.prepare(`
      SELECT *
      FROM native_annotations
      WHERE native_pad_id = ?
      ORDER BY id ASC
    `);
    for (const studentId of studentIds) {
      const pad = sourcePadsByStudent.get(studentId);
      const seed = source.type === 'test'
        ? compositeTestRewriteForStudent(db, { settings, frqPad: pad, attempt: attemptsByStudent.get(studentId) })
        : {
            plainText: pad.plain_text ?? '',
            documentJson: pad.document_json,
            wordCount: Number(pad.word_count ?? 0),
            copyAnnotationsFromPadId: pad.id,
            rewriteOfPadId: pad.id,
          };
      if (!seed) continue;
      const result = insertPad.run(
        studentId,
        targetAssignmentId,
        seed.documentJson,
        seed.plainText,
        seed.wordCount,
        seed.rewriteOfPadId
      );
      const newPadId = result.lastInsertRowid;
      const newPad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(newPadId);
      insertRevision(db, newPadId, 'create', newPad);
      ensurePolicy(db, newPadId, rewriteSettings, teacherId);
      copiedPads += 1;

      if (!seed.copyAnnotationsFromPadId) continue;
      for (const annotation of sourceAnnotationRows.all(seed.copyAnnotationsFromPadId)) {
        const metadata = parseMetadataJson(annotation.metadata_json);
        metadata.source_annotation_id = annotation.id;
        metadata.source_assignment_id = source.id;
        insertAnnotation.run(
          newPadId,
          annotation.teacher_id ?? teacherId,
          annotation.type,
          annotation.start_offset,
          annotation.end_offset,
          annotation.selected_text ?? '',
          annotation.body ?? '',
          normalizeMetadata(metadata),
          annotation.resolved === 1 ? 1 : 0,
          1
        );
        copiedAnnotations += 1;
      }
      logTeacherEvent(db, newPadId, teacherId, 'greenpen_rewrite_created', {
        source_assignment_id: source.id,
        source_native_pad_id: pad.id,
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  copyPassagePdf(source.id, targetAssignmentId);
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(targetAssignmentId);
  return { assignment, copiedPads, copiedAnnotations };
}

// Copy one marked source essay pad into an existing green-pen rewrite
// assignment: a fresh 'writing' pad seeded with the student's text, linked back
// via rewrite_of_pad_id, with the teacher marks copied as reference. Shared by
// the release-time ensure path below.
function copyEssayPadIntoRewrite(db, { source, sourcePad, targetAssignmentId, teacherId, rewriteSettings }) {
  const result = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version, rewrite_of_pad_id)
    VALUES (?, ?, 'writing', ?, ?, ?, 1, ?)
  `).run(
    sourcePad.student_id,
    targetAssignmentId,
    sourcePad.document_json,
    sourcePad.plain_text ?? '',
    Number(sourcePad.word_count ?? 0),
    sourcePad.id
  );
  const newPadId = result.lastInsertRowid;
  const newPad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(newPadId);
  insertRevision(db, newPadId, 'create', newPad);
  ensurePolicy(db, newPadId, rewriteSettings, teacherId);

  const insertAnnotation = db.prepare(`
    INSERT INTO native_annotations (
      native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, resolved, document_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sourceAnnotations = db.prepare('SELECT * FROM native_annotations WHERE native_pad_id = ? ORDER BY id ASC').all(sourcePad.id);
  let copiedAnnotations = 0;
  for (const annotation of sourceAnnotations) {
    const metadata = parseMetadataJson(annotation.metadata_json);
    metadata.source_annotation_id = annotation.id;
    metadata.source_assignment_id = source.id;
    insertAnnotation.run(
      newPadId,
      annotation.teacher_id ?? teacherId,
      annotation.type,
      annotation.start_offset,
      annotation.end_offset,
      annotation.selected_text ?? '',
      annotation.body ?? '',
      normalizeMetadata(metadata),
      annotation.resolved === 1 ? 1 : 0,
      1
    );
    copiedAnnotations += 1;
  }
  logTeacherEvent(db, newPadId, teacherId, 'greenpen_rewrite_created', {
    source_assignment_id: source.id,
    source_native_pad_id: sourcePad.id,
  });
  return { newPadId, copiedAnnotations };
}

// The green-pen rewrite assignment spun off from a source essay is found by
// following the rewrite_of_pad_id links, not a settings field: this survives a
// later edit of either assignment (buildSettingsJson strips unknown keys).
function findRewriteAssignmentId(db, sourceAssignmentId) {
  const row = db.prepare(`
    SELECT rp.assignment_id AS id
    FROM native_pads sp
    JOIN native_pads rp ON rp.rewrite_of_pad_id = sp.id
    WHERE sp.assignment_id = ?
    ORDER BY rp.id ASC
    LIMIT 1
  `).get(sourceAssignmentId);
  return row ? row.id : null;
}

const REWRITE_ELIGIBLE_STATES = "('marked','green_pen_open','resubmitted')";

// Ensure a SEPARATE green-pen rewrite assignment exists for a source essay and
// that each given (marked) student has a rewrite pad in it. Called at feedback
// release time (class-wide with studentIds=null, or per student with a list).
// Idempotent: creates the assignment on the first release, then only adds
// students not already present. Returns null when the source is not a native
// essay or green pen is off for it.
export function ensureGreenpenRewriteForStudents(db, sourceAssignmentId, teacherId, studentIds = null) {
  const source = db.prepare('SELECT * FROM assignments WHERE id = ?').get(sourceAssignmentId);
  if (!source || !nativeEnabled(source) || source.type === 'test') return null;
  const settings = parseSettings(source.settings_json);
  if (settings.green_pen !== true) return null;

  let sourcePads;
  if (Array.isArray(studentIds) && studentIds.length) {
    const placeholders = studentIds.map(() => '?').join(',');
    sourcePads = db.prepare(
      `SELECT * FROM native_pads WHERE assignment_id = ? AND student_id IN (${placeholders}) AND state IN ${REWRITE_ELIGIBLE_STATES}`
    ).all(sourceAssignmentId, ...studentIds);
  } else {
    sourcePads = db.prepare(
      `SELECT * FROM native_pads WHERE assignment_id = ? AND state IN ${REWRITE_ELIGIBLE_STATES} ORDER BY student_id ASC`
    ).all(sourceAssignmentId);
  }
  // Nothing marked yet and no rewrite assignment to add to: nothing to do.
  if (!sourcePads.length && findRewriteAssignmentId(db, sourceAssignmentId) == null) return null;

  const rewriteSettings = greenpenRewriteSettingsForSource(source, settings);
  let created = false;
  let addedPads = 0;
  let addedAnnotations = 0;
  db.exec('BEGIN');
  let targetAssignmentId;
  try {
    targetAssignmentId = findRewriteAssignmentId(db, sourceAssignmentId);
    if (targetAssignmentId == null) {
      const title = `Greenpen rewrite: ${source.title}`.slice(0, 180);
      const assignmentResult = db.prepare(`
        INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
      `).run(source.class_id, title, source.type, JSON.stringify(rewriteSettings), source.due_at ?? null);
      targetAssignmentId = assignmentResult.lastInsertRowid;
      const overrideRows = db.prepare('SELECT student_id FROM assignment_students WHERE assignment_id = ?').all(source.id);
      if (overrideRows.length) {
        const insertOverride = db.prepare('INSERT OR IGNORE INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
        for (const r of overrideRows) insertOverride.run(targetAssignmentId, r.student_id);
      }
      copyAssignmentRubric(db, source.id, targetAssignmentId);
      created = true;
    }
    const existingRewritePad = db.prepare('SELECT 1 FROM native_pads WHERE assignment_id = ? AND rewrite_of_pad_id = ?');
    for (const pad of sourcePads) {
      if (existingRewritePad.get(targetAssignmentId, pad.id)) continue;
      const r = copyEssayPadIntoRewrite(db, { source, sourcePad: pad, targetAssignmentId, teacherId, rewriteSettings });
      addedPads += 1;
      addedAnnotations += r.copiedAnnotations;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (created) copyPassagePdf(source.id, targetAssignmentId);
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(targetAssignmentId);
  return { assignment, created, addedPads, addedAnnotations };
}

function loadBackupRubricScores(db, padIds) {
  if (!padIds.length) return new Map();
  const placeholders = padIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT *
    FROM native_rubric_scores
    WHERE native_pad_id IN (${placeholders})
    ORDER BY native_pad_id ASC, criterion_id ASC
  `).all(...padIds);
  const byPad = new Map();
  for (const row of rows) {
    const list = byPad.get(row.native_pad_id) ?? [];
    list.push(publicRubricScore(row));
    byPad.set(row.native_pad_id, list);
  }
  return byPad;
}

function normalizeRubricCriteria(body, fallback = DEFAULT_RUBRIC) {
  const source = Array.isArray(body?.criteria) && body.criteria.length ? body.criteria : fallback;
  if (source.length > 20) {
    const error = new Error('too_many_rubric_criteria');
    error.statusCode = 400;
    throw error;
  }

  return source.map((item, index) => {
    const label = normalizeRubricText(item?.label, MAX_RUBRIC_LABEL_LENGTH, fallback[index]?.label || `Criterion ${index + 1}`);
    if (!label) {
      const error = new Error('rubric_label_required');
      error.statusCode = 400;
      throw error;
    }
    const weight = Number(item?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) {
      const error = new Error('invalid_rubric_weight');
      error.statusCode = 400;
      throw error;
    }
    const bands = Array.isArray(item?.bands) && item.bands.length
      ? item.bands
      : [0, 1, 2, 3, 4, 5].map((score) => ({ score_value: score, label: String(score), descriptor: '' }));
    return {
      label,
      description: normalizeRubricText(item?.description, MAX_RUBRIC_DESCRIPTION_LENGTH),
      weight,
      sortOrder: Number.isInteger(Number(item?.sort_order)) ? Number(item.sort_order) : index,
      bands: bands.slice(0, 20).map((band, bandIndex) => ({
        scoreValue: normalizeHalfScore(band?.score_value ?? band?.score ?? bandIndex, 'rubric_band_score'),
        label: normalizeRubricText(band?.label, MAX_RUBRIC_LABEL_LENGTH, String(band?.score_value ?? band?.score ?? bandIndex)),
        descriptor: normalizeRubricText(band?.descriptor, MAX_RUBRIC_DESCRIPTION_LENGTH),
        sortOrder: Number.isInteger(Number(band?.sort_order)) ? Number(band.sort_order) : bandIndex,
      })),
    };
  });
}

function replaceAssignmentRubric(db, assignmentId, criteria, rubricKind = 'internal') {
  const kind = normalizeRubricKind(rubricKind);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM assignment_rubric_criteria WHERE assignment_id = ? AND rubric_kind = ?').run(assignmentId, kind);
    const insertCriterion = db.prepare(`
      INSERT INTO assignment_rubric_criteria (assignment_id, label, description, weight, sort_order, rubric_kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertBand = db.prepare(`
      INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const criterion of criteria) {
      const result = insertCriterion.run(assignmentId, criterion.label, criterion.description, criterion.weight, criterion.sortOrder, kind);
      for (const band of criterion.bands) {
        insertBand.run(result.lastInsertRowid, band.scoreValue, band.label, band.descriptor, band.sortOrder);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function resolveNativeAssignmentAndStudent(db, assignmentId, studentId) {
  const assignment = db.prepare(
    'SELECT id, class_id, title, type, settings_json, opens_at, due_at, feedback_released_at FROM assignments WHERE id = ?'
  ).get(assignmentId);
  if (!assignment) {
    const error = new Error('assignment_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (!nativeEnabled(assignment)) {
    const error = new Error('native_inkpad_not_enabled');
    error.statusCode = 404;
    throw error;
  }

  const student = db.prepare('SELECT id, display_name, class_id FROM students WHERE id = ?').get(studentId);
  if (!student) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    throw error;
  }

  const overrideCount = db.prepare(
    'SELECT COUNT(*) AS n FROM assignment_students WHERE assignment_id = ?'
  ).get(assignmentId).n;
  const allowed = overrideCount > 0
    ? !!db.prepare('SELECT 1 FROM assignment_students WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId)
    : student.class_id === assignment.class_id;
  if (!allowed) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    throw error;
  }

  return { assignment, student, settings: parseSettings(assignment.settings_json) };
}

// In 'batch' feedback_release mode, feedback and green-pen rewrite access stay
// closed for marked/reopened/resubmitted pads until the teacher releases them.
function isBatchFeedbackHeld(db, assignmentId, padState, pad = null) {
  if (!['marked', 'green_pen_open', 'resubmitted'].includes(padState)) return false;
  // A per-student release on the pad overrides the class-wide hold.
  if (pad && pad.feedback_released_at) return false;
  const row = db.prepare('SELECT settings_json, feedback_released_at FROM assignments WHERE id = ?').get(assignmentId);
  if (!row) return false;
  const settings = parseSettings(row.settings_json);
  return settings.feedback_release === 'batch' && !row.feedback_released_at;
}

function insertRevision(db, padId, reason, row) {
  db.prepare(`
    INSERT INTO native_pad_revisions (native_pad_id, reason, document_json, plain_text, word_count, document_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(padId, reason, row.document_json, row.plain_text ?? '', Number(row.word_count ?? 0), Number(row.version ?? 1));
}

function insertImportedRevision(db, padId, reason, documentJson, plainText, wordCount, documentVersion) {
  db.prepare(`
    INSERT INTO native_pad_revisions (native_pad_id, reason, document_json, plain_text, word_count, document_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(padId, reason, documentJson, plainText, wordCount, documentVersion);
}

function comparisonForRevisions(revisions) {
  const submissions = revisions.filter(revision => revision.reason === 'submit');
  return {
    rewrite_available: submissions.length > 1,
    original_submission: submissions[0] ?? null,
    latest_submission: submissions.at(-1) ?? null,
    submission_count: submissions.length,
  };
}

function importTeacherText(db, pad, teacherId, { plainText, replaceCurrent, source }) {
  const documentJson = normalizeDocumentJson(documentForPlainText(plainText));
  const wordCount = countWords(plainText);
  if (replaceCurrent) {
    db.prepare(`
      UPDATE native_pads
      SET document_json = ?, plain_text = ?, word_count = ?, version = version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(documentJson, plainText, wordCount, pad.id);
    const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(pad.id);
    insertRevision(db, pad.id, 'manual', updated);
    logTeacherEvent(db, pad.id, teacherId, 'teacher_import_replace', { source, word_count: wordCount });
    return updated;
  }

  insertImportedRevision(db, pad.id, 'manual', documentJson, plainText, wordCount, Number(pad.version ?? 1));
  logTeacherEvent(db, pad.id, teacherId, 'teacher_import_revision_only', { source, word_count: wordCount });
  return db.prepare('SELECT * FROM native_pads WHERE id = ?').get(pad.id);
}

function ensurePolicy(db, padId, settings = {}, teacherId = null) {
  const existing = db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
  if (existing) return existing;
  const pasteMode = PASTE_MODES.has(settings.paste_mode) ? settings.paste_mode : (settings.paste_detection === false ? 'allow' : 'log');
  const spellcheck = settings.spellcheck === false ? 0 : 1;
  db.prepare(`
    INSERT INTO native_pad_policies (native_pad_id, paste_mode, spellcheck_enabled, updated_by_teacher_id)
    VALUES (?, ?, ?, ?)
  `).run(padId, pasteMode, spellcheck, teacherId);
  return db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
}

function provisionNativePad(db, { assignment, student }) {
  let pad = db.prepare(
    'SELECT * FROM native_pads WHERE student_id = ? AND assignment_id = ?'
  ).get(student.id, assignment.id);
  if (pad) return pad;

  const result = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, document_json, plain_text, word_count)
    VALUES (?, ?, ?, '', 0)
  `).run(student.id, assignment.id, EMPTY_DOC);
  pad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(result.lastInsertRowid);
  insertRevision(db, pad.id, 'create', pad);
  ensurePolicy(db, pad.id, parseSettings(assignment.settings_json));
  return pad;
}

function applyDueDateLock(db, pad, assignment) {
  const now = new Date().toISOString();
  if (!assignment.due_at || assignment.due_at > now) return false;
  if (pad.state !== 'writing') return false;
  const revisionReturn = db.prepare(`
    SELECT id
    FROM native_teacher_events
    WHERE native_pad_id = ? AND action = 'revision_returned'
    ORDER BY id DESC
    LIMIT 1
  `).get(pad.id);
  if (revisionReturn) return false;
  db.prepare("UPDATE native_pads SET state = 'submitted', submitted_at = COALESCE(submitted_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(pad.id);
  pad.state = 'submitted';
  pad.submitted_at = pad.submitted_at ?? now;
  return true;
}

// Auto-accept policy (2026-07-02 teacher decision): literacy codes are
// formative practice for L2 learners, not grading factors, so a finding both
// models agree on at high confidence becomes a real mark without a teacher
// click. Contested findings stay pending. The teacher can disagree with any
// auto-applied mark, which retracts it from feedback and the profile data.
export const AUTO_ACCEPT_CONFIDENCE = 0.75;

// A fresh analysis run must REPLACE the previous run, not stack on it.
// runLiteracyAnalysis clears pending suggestions itself, but marks that were
// already auto-promoted live in native_annotations and would otherwise get a
// second copy (Gra on top of Gra). Retract every AI-auto mark the way the
// disagree endpoint does: delete the annotation, recompute the profile stat,
// then remove the spent suggestion rows. Rejected rows are kept so teacher
// disagreements can veto the same finding when it comes back.
export function retractAiMarksForPad(db, padId) {
  const pad = db.prepare('SELECT id, student_id FROM native_pads WHERE id = ?').get(padId);
  if (!pad) return { retracted: 0 };
  const accepted = db.prepare(
    "SELECT * FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'accepted' AND annotation_id IS NOT NULL"
  ).all(padId);
  let retracted = 0;
  for (const suggestion of accepted) {
    const annotation = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(suggestion.annotation_id);
    if (annotation) {
      const key = normalizeLiteracyKey(annotation);
      db.prepare('DELETE FROM native_annotations WHERE id = ?').run(annotation.id);
      recomputeStudentLiteracyStat(db, pad.student_id, key.code, key.category, key.label);
      retracted += 1;
    }
  }
  db.prepare("DELETE FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status IN ('pending', 'accepted')").run(padId);
  return { retracted };
}

// Companion to retractAiMarksForPad for strengths and targets: a re-run
// replaces the previous AI pass, so accepted AI suggestions and the feedback
// items they were promoted to go too. Teacher-authored items are never
// linked from a suggestion and stay. Rejected suggestions stay on record.
export function retractAiFeedbackForPad(db, padId) {
  const removed = db.prepare(`
    DELETE FROM native_feedback_items
    WHERE source = 'ai' AND id IN (
      SELECT feedback_item_id FROM ai_feedback_item_suggestions
      WHERE native_pad_id = ? AND status = 'accepted' AND feedback_item_id IS NOT NULL
    )
  `).run(padId).changes;
  db.prepare("DELETE FROM ai_feedback_item_suggestions WHERE native_pad_id = ? AND status IN ('pending', 'accepted')").run(padId);
  return { retracted: removed };
}

export function autoPromoteSuggestions(db, padId) {
  const pad = db.prepare('SELECT id, student_id, assignment_id FROM native_pads WHERE id = ?').get(padId);
  if (!pad) return { promoted: 0 };
  const pending = db.prepare("SELECT * FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'pending'").all(padId);
  const rejectedKeys = new Set(db.prepare(
    "SELECT code, quote FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'rejected'"
  ).all(padId).map((r) => `${r.code} ${r.quote}`));
  let promoted = 0;
  for (const suggestion of pending) {
    // Some codes (MT: direct translation from Chinese) are teacher-judgement
    // calls by definition and never auto-apply.
    if (MANUAL_REVIEW_CODES.has(suggestion.code)) continue;
    // The teacher already disagreed with this exact finding on a previous run.
    if (rejectedKeys.has(`${suggestion.code} ${suggestion.quote}`)) continue;
    let checker = {};
    try { checker = JSON.parse(suggestion.checker_json ?? '{}'); } catch { checker = {}; }
    const confident = checker.verbatim === true && checker.flag == null
      && typeof checker.confidence === 'number' && checker.confidence >= AUTO_ACCEPT_CONFIDENCE;
    if (!confident) continue;
    const metadata = normalizeMetadata({
      code: suggestion.code,
      category: suggestion.category,
      label: suggestion.label || suggestion.code,
      source: 'ai_auto',
      suggestion_id: suggestion.id,
    });
    const annResult = db.prepare(`
      INSERT INTO native_annotations (
        native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version
      ) VALUES (?, NULL, 'literacy_code', ?, ?, ?, '', ?, ?)
    `).run(
      padId, suggestion.start_offset, suggestion.end_offset,
      (suggestion.quote ?? '').slice(0, 2000), metadata, suggestion.document_version
    );
    const annotationRow = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annResult.lastInsertRowid);
    syncLiteracyEvidence(db, pad, annotationRow);
    db.prepare("UPDATE ai_literacy_suggestions SET status = 'accepted', annotation_id = ?, resolved_at = datetime('now') WHERE id = ?")
      .run(annotationRow.id, suggestion.id);
    promoted += 1;
  }
  return { promoted };
}

function loadOwnedNativePad(db, padId, studentId) {
  return db.prepare('SELECT * FROM native_pads WHERE id = ? AND student_id = ?').get(padId, studentId);
}

function loadTeacherNativePad(db, padId) {
  return db.prepare(`
    SELECT np.*,
           s.display_name AS student_name,
           s.username AS student_username,
           a.title AS assignment_title,
           a.type AS assignment_type,
           a.settings_json,
           a.due_at,
           a.feedback_released_at AS feedback_released_at_assignment,
           c.id AS class_id,
           c.name AS class_name
    FROM native_pads np
    JOIN students s ON s.id = np.student_id
    JOIN assignments a ON a.id = np.assignment_id
    JOIN classes c ON c.id = a.class_id
    WHERE np.id = ?
  `).get(padId);
}

function logTeacherEvent(db, padId, teacherId, action, metadata = {}) {
  db.prepare(`
    INSERT INTO native_teacher_events (native_pad_id, teacher_id, action, metadata_json)
    VALUES (?, ?, ?, ?)
  `).run(padId, teacherId, action, normalizeMetadata(metadata));
}

function boolFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

async function readTxtImport(request, reply) {
  const part = await request.file();
  if (!part) {
    return { errorReply: reply.code(400).send({ error: 'file_required' }) };
  }
  const ext = path.extname(part.filename || '').toLowerCase();
  if (ext !== '.txt') {
    part.file.resume();
    return { errorReply: reply.code(400).send({ error: 'unsupported_file_type' }) };
  }

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of part.file) {
      size += chunk.length;
      if (size > MAX_IMPORT_FILE_BYTES) {
        part.file.resume();
        return { errorReply: reply.code(413).send({ error: 'file_too_large' }) };
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return { errorReply: reply.code(413).send({ error: 'file_too_large' }) };
    }
    throw error;
  }
  return { text: normalizePlainText(Buffer.concat(chunks).toString('utf8')), filename: part.filename || 'upload.txt' };
}

function normalizeAnnotationInput(body, pad) {
  const type = String(body?.type ?? '');
  if (!ANNOTATION_TYPES.has(type)) {
    const error = new Error('invalid_annotation_type');
    error.statusCode = 400;
    throw error;
  }

  const start = body?.start_offset === null || body?.start_offset === undefined ? null : Number(body.start_offset);
  const end = body?.end_offset === null || body?.end_offset === undefined ? null : Number(body.end_offset);
  if (type !== 'general_comment' && (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)) {
    const error = new Error('invalid_annotation_range');
    error.statusCode = 400;
    throw error;
  }
  return {
    type,
    start: type === 'general_comment' ? null : start,
    end: type === 'general_comment' ? null : end,
    selectedText: normalizePlainText(body?.selected_text).slice(0, 2000),
    body: normalizeComment(body?.body),
    metadataJson: normalizeMetadata(body?.metadata),
    documentVersion: Number.isInteger(Number(body?.document_version)) ? Number(body.document_version) : Number(pad.version ?? 1),
  };
}

export async function registerNativePadRoutes(app, { db }) {
  app.get('/api/native/assignments/:id/pad',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.id, 'id');
      const studentId = request.session.user.id;
      const { assignment, student } = await resolveNativeAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = provisionNativePad(db, { assignment, student });
      applyDueDateLock(db, pad, assignment);
      const policy = ensurePolicy(db, pad.id, parseSettings(assignment.settings_json));

      return { pad: publicNativePad(pad), policy: publicPolicy(policy) };
    }
  );

  app.post('/api/native/pads/:padId/save',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;
      const pad = loadOwnedNativePad(db, padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'writing' && pad.state !== 'green_pen_open') {
        return reply.code(409).send({ error: 'pad_locked' });
      }
      if (pad.state === 'green_pen_open' && isBatchFeedbackHeld(db, pad.assignment_id, pad.state, pad)) {
        return reply.code(403).send({ error: 'feedback_not_released' });
      }
      const expectedVersion = request.body?.expected_version === undefined ? null : Number(request.body.expected_version);
      if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion !== Number(pad.version ?? 1))) {
        return reply.code(409).send({ error: 'version_conflict', pad: publicNativePad(pad) });
      }

      const documentJson = normalizeDocumentJson(request.body?.document);
      const plainText = normalizePlainText(request.body?.plain_text);
      const wordCount = countWords(plainText);

      db.prepare(`
        UPDATE native_pads
        SET document_json = ?, plain_text = ?, word_count = ?, version = version + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(documentJson, plainText, wordCount, padId);

      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      insertRevision(db, padId, 'autosave', updated);
      return { pad: publicNativePad(updated) };
    }
  );

  app.post('/api/native/pads/:padId/submit',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;
      const pad = loadOwnedNativePad(db, padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'writing' && pad.state !== 'green_pen_open') {
        return reply.code(409).send({ error: 'already_submitted' });
      }
      if (pad.state === 'green_pen_open' && isBatchFeedbackHeld(db, pad.assignment_id, pad.state, pad)) {
        return reply.code(403).send({ error: 'feedback_not_released' });
      }

      const nextState = pad.state === 'green_pen_open' ? 'resubmitted' : 'submitted';
      db.prepare(`
        UPDATE native_pads
        SET state = ?, submitted_at = COALESCE(submitted_at, datetime('now')), updated_at = datetime('now')
        WHERE id = ?
      `).run(nextState, padId);
      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      insertRevision(db, padId, 'submit', updated);

      // Notify the teacher (WeChat via Server酱; no-op if no key configured).
      const meta = db.prepare(`
        SELECT s.display_name AS student_name, a.title AS assignment_title
        FROM native_pads np
        JOIN students s ON s.id = np.student_id
        JOIN assignments a ON a.id = np.assignment_id
        WHERE np.id = ?
      `).get(padId);
      runInBackground('notify', () => notifyTeacher(db, {
        studentName: meta?.student_name ?? 'A student',
        assignmentTitle: meta?.assignment_title ?? 'an assignment',
        action: nextState === 'resubmitted' ? 'resubmitted work' : 'submitted work',
      }));

      // Background analysis seams (stubs until Fable fills phases B/D).
      runInBackground('literacy', () => {
        retractAiMarksForPad(db, padId);
        return runLiteracyAnalysis(db, { padId })
          .then(() => autoPromoteSuggestions(db, padId));
      });
      runInBackground('style-metrics', () => recordStyleMetrics(db, { padId }));
      runInBackground('grade-estimate', () => estimateRubric(db, { padId }));
      runInBackground('feedback-suggestions', () => suggestFeedbackItems(db, { padId }));
      if (nextState === 'resubmitted' && updated.rewrite_of_pad_id) {
        runInBackground('implementation', () => scoreRewrite(db, { rewritePadId: padId }));
      }

      return reply.code(201).send({ pad: publicNativePad(updated), locked: true, resubmitted: nextState === 'resubmitted' });
    }
  );

  app.post('/api/native/pads/:padId/finish-marking',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      // Finish-marking only MARKS the pad. It no longer reveals anything to the
      // student or opens a rewrite: under batch release (the default) the score
      // and feedback stay held until the teacher releases, and the green-pen
      // rewrite is a separate assignment created at release time (see
      // ensureGreenpenRewriteForStudents). This keeps the teacher in control of
      // exactly when scores go out.
      const nextState = 'marked';
      db.prepare("UPDATE native_pads SET state = ?, updated_at = datetime('now') WHERE id = ?").run(nextState, padId);
      logTeacherEvent(db, padId, request.session.user.id, 'marking_finished', { state: nextState });
      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      // Append rubric score history so performance can be tracked over time.
      for (const kind of ['internal', 'secondary', 'exam']) writeScoreSnapshot(db, updated, kind);
      // Finish-marking is when new evidence lands, so refresh the profile
      // summary in the background rather than on a scheduler.
      runInBackground('profile-summary', () => generateProfileSummary(db, { studentId: updated.student_id }));
      // Under IMMEDIATE feedback release there is no separate release click, so
      // finish-marking is the release: spin up the green-pen rewrite assignment
      // now. Batch mode defers this to the release endpoints.
      let rewrite = null;
      const settings = parseSettings(pad.settings_json);
      if (settings.feedback_release !== 'batch') {
        rewrite = ensureGreenpenRewriteForStudents(db, pad.assignment_id, request.session.user.id, [pad.student_id]);
      }
      return {
        pad: publicNativePad(updated),
        rewrite_assignment: rewrite?.assignment
          ? { id: rewrite.assignment.id, title: rewrite.assignment.title, created: rewrite.created }
          : null,
      };
    }
  );

  app.post('/api/native/pads/:padId/return-revision',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      db.prepare("UPDATE native_pads SET state = 'writing', updated_at = datetime('now') WHERE id = ?").run(padId);
      logTeacherEvent(db, padId, request.session.user.id, 'revision_returned', {
        note: normalizeComment(request.body?.note ?? '').slice(0, 500),
      });
      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      return { pad: publicNativePad(updated), returned_for_revision: true };
    }
  );

  app.post('/api/native/assignments/:assignmentId/greenpen-rewrite',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const title = request.body?.title;
      const result = createGreenpenRewriteAssignment(db, assignmentId, request.session.user.id, title);
      return reply.code(201).send({
        assignment: {
          id: result.assignment.id,
          class_id: result.assignment.class_id,
          title: result.assignment.title,
          type: result.assignment.type,
          settings_json: result.assignment.settings_json,
          opens_at: result.assignment.opens_at ?? null,
          due_at: result.assignment.due_at ?? null,
          created_at: result.assignment.created_at,
          is_archived: result.assignment.is_archived === 1,
        },
        copied_pads: result.copiedPads,
        copied_annotations: result.copiedAnnotations,
      });
    }
  );

  app.get('/api/native/pads/:padId/revisions',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = db.prepare('SELECT id FROM native_pads WHERE id = ?').get(padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const revisions = db.prepare(`
        SELECT id, reason, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(padId);
      return { revisions };
    }
  );

  app.get('/api/native/pads/:padId/policy',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const policy = ensurePolicy(db, padId);
      return { policy: publicPolicy(policy) };
    }
  );

  app.put('/api/native/pads/:padId/policy',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const pasteMode = String(request.body?.paste_mode ?? '');
      if (!PASTE_MODES.has(pasteMode)) return reply.code(400).send({ error: 'invalid_paste_mode' });
      const spellcheck = request.body?.spellcheck_enabled === false ? 0 : 1;
      ensurePolicy(db, padId, parseSettings(pad.settings_json), request.session.user.id);
      db.prepare(`
        UPDATE native_pad_policies
        SET paste_mode = ?, spellcheck_enabled = ?, updated_by_teacher_id = ?, updated_at = datetime('now')
        WHERE native_pad_id = ?
      `).run(pasteMode, spellcheck, request.session.user.id, padId);
      logTeacherEvent(db, padId, request.session.user.id, 'policy_changed', { paste_mode: pasteMode, spellcheck_enabled: spellcheck === 1 });
      const policy = db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
      return { policy: publicPolicy(policy) };
    }
  );

  app.post('/api/native/pads/:padId/paste-event',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const length = Number(request.body?.length);
      if (!Number.isFinite(length) || length < 1) return reply.code(400).send({ error: 'length_required' });
      const inputType = typeof request.body?.input_type === 'string' ? request.body.input_type : 'paste';
      db.prepare(`
        INSERT INTO native_paste_events (native_pad_id, length, input_type)
        VALUES (?, ?, ?)
      `).run(padId, Math.round(length), inputType);
      return reply.code(201).send({ ok: true });
    }
  );

  app.put('/api/native/assignments/:assignmentId/rubric',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = db.prepare('SELECT id, settings_json FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment || !nativeEnabled(assignment)) return reply.code(404).send({ error: 'assignment_not_found' });
      const criteria = normalizeRubricCriteria(request.body);
      replaceAssignmentRubric(db, assignmentId, criteria, 'internal');

      return { rubric: loadAssignmentRubric(db, assignmentId) };
    }
  );

  app.put('/api/native/assignments/:assignmentId/secondary-rubric',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = db.prepare('SELECT id, settings_json FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment || !nativeEnabled(assignment)) return reply.code(404).send({ error: 'assignment_not_found' });
      const criteria = normalizeRubricCriteria(request.body);
      replaceAssignmentRubric(db, assignmentId, criteria, 'secondary');
      return { rubric: loadAssignmentRubric(db, assignmentId, 'secondary') };
    }
  );

  app.put('/api/native/assignments/:assignmentId/exam-rubric',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = db.prepare('SELECT id, settings_json FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment || !nativeEnabled(assignment)) return reply.code(404).send({ error: 'assignment_not_found' });
      const criteria = normalizeRubricCriteria(request.body, DEFAULT_AP_EXAM_RUBRIC);
      replaceAssignmentRubric(db, assignmentId, criteria, 'exam');
      return { rubric: loadAssignmentRubric(db, assignmentId, 'exam') };
    }
  );

  async function saveRubricScoresForKind(request, reply, rubricKind) {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const kind = normalizeRubricKind(rubricKind);
      const rubric = loadAssignmentRubric(db, pad.assignment_id, kind);
      const allowedCriteria = new Set(rubric.criteria.map((criterion) => criterion.id));
      if (!allowedCriteria.size) return reply.code(409).send({ error: 'rubric_not_configured' });
      const scores = Array.isArray(request.body?.scores) ? request.body.scores : [];
      if (!scores.length) return reply.code(400).send({ error: 'scores_required' });

      const upsert = db.prepare(`
        INSERT INTO native_rubric_scores (native_pad_id, criterion_id, selected_score, note, updated_by_teacher_id, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(native_pad_id, criterion_id) DO UPDATE SET
          selected_score = excluded.selected_score,
          note = excluded.note,
          updated_by_teacher_id = excluded.updated_by_teacher_id,
          updated_at = datetime('now')
      `);
      for (const item of scores) {
        const criterionId = requirePositiveInteger(item?.criterion_id, 'criterion_id');
        if (!allowedCriteria.has(criterionId)) return reply.code(400).send({ error: 'invalid_criterion_id' });
        const selectedScore = normalizeHalfScore(item?.selected_score, 'selected_score');
        const note = normalizeComment(item?.note);
        upsert.run(padId, criterionId, selectedScore, note, request.session.user.id);
      }
      logTeacherEvent(db, padId, request.session.user.id, kind === 'exam' ? 'exam_rubric_scores_saved' : 'rubric_scores_saved', { count: scores.length });
      // Fill teacher_score + delta on any hidden AI estimate for the marker profile.
      recordTeacherScores(db, { padId, rubricKind: kind, scores });
      return { scores: loadRubricScores(db, padId, kind) };
  }

  app.put('/api/native/pads/:padId/rubric-scores',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => saveRubricScoresForKind(request, reply, 'internal')
  );

  app.put('/api/native/pads/:padId/secondary-rubric-scores',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => saveRubricScoresForKind(request, reply, 'secondary')
  );

  app.put('/api/native/pads/:padId/exam-rubric-scores',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => saveRubricScoresForKind(request, reply, 'exam')
  );

  app.put('/api/native/pads/:padId/applied-feedback-table',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const tables = feedbackTablesForAssignment(db, pad.settings_json);
      const requested = String(request.body?.table || '').trim();
      const allowed = new Set([...tables.map((t) => t.id), 'all']);
      const applied = allowed.has(requested) ? requested : (tables[0]?.id ?? 'default');
      db.prepare('UPDATE native_pads SET applied_feedback_table = ? WHERE id = ?').run(applied, padId);
      return { applied_feedback_table: applied, feedback_options: feedbackOptionsForAssignment(db, pad.settings_json, applied) };
    }
  );

  app.get('/api/native/students/:studentId/profile',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });
      return { profile: loadStudentWritingProfile(db, studentId) };
    }
  );

  app.get('/api/native/backups/export',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const assignmentId = request.query?.assignment_id === undefined ? null : requirePositiveInteger(request.query.assignment_id, 'assignment_id');
      const pads = assignmentId
        ? db.prepare(`
          SELECT np.*,
                 s.display_name AS student_name,
                 s.username AS student_username,
                 a.title AS assignment_title,
                 a.type AS assignment_type,
                 c.name AS class_name
          FROM native_pads np
          JOIN students s ON s.id = np.student_id
          JOIN assignments a ON a.id = np.assignment_id
          JOIN classes c ON c.id = a.class_id
          WHERE np.assignment_id = ?
          ORDER BY c.name ASC, s.display_name ASC, np.id ASC
        `).all(assignmentId)
        : db.prepare(`
          SELECT np.*,
                 s.display_name AS student_name,
                 s.username AS student_username,
                 a.title AS assignment_title,
                 a.type AS assignment_type,
                 c.name AS class_name
          FROM native_pads np
          JOIN students s ON s.id = np.student_id
          JOIN assignments a ON a.id = np.assignment_id
          JOIN classes c ON c.id = a.class_id
          ORDER BY a.id ASC, c.name ASC, s.display_name ASC, np.id ASC
        `).all();
      const padIds = pads.map((pad) => pad.id);
      const placeholders = padIds.map(() => '?').join(',');
      const grouped = (rows, key) => {
        const map = new Map();
        for (const row of rows) {
          const list = map.get(row[key]) ?? [];
          list.push(row);
          map.set(row[key], list);
        }
        return map;
      };
      const annotations = padIds.length ? grouped(db.prepare(`
        SELECT *
        FROM native_annotations
        WHERE native_pad_id IN (${placeholders})
        ORDER BY native_pad_id ASC, created_at ASC, id ASC
      `).all(...padIds).map(publicAnnotation), 'native_pad_id') : new Map();
      const revisions = padIds.length ? grouped(db.prepare(`
        SELECT id, native_pad_id, reason, document_json, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id IN (${placeholders})
        ORDER BY native_pad_id ASC, id ASC
      `).all(...padIds).map((revision) => ({
        ...revision,
        document: JSON.parse(revision.document_json || EMPTY_DOC),
        document_json: undefined,
      })), 'native_pad_id') : new Map();
      const pasteEvents = padIds.length ? grouped(db.prepare(`
        SELECT id, native_pad_id, at, length, input_type
        FROM native_paste_events
        WHERE native_pad_id IN (${placeholders})
        ORDER BY native_pad_id ASC, at ASC, id ASC
      `).all(...padIds), 'native_pad_id') : new Map();
      const rubricScores = loadBackupRubricScores(db, padIds);

      const payload = {
        exported_at: new Date().toISOString(),
        scope: assignmentId ? { assignment_id: assignmentId } : { assignment_id: null },
        pad_count: pads.length,
        pads: pads.map((pad) => ({
          pad: publicNativePad(pad),
          student: { id: pad.student_id, display_name: pad.student_name, username: pad.student_username },
          assignment: { id: pad.assignment_id, title: pad.assignment_title, type: pad.assignment_type },
          class: { name: pad.class_name },
          annotations: annotations.get(pad.id) ?? [],
          revisions: revisions.get(pad.id) ?? [],
          paste_events: pasteEvents.get(pad.id) ?? [],
          rubric: {
            criteria: loadAssignmentRubric(db, pad.assignment_id).criteria,
            scores: rubricScores.get(pad.id) ?? [],
          },
          student_profile: loadStudentWritingProfile(db, pad.student_id),
        })),
      };
      const suffix = assignmentId ? `assignment-${assignmentId}` : 'all';
      return reply
        .header('Content-Disposition', `attachment; filename="inkheron-native-backup-${suffix}.json"`)
        .type('application/json')
        .send(JSON.stringify(payload, null, 2));
    }
  );

  app.post('/api/native/pads/:padId/import-text',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const plainText = normalizePlainText(request.body?.plain_text);
      if (!plainText.trim()) return reply.code(400).send({ error: 'plain_text_required' });
      const replaceCurrent = boolFlag(request.body?.replace_current);
      const updated = importTeacherText(db, pad, request.session.user.id, { plainText, replaceCurrent, source: 'paste' });
      return { pad: publicNativePad(updated), replace_current: replaceCurrent };
    }
  );

  app.post('/api/native/pads/:padId/import-file',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const parsed = await readTxtImport(request, reply);
      if (parsed.errorReply) return parsed.errorReply;
      if (!parsed.text.trim()) return reply.code(400).send({ error: 'plain_text_required' });
      const replaceCurrent = boolFlag(request.query?.replace_current);
      const updated = importTeacherText(db, pad, request.session.user.id, { plainText: parsed.text, replaceCurrent, source: parsed.filename });
      return { pad: publicNativePad(updated), replace_current: replaceCurrent, filename: parsed.filename };
    }
  );

  app.get('/api/native/assignments/:assignmentId/feedback',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const studentId = request.session.user.id;
      const { assignment, student, settings } = await resolveNativeAssignmentAndStudent(db, assignmentId, studentId);
      const pad = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (settings.feedback_release === 'batch' && !assignment.feedback_released_at
          && !pad.feedback_released_at
          && ['marked', 'green_pen_open', 'resubmitted'].includes(pad.state)) {
        return {
          pad: publicNativePad(pad),
          feedback_released: false,
          message: 'Your teacher has marked this. Feedback will open soon.',
        };
      }
      const annotations = db.prepare(`
        SELECT *
        FROM native_annotations
        WHERE native_pad_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(pad.id).map(publicAnnotation).map(studentSafeAnnotation);
      const revisions = db.prepare(`
        SELECT id, reason, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(pad.id);
      const rubric = loadAssignmentRubric(db, assignmentId);
      const secondaryRubric = loadAssignmentRubric(db, assignmentId, 'secondary');
      const examRubric = loadAssignmentRubric(db, assignmentId, 'exam');
      const rubricNames = Array.isArray(settings.rubric_names) ? settings.rubric_names : [];
      const classRow = db.prepare('SELECT c.name AS class_name FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = ?').get(assignmentId);
      const isApLang = isApLangClassName(classRow?.class_name);
      return {
        pad: publicNativePad(pad),
        assignment: {
          id: assignment.id,
          title: assignment.title,
          type: assignment.type,
          due_at: assignment.due_at ?? null,
          green_pen: settings.green_pen === true,
        },
        student: { id: student.id, display_name: student.display_name },
        annotations,
        revisions,
        feedback: studentSafeFeedback(loadFeedbackItems(db, pad.id)),
        rubric: {
          name: rubricNames[0] || 'Rubric 1',
          criteria: rubric.criteria,
          scores: loadRubricScores(db, pad.id),
        },
        secondary_rubric: {
          name: rubricNames[1] || 'Rubric 2',
          criteria: secondaryRubric.criteria,
          scores: loadRubricScores(db, pad.id, 'secondary'),
        },
        exam_rubric: {
          visible: isApLang,
          criteria: examRubric.criteria,
          scores: loadRubricScores(db, pad.id, 'exam'),
        },
        student_profile: loadStudentWritingProfile(db, student.id),
        rewrite_url: `/native/write/${assignment.id}`,
        feedback_released: true,
      };
    }
  );

function loadImplementationScore(db, padId) {
  const row = db.prepare(`
    SELECT rewrite_pad_id, original_pad_id, addressed_json, cosmetic_ratio, meaningful, summary, model, created_at
    FROM implementation_scores WHERE rewrite_pad_id = ?
  `).get(padId);
  if (!row) return null;
  let addressed = {};
  try { addressed = JSON.parse(row.addressed_json ?? '{}'); } catch { addressed = {}; }
  const codes = Array.isArray(addressed.codes) ? addressed.codes : [];
  const targets = Array.isArray(addressed.targets) ? addressed.targets : [];
  return {
    original_pad_id: row.original_pad_id,
    meaningful: row.meaningful === 1,
    cosmetic_ratio: row.cosmetic_ratio,
    summary: row.summary ?? '',
    codes_addressed: codes.filter((c) => c.addressed).length,
    codes_total: codes.length,
    targets_addressed: targets.filter((t) => t.addressed).length,
    targets_total: targets.length,
    inline_comments_addressed: Number(addressed.inline_comments_addressed ?? 0),
    inline_comments_total: Number(addressed.inline_comments_total ?? 0),
    created_at: row.created_at,
  };
}

  app.get('/api/native/pads/:padId/review',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const policy = ensurePolicy(db, padId, parseSettings(pad.settings_json));
      const annotations = db.prepare(`
        SELECT *
        FROM native_annotations
        WHERE native_pad_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(padId).map(publicAnnotation);
      const pasteEvents = db.prepare(`
        SELECT id, at, length, input_type
        FROM native_paste_events
        WHERE native_pad_id = ?
        ORDER BY at ASC, id ASC
      `).all(padId);
      const revisions = db.prepare(`
        SELECT id, reason, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(padId);
      const rubric = loadAssignmentRubric(db, pad.assignment_id);
      const secondaryRubric = loadAssignmentRubric(db, pad.assignment_id, 'secondary');
      const examRubric = loadAssignmentRubric(db, pad.assignment_id, 'exam');
      const settings = parseSettings(pad.settings_json);
      const rubricNames = Array.isArray(settings.rubric_names) ? settings.rubric_names : [];
      const isApLang = isApLangClassName(pad.class_name);
      const feedbackTables = feedbackTablesForAssignment(db, pad.settings_json);
      const appliedTable = pad.applied_feedback_table
        && (pad.applied_feedback_table === 'all' || feedbackTables.some((t) => t.id === pad.applied_feedback_table))
        ? pad.applied_feedback_table
        : (feedbackTables[0]?.id ?? 'default');
      return {
        pad: publicNativePad(pad),
        assignment: {
          id: pad.assignment_id,
          title: pad.assignment_title,
          type: pad.assignment_type,
          due_at: pad.due_at ?? null,
          essay_type: settings.essay_type ?? 'other',
          supervision: settings.supervision ?? 'in_class',
          feedback_release: settings.feedback_release === 'immediate' ? 'immediate' : 'batch',
          feedback_released_at: pad.feedback_released_at_assignment ?? null,
        },
        pad_feedback_released_at: pad.feedback_released_at ?? null,
        class: { id: pad.class_id, name: pad.class_name, is_ap_lang: isApLang },
        student: { id: pad.student_id, display_name: pad.student_name, username: pad.student_username },
        policy: publicPolicy(policy),
        annotations,
        paste_events: pasteEvents,
        revisions,
        comparison: comparisonForRevisions(revisions),
        rubric: {
          name: rubricNames[0] || 'Rubric 1',
          criteria: rubric.criteria,
          scores: loadRubricScores(db, padId),
        },
        secondary_rubric: {
          name: rubricNames[1] || 'Rubric 2',
          criteria: secondaryRubric.criteria,
          scores: loadRubricScores(db, padId, 'secondary'),
        },
        exam_rubric: {
          visible: isApLang,
          criteria: examRubric.criteria,
          scores: loadRubricScores(db, padId, 'exam'),
        },
        student_profile: loadStudentWritingProfile(db, pad.student_id),
        feedback: loadFeedbackItems(db, padId),
        suggestions: db.prepare(`
          SELECT id, document_version, start_offset, end_offset, quote, code, category, label, model, checker_json, status, created_at
          FROM ai_literacy_suggestions
          WHERE native_pad_id = ? AND status = 'pending'
          ORDER BY start_offset ASC, id ASC
        `).all(padId),
        feedback_tables: feedbackTables.map((t) => ({ id: t.id, title: t.title })),
        applied_feedback_table: appliedTable,
        feedback_options: feedbackOptionsForAssignment(db, pad.settings_json, appliedTable),
        // Green-pen verdict: present when this pad IS a rewrite that has been
        // scored, so the teacher reviewing a resubmit sees what was acted on.
        implementation_score: loadImplementationScore(db, padId),
      };
    }
  );

  // Teacher student-profile dashboard read model (OPUS_HANDOFF §3).
  app.get('/api/students/:studentId/writing-profile',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const payload = loadWritingProfileDashboard(db, studentId);
      if (!payload) return reply.code(404).send({ error: 'student_not_found' });
      return payload;
    }
  );

  // Parent report-card snippet: one warm paragraph, edited client-side, stored nowhere.
  app.post('/api/students/:studentId/report-snippet',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const result = await generateReportSnippet(db, { studentId });
      if (result.status !== 'ok') return reply.code(400).send({ error: result.message });
      return { snippet: result.snippet };
    }
  );

  app.post('/api/native/pads/:padId/annotations',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const annotation = normalizeAnnotationInput(request.body, pad);
      const result = db.prepare(`
        INSERT INTO native_annotations (
          native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        padId,
        request.session.user.id,
        annotation.type,
        annotation.start,
        annotation.end,
        annotation.selectedText,
        annotation.body,
        annotation.metadataJson,
        annotation.documentVersion
      );
      logTeacherEvent(db, padId, request.session.user.id, 'annotation_created', { type: annotation.type });
      const row = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(result.lastInsertRowid);
      syncLiteracyEvidence(db, pad, row);
      return reply.code(201).send({ annotation: publicAnnotation(row) });
    }
  );

  app.patch('/api/native/annotations/:annotationId',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const annotationId = requirePositiveInteger(request.params.annotationId, 'annotationId');
      const existing = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annotationId);
      if (!existing) return reply.code(404).send({ error: 'annotation_not_found' });
      const body = request.body?.body !== undefined ? normalizeComment(request.body.body) : existing.body;
      const resolved = request.body?.resolved !== undefined ? (request.body.resolved ? 1 : 0) : existing.resolved;
      const metadataJson = request.body?.metadata !== undefined ? normalizeMetadata(request.body.metadata) : existing.metadata_json;
      const previousKey = existing.type === 'literacy_code' ? normalizeLiteracyKey(existing) : null;
      db.prepare(`
        UPDATE native_annotations
        SET body = ?, resolved = ?, metadata_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(body, resolved, metadataJson, annotationId);
      // Record code changes with before/after so the calibration loop can learn
      // which codes the analysis confuses for this teacher.
      let recodeMeta = { annotation_id: annotationId };
      if (previousKey) {
        let newMeta = {};
        try { newMeta = JSON.parse(metadataJson || '{}'); } catch { newMeta = {}; }
        if (newMeta.code && newMeta.code !== previousKey.code) {
          recodeMeta = { annotation_id: annotationId, code_from: previousKey.code, code_to: newMeta.code, quote: (existing.selected_text ?? '').slice(0, 120) };
        }
      }
      logTeacherEvent(db, existing.native_pad_id, request.session.user.id, 'annotation_updated', recodeMeta);
      const row = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annotationId);
      const pad = loadTeacherNativePad(db, existing.native_pad_id);
      if (pad) {
        syncLiteracyEvidence(db, pad, row);
        if (previousKey) recomputeStudentLiteracyStat(db, pad.student_id, previousKey.code, previousKey.category, previousKey.label);
      }
      return { annotation: publicAnnotation(row) };
    }
  );

  app.delete('/api/native/annotations/:annotationId',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const annotationId = requirePositiveInteger(request.params.annotationId, 'annotationId');
      const existing = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annotationId);
      if (!existing) return reply.code(404).send({ error: 'annotation_not_found' });
      const pad = loadTeacherNativePad(db, existing.native_pad_id);
      // If this mark came from an AI suggestion, record the rejection so the
      // finding cannot come back on re-analysis and the calibration loop
      // learns from it.
      const linked = db.prepare('SELECT id FROM ai_literacy_suggestions WHERE annotation_id = ?').get(annotationId);
      if (linked) {
        db.prepare("UPDATE ai_literacy_suggestions SET status = 'rejected', annotation_id = NULL, resolved_at = datetime('now') WHERE id = ?").run(linked.id);
      }
      const key = existing.type === 'literacy_code' ? normalizeLiteracyKey(existing) : null;
      db.prepare('DELETE FROM native_annotations WHERE id = ?').run(annotationId);
      if (pad && key) recomputeStudentLiteracyStat(db, pad.student_id, key.code, key.category, key.label);
      logTeacherEvent(db, existing.native_pad_id, request.session.user.id, 'annotation_deleted', { annotation_id: annotationId, type: existing.type });
      return reply.code(204).send();
    }
  );

  // ── Strengths and targets (structured feedback items) ──────────────────

  app.get('/api/native/pads/:padId/feedback-items',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      return { feedback: loadFeedbackItems(db, padId) };
    }
  );

  app.post('/api/native/pads/:padId/feedback-items',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const item = normalizeFeedbackItemInput(request.body);
      const result = db.prepare(`
        INSERT INTO native_feedback_items (
          native_pad_id, kind, feedback_key, title, explanation, try_now_prompt, source, sort_order, created_by_teacher_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        padId, item.kind, item.feedbackKey, item.title, item.explanation,
        item.tryNowPrompt, item.source, item.sortOrder, request.session.user.id
      );
      logTeacherEvent(db, padId, request.session.user.id, 'feedback_item_added', { kind: item.kind });
      const row = db.prepare('SELECT * FROM native_feedback_items WHERE id = ?').get(result.lastInsertRowid);
      return reply.code(201).send({ item: publicFeedbackItem(row) });
    }
  );

  app.delete('/api/native/pads/:padId/feedback-items/:itemId',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const itemId = requirePositiveInteger(request.params.itemId, 'itemId');
      const existing = db.prepare('SELECT id FROM native_feedback_items WHERE id = ? AND native_pad_id = ?').get(itemId, padId);
      if (!existing) return reply.code(404).send({ error: 'feedback_item_not_found' });
      db.prepare('DELETE FROM native_feedback_items WHERE id = ?').run(itemId);
      return reply.code(204).send();
    }
  );

  // Student tick-off: a lightweight "I have looked at this / applied this"
  // marker on a target/strength, only while the pad is open for green pen
  // revision (that is the round the tick-off is meant to track).
  app.post('/api/native/pads/:padId/feedback-items/:itemId/toggle-check',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const itemId = requirePositiveInteger(request.params.itemId, 'itemId');
      const studentId = request.session.user.id;
      const pad = loadOwnedNativePad(db, padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      // Tick-off is allowed either on a legacy in-place green_pen_open pad, or
      // on a separate green-pen rewrite pad while the student is still writing
      // it. The feedback items live on the ORIGINAL pad, so a rewrite pad
      // targets its source.
      let targetPadId = padId;
      if (pad.state !== 'green_pen_open') {
        if (pad.rewrite_of_pad_id && pad.state === 'writing') {
          const original = db.prepare('SELECT id FROM native_pads WHERE id = ? AND student_id = ?').get(pad.rewrite_of_pad_id, studentId);
          if (!original) return reply.code(404).send({ error: 'original_not_found' });
          targetPadId = original.id;
        } else {
          return reply.code(409).send({ error: 'green_pen_not_open' });
        }
      }
      const item = db.prepare('SELECT * FROM native_feedback_items WHERE id = ? AND native_pad_id = ?').get(itemId, targetPadId);
      if (!item) return reply.code(404).send({ error: 'feedback_item_not_found' });
      const nextChecked = item.student_checked === 1 ? 0 : 1;
      db.prepare(`
        UPDATE native_feedback_items
        SET student_checked = ?, student_checked_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
        WHERE id = ?
      `).run(nextChecked, nextChecked, itemId);
      const updated = db.prepare('SELECT * FROM native_feedback_items WHERE id = ?').get(itemId);
      return { item: studentSafeFeedbackItem(publicFeedbackItem(updated)) };
    }
  );

  // ── Hidden AI literacy suggestions (teacher accept promotes to a mark) ──

  app.get('/api/native/pads/:padId/suggestions',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const status = ['pending', 'accepted', 'rejected'].includes(request.query?.status) ? request.query.status : 'pending';
      const suggestions = db.prepare(`
        SELECT id, document_version, start_offset, end_offset, quote, code, category, label, model, checker_json, status, created_at
        FROM ai_literacy_suggestions
        WHERE native_pad_id = ? AND status = ?
        ORDER BY start_offset ASC, id ASC
      `).all(padId, status);
      return { suggestions };
    }
  );

  app.post('/api/native/pads/:padId/suggestions/:suggestionId/accept',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const suggestionId = requirePositiveInteger(request.params.suggestionId, 'suggestionId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const suggestion = db.prepare('SELECT * FROM ai_literacy_suggestions WHERE id = ? AND native_pad_id = ?').get(suggestionId, padId);
      if (!suggestion) return reply.code(404).send({ error: 'suggestion_not_found' });
      if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'already_resolved' });

      // Promote the suggestion into a real literacy_code annotation so it
      // becomes visible feedback and feeds the student profile.
      const metadata = normalizeMetadata({
        code: suggestion.code,
        category: suggestion.category,
        label: suggestion.label || suggestion.code,
        source: 'ai_accepted',
        suggestion_id: suggestion.id,
      });
      const annResult = db.prepare(`
        INSERT INTO native_annotations (
          native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version
        ) VALUES (?, ?, 'literacy_code', ?, ?, ?, '', ?, ?)
      `).run(
        padId, request.session.user.id, suggestion.start_offset, suggestion.end_offset,
        (suggestion.quote ?? '').slice(0, 2000), metadata, suggestion.document_version
      );
      const annotationRow = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annResult.lastInsertRowid);
      syncLiteracyEvidence(db, pad, annotationRow);
      db.prepare("UPDATE ai_literacy_suggestions SET status = 'accepted', annotation_id = ?, resolved_at = datetime('now') WHERE id = ?").run(annotationRow.id, suggestionId);
      logTeacherEvent(db, padId, request.session.user.id, 'suggestion_accepted', { suggestion_id: suggestionId, code: suggestion.code });
      return reply.code(201).send({ annotation: publicAnnotation(annotationRow) });
    }
  );

  app.post('/api/native/pads/:padId/suggestions/:suggestionId/reject',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const suggestionId = requirePositiveInteger(request.params.suggestionId, 'suggestionId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const suggestion = db.prepare('SELECT id, status FROM ai_literacy_suggestions WHERE id = ? AND native_pad_id = ?').get(suggestionId, padId);
      if (!suggestion) return reply.code(404).send({ error: 'suggestion_not_found' });
      if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'already_resolved' });
      db.prepare("UPDATE ai_literacy_suggestions SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(suggestionId);
      logTeacherEvent(db, padId, request.session.user.id, 'suggestion_rejected', { suggestion_id: suggestionId });
      return reply.code(204).send();
    }
  );

  // Disagree works on both pending and (auto-)accepted suggestions. For an
  // accepted one it retracts the promoted annotation, which cascades the
  // evidence row away, then recomputes the profile stat for that code.
  app.post('/api/native/pads/:padId/suggestions/:suggestionId/disagree',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const suggestionId = requirePositiveInteger(request.params.suggestionId, 'suggestionId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const suggestion = db.prepare('SELECT * FROM ai_literacy_suggestions WHERE id = ? AND native_pad_id = ?').get(suggestionId, padId);
      if (!suggestion) return reply.code(404).send({ error: 'suggestion_not_found' });
      if (suggestion.status === 'rejected') return reply.code(409).send({ error: 'already_resolved' });

      if (suggestion.status === 'accepted' && suggestion.annotation_id) {
        const annotation = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(suggestion.annotation_id);
        if (annotation) {
          const key = normalizeLiteracyKey(annotation);
          db.prepare('DELETE FROM native_annotations WHERE id = ?').run(annotation.id);
          recomputeStudentLiteracyStat(db, pad.student_id, key.code, key.category, key.label);
        }
      }
      db.prepare("UPDATE ai_literacy_suggestions SET status = 'rejected', annotation_id = NULL, resolved_at = datetime('now') WHERE id = ?").run(suggestionId);
      logTeacherEvent(db, padId, request.session.user.id, 'suggestion_disagreed', { suggestion_id: suggestionId, code: suggestion.code });
      return reply.code(204).send();
    }
  );

  // ── Hidden AI strength/target suggestions (teacher accept promotes to a feedback item) ──

  app.get('/api/native/pads/:padId/feedback-suggestions',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const status = ['pending', 'accepted', 'rejected'].includes(request.query?.status) ? request.query.status : 'pending';
      const suggestions = db.prepare(`
        SELECT id, kind, title, explanation, try_now_prompt, model, checker_json, status, feedback_item_id, created_at
        FROM ai_feedback_item_suggestions
        WHERE native_pad_id = ? AND status = ?
        ORDER BY kind ASC, id ASC
      `).all(padId, status);
      return { suggestions };
    }
  );

  app.post('/api/native/pads/:padId/feedback-suggestions/:suggestionId/accept',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const suggestionId = requirePositiveInteger(request.params.suggestionId, 'suggestionId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const suggestion = db.prepare('SELECT * FROM ai_feedback_item_suggestions WHERE id = ? AND native_pad_id = ?').get(suggestionId, padId);
      if (!suggestion) return reply.code(404).send({ error: 'suggestion_not_found' });
      if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'already_resolved' });

      const result = db.prepare(`
        INSERT INTO native_feedback_items (native_pad_id, kind, title, explanation, try_now_prompt, source)
        VALUES (?, ?, ?, ?, ?, 'ai')
      `).run(padId, suggestion.kind, suggestion.title, suggestion.explanation, suggestion.try_now_prompt);
      const itemRow = db.prepare('SELECT * FROM native_feedback_items WHERE id = ?').get(result.lastInsertRowid);
      db.prepare("UPDATE ai_feedback_item_suggestions SET status = 'accepted', feedback_item_id = ?, resolved_at = datetime('now') WHERE id = ?")
        .run(itemRow.id, suggestionId);
      logTeacherEvent(db, padId, request.session.user.id, 'feedback_suggestion_accepted', { suggestion_id: suggestionId, kind: suggestion.kind });
      return reply.code(201).send({ item: publicFeedbackItem(itemRow) });
    }
  );

  app.post('/api/native/pads/:padId/feedback-suggestions/:suggestionId/reject',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const suggestionId = requirePositiveInteger(request.params.suggestionId, 'suggestionId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const suggestion = db.prepare('SELECT id, status FROM ai_feedback_item_suggestions WHERE id = ? AND native_pad_id = ?').get(suggestionId, padId);
      if (!suggestion) return reply.code(404).send({ error: 'suggestion_not_found' });
      if (suggestion.status !== 'pending') return reply.code(409).send({ error: 'already_resolved' });
      db.prepare("UPDATE ai_feedback_item_suggestions SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(suggestionId);
      logTeacherEvent(db, padId, request.session.user.id, 'feedback_suggestion_rejected', { suggestion_id: suggestionId });
      return reply.code(204).send();
    }
  );

  // Green-pen context for a rewrite pad: the original's marks and feedback,
  // category-only (never the fix), rendered inside the student's editor.
  app.get('/api/native/pads/:padId/greenpen-context',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (!pad.rewrite_of_pad_id) return reply.code(404).send({ error: 'not_a_rewrite' });
      const original = db.prepare('SELECT * FROM native_pads WHERE id = ? AND student_id = ?')
        .get(pad.rewrite_of_pad_id, request.session.user.id);
      if (!original) return reply.code(404).send({ error: 'original_not_found' });
      const text = original.plain_text ?? '';
      const marks = db.prepare(`
        SELECT id, start_offset, end_offset, selected_text, body, metadata_json
        FROM native_annotations
        WHERE native_pad_id = ? AND type = 'literacy_code'
        ORDER BY start_offset ASC, id ASC
      `).all(original.id).map((row) => {
        let meta = {};
        try { meta = JSON.parse(row.metadata_json || '{}'); } catch { meta = {}; }
        return {
          id: row.id,
          quote: row.selected_text ?? '',
          code: meta.code || row.body || '',
          category: meta.category || 'other',
          label: meta.label || meta.code || row.body || '',
          context_before: text.slice(Math.max(0, (row.start_offset ?? 0) - 24), row.start_offset ?? 0),
          context_after: text.slice(row.end_offset ?? 0, (row.end_offset ?? 0) + 24),
        };
      });
      const comments = db.prepare(`
        SELECT type, selected_text, body FROM native_annotations
        WHERE native_pad_id = ? AND type IN ('inline_comment', 'general_comment')
        ORDER BY id ASC
      `).all(original.id).map((row) => ({ kind: row.type, quote: row.selected_text ?? '', body: row.body ?? '' }));
      return { original_pad_id: original.id, feedback: studentSafeFeedback(loadFeedbackItems(db, original.id)), marks, comments };
    }
  );

  // The original assignment's instructions and reference, opened in a new
  // tab from the green-pen panel (the rewrite view gives its left panel to
  // the editor, so the source material lives here).
  // Send feedback to ONE student before the class-wide release (batch mode).
  app.post('/api/native/pads/:padId/release-feedback',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (!['marked', 'green_pen_open', 'resubmitted'].includes(pad.state)) {
        return reply.code(409).send({ error: 'not_marked_yet' });
      }
      db.prepare("UPDATE native_pads SET feedback_released_at = datetime('now') WHERE id = ?").run(padId);
      logTeacherEvent(db, padId, request.session.user.id, 'pad_feedback_released', {});
      // Releasing to this student also spins up (or extends) the separate
      // green-pen rewrite assignment so they have somewhere to do the rewrite.
      const rewrite = ensureGreenpenRewriteForStudents(db, pad.assignment_id, request.session.user.id, [pad.student_id]);
      return {
        released: true,
        rewrite_assignment: rewrite?.assignment
          ? { id: rewrite.assignment.id, title: rewrite.assignment.title, created: rewrite.created }
          : null,
      };
    }
  );

  app.get('/native/greenpen-source/:padId',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad || !pad.rewrite_of_pad_id) return reply.code(404).send({ error: 'pad_not_found' });
      const original = db.prepare('SELECT assignment_id FROM native_pads WHERE id = ? AND student_id = ?')
        .get(pad.rewrite_of_pad_id, request.session.user.id);
      if (!original) return reply.code(404).send({ error: 'original_not_found' });
      const assignment = db.prepare('SELECT id, title, settings_json FROM assignments WHERE id = ?').get(original.assignment_id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });
      const settings = parseSettings(assignment.settings_json);
      let hasPdf = false;
      try { await fs.promises.access(path.join(PASSAGES_DIR, `${assignment.id}.pdf`)); hasPdf = true; } catch (_) {}
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return reply.type('text/html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(assignment.title)} - task and reference</title>
<link rel="icon" href="/assets/InkHeron%20Logo.png">
<link rel="stylesheet" href="/assets/styles.css">
<style>
body{margin:0;font-family:var(--font);background:#f6f5f0;color:#1f2a24}
.wrap{max-width:860px;margin:0 auto;padding:26px 22px 70px}
h1{font-family:var(--serif);font-size:22px;margin:0 0 4px}
.sub{color:#657268;font-size:13px;margin:0 0 18px}
.card{background:#fff;border:1px solid #d8d4c8;border-radius:10px;padding:18px 20px;margin-bottom:16px;box-shadow:0 5px 18px rgba(31,42,36,.06)}
.card h2{font-size:14px;margin:0 0 8px}
.card .text{white-space:pre-wrap;font-size:15px;line-height:1.7}
.pdf{width:100%;height:80vh;border:1px solid #d8d4c8;border-radius:10px}
</style>
</head>
<body><div class="wrap">
<h1>${esc(assignment.title)}</h1>
<p class="sub">Original task and reference. Your rewrite stays open in the other tab.</p>
<div class="card"><h2>Task</h2><div class="text">${esc(settings.prompt || 'No prompt added.')}</div></div>
${settings.passage_text ? `<div class="card"><h2>Reference</h2><div class="text">${esc(settings.passage_text)}</div></div>` : ''}
${hasPdf ? `<object class="pdf" data="/api/assignments/${assignment.id}/passage-pdf" type="application/pdf">PDF reference: <a href="/api/assignments/${assignment.id}/passage-pdf">open it here</a>.</object>` : ''}
</div></body></html>`);
    }
  );

  app.get('/native/write/:assignmentId',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const studentId = request.session.user.id;
      const { assignment, student, settings } = await resolveNativeAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = provisionNativePad(db, { assignment, student });
      if (pad.state === 'green_pen_open' && settings.feedback_release === 'batch' && !assignment.feedback_released_at) {
        return reply.code(403).send({ error: 'feedback_not_released', message: 'Your teacher has marked this. Feedback will open soon.' });
      }
      applyDueDateLock(db, pad, assignment);
      const policy = ensurePolicy(db, pad.id, settings);

      let passagePdf = false;
      try {
        await fs.promises.access(path.join(PASSAGES_DIR, `${assignmentId}.pdf`));
        passagePdf = true;
      } catch (_) {}
      const rawReturnUrl = String(request.query?.return ?? '');
      const testReturnUrl = rawReturnUrl.startsWith(`/native/test/${assignmentId}`) ? rawReturnUrl : '';

      return reply.type('text/html').send(renderNativeWriteView({
        title: assignment.title,
        assignmentId,
        pad: publicNativePad(pad),
        policy: publicPolicy(policy),
        csrfToken: request.session.csrfToken ?? '',
        dueAt: assignment.due_at,
        spellcheck: settings.spellcheck !== false,
        prompt: settings.prompt || '',
        passageText: settings.passage_text || '',
        passagePdf,
        greenpen: Boolean(pad.rewrite_of_pad_id),
        testReturnUrl,
      }));
    }
  );
}
