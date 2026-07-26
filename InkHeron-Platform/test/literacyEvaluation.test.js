import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLiteracyPredictions,
  evaluateStudentHoldout,
  splitGoldByStudent,
} from '../src/services/literacyEvaluation.js';

const GOLD = [
  { 'Annotation ID': 'a1', Student: 's1', 'Correct literacy code': 'PREP-WRONG', 'Grammar family': 'Prepositions' },
  { 'Annotation ID': 'a2', Student: 's1', 'Correct literacy code': 'PREP-MISSING', 'Grammar family': 'Prepositions' },
  { 'Annotation ID': 'a3', Student: 's2', 'Correct literacy code': 'ARTICLE-MISSING', 'Grammar family': 'Articles' },
  { 'Annotation ID': 'a4', Student: 's3', 'Correct literacy code': 'SV-AGREEMENT', 'Grammar family': 'Agreement' },
  { 'Annotation ID': 'a5', Student: 's4', 'Correct literacy code': 'WORD-CLASS', 'Grammar family': 'Word class/derivation' },
];

test('student holdout never splits one student across train and holdout', () => {
  const split = splitGoldByStudent(GOLD);
  const trainStudents = new Set(split.train.map((row) => row.studentId));
  const holdoutStudents = new Set(split.holdout.map((row) => row.studentId));
  for (const student of trainStudents) assert.equal(holdoutStudents.has(student), false);
  assert.equal(split.train.length + split.holdout.length, GOLD.length);
});

test('evaluation reports recall, code accuracy and family breakdowns', () => {
  const report = evaluateLiteracyPredictions(GOLD, [
    { 'Annotation ID': 'a1', 'Predicted literacy code': 'PREP-WRONG' },
    { 'Annotation ID': 'a2', 'Predicted literacy code': 'PREP-EXTRA' },
    { 'Annotation ID': 'a3', 'Predicted literacy code': 'ARTICLE-MISSING' },
    { 'Annotation ID': 'extra', 'Predicted literacy code': 'Sp' },
  ]);
  assert.deepEqual(report.overall, {
    gold: 5, predicted: 3, exact: 2, wrong: 1, missing: 2,
    coverage: 0.6, recall: 0.4, codeSelectionAccuracy: 0.6667,
  });
  assert.equal(report.byFamily.Prepositions.gold, 2);
  assert.equal(report.byFamily.Prepositions.codeSelectionAccuracy, 0.5);
  assert.equal(report.extraPredictions, 1);
});

test('student holdout report includes separate train and holdout metrics', () => {
  const predictions = GOLD.map((row) => ({ 'Annotation ID': row['Annotation ID'], 'Predicted literacy code': row['Correct literacy code'] }));
  const report = evaluateStudentHoldout(GOLD, predictions);
  assert.equal(report.overall.overall.recall, 1);
  assert.equal(report.train.overall.recall, 1);
  assert.equal(report.holdout.overall.recall, 1);
});
