import { getLiteracyCode } from './literacyCodeRegistry.js';

function firstValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
}

export function normalizeGoldRow(row) {
  const id = firstValue(row, ['id', 'annotation_id', 'Annotation ID']);
  const studentId = firstValue(row, ['studentId', 'student_id', 'student', 'Student']);
  const code = firstValue(row, ['code', 'gold_code', 'Correct literacy code', 'Literacy code only']);
  const family = firstValue(row, ['family', 'Grammar family']) || getLiteracyCode(code)?.family || 'Unknown';
  if (!id || !studentId || !code) return null;
  return { id, studentId, code, family };
}

export function normalizePredictionRow(row) {
  const id = firstValue(row, ['id', 'annotation_id', 'Annotation ID']);
  const code = firstValue(row, ['code', 'predicted_code', 'Predicted literacy code']);
  if (!id || !code) return null;
  return { id, code };
}

function stableStudentBucket(studentId) {
  let hash = 2166136261;
  for (const char of String(studentId)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 5;
}

export function splitGoldByStudent(rows) {
  const normalized = rows.map(normalizeGoldRow).filter(Boolean);
  const holdoutStudents = new Set(
    [...new Set(normalized.map((row) => row.studentId))].filter((studentId) => stableStudentBucket(studentId) === 0),
  );
  if (holdoutStudents.size === 0 && normalized.length) holdoutStudents.add(normalized[0].studentId);
  return {
    train: normalized.filter((row) => !holdoutStudents.has(row.studentId)),
    holdout: normalized.filter((row) => holdoutStudents.has(row.studentId)),
    holdoutStudents,
  };
}

function rounded(value) {
  return Math.round(value * 10000) / 10000;
}

function metricRows(gold, predictionById) {
  const result = { gold: gold.length, predicted: 0, exact: 0, wrong: 0, missing: 0 };
  for (const row of gold) {
    const predicted = predictionById.get(row.id);
    if (!predicted) { result.missing += 1; continue; }
    result.predicted += 1;
    if (predicted.code === row.code) result.exact += 1;
    else result.wrong += 1;
  }
  result.coverage = result.gold ? rounded(result.predicted / result.gold) : 0;
  result.recall = result.gold ? rounded(result.exact / result.gold) : 0;
  result.codeSelectionAccuracy = result.predicted ? rounded(result.exact / result.predicted) : 0;
  return result;
}

export function evaluateLiteracyPredictions(goldRows, predictionRows) {
  const gold = goldRows.map(normalizeGoldRow).filter(Boolean);
  const predictions = predictionRows.map(normalizePredictionRow).filter(Boolean);
  const predictionById = new Map();
  for (const prediction of predictions) {
    if (predictionById.has(prediction.id)) throw new Error(`Duplicate prediction id: ${prediction.id}`);
    predictionById.set(prediction.id, prediction);
  }
  const goldIds = new Set(gold.map((row) => row.id));
  const byFamily = {};
  for (const family of [...new Set(gold.map((row) => row.family))].sort()) {
    byFamily[family] = metricRows(gold.filter((row) => row.family === family), predictionById);
  }
  return {
    overall: metricRows(gold, predictionById),
    byFamily,
    extraPredictions: predictions.filter((prediction) => !goldIds.has(prediction.id)).length,
  };
}

export function evaluateStudentHoldout(goldRows, predictionRows) {
  const split = splitGoldByStudent(goldRows);
  return {
    students: {
      train: new Set(split.train.map((row) => row.studentId)).size,
      holdout: split.holdoutStudents.size,
    },
    train: evaluateLiteracyPredictions(split.train, predictionRows),
    holdout: evaluateLiteracyPredictions(split.holdout, predictionRows),
    overall: evaluateLiteracyPredictions([...split.train, ...split.holdout], predictionRows),
  };
}
