import fs from 'node:fs';
import { evaluateStudentHoldout } from '../src/services/literacyEvaluation.js';

function readRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`${filePath} must contain a JSON array`);
    return parsed;
  }
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

const [goldPath, predictionPath] = process.argv.slice(2);
if (!goldPath || !predictionPath) {
  console.error('Usage: node scripts/evaluate-literacy.mjs GOLD.jsonl PREDICTIONS.jsonl');
  process.exitCode = 2;
} else {
  const report = evaluateStudentHoldout(readRows(goldPath), readRows(predictionPath));
  console.log(JSON.stringify(report, null, 2));
}
