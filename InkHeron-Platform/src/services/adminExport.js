/**
 * One-click export of an assignment's scores to the teacher's admin
 * gradebook app (grade-importer, ../grade-importer/). Uses that app's
 * /api/sync endpoint, the only route it gates with the export key, and
 * pulls the existing assignments/students first so a brand-new assignment
 * never collides with an unrelated row in the destination's own id space.
 *
 * The payload sent onward is names and numbers only: no AI wording, no
 * codes, no model names, nothing about how marking happened.
 */
import { readRawSetting, readAdminExportUrl } from './settingsStore.js';

function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Mirrors grade-importer's own add_student id scheme (app.py) so a student
// created here matches one created there by the teacher, without asking
// that app to hand back an id first.
function studentIdFor(className, displayName) {
  const prefix = String(className ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
  const suffix = String(displayName ?? '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 8);
  return `${prefix}-${suffix}`;
}

function friendlyError(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

async function pullSyncData(baseUrl, key, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/sync?since=0`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    throw friendlyError('Could not reach the admin gradebook.');
  }
  if (res.status === 401) throw friendlyError('The admin gradebook rejected the export key.');
  if (!res.ok) throw friendlyError('The admin gradebook could not be reached.');
  return res.json();
}

async function pushSyncData(baseUrl, key, fetchImpl, payload) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw friendlyError('Could not reach the admin gradebook.');
  }
  if (res.status === 401) throw friendlyError('The admin gradebook rejected the export key.');
  if (!res.ok) throw friendlyError('The admin gradebook could not save the export.');
  return res.json();
}

/**
 * @param {object} params
 * @param {string} params.className
 * @param {string} params.assignmentTitle
 * @param {number} params.scoreMax
 * @param {Array<{display_name: string, score: number|null}>} params.rows - already filtered to real (non demo/ghost) students
 */
export async function exportAssignmentToAdmin(db, { className, assignmentTitle, scoreMax, rows } = {}, { fetchImpl = fetch } = {}) {
  const scored = (rows ?? []).filter((row) => row.score !== null && row.score !== undefined);
  if (!scored.length) throw friendlyError('No scored students to export yet.');

  const key = readRawSetting(db, 'admin_export_key');
  if (!key) throw friendlyError('Set an admin export key in Settings first.');
  const baseUrl = readAdminExportUrl(db);

  const existing = await pullSyncData(baseUrl, key, fetchImpl);
  const existingAssignments = Array.isArray(existing.assignments) ? existing.assignments : [];
  const existingStudents = Array.isArray(existing.students) ? existing.students : [];

  const match = existingAssignments.find((a) => a.name === assignmentTitle && a.class_filter === className);
  const assignmentId = match ? match.id : existingAssignments.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;

  const studentIdByName = new Map(existingStudents.map((s) => [normalizeName(s.english_name), s.student_id]));
  const now = Date.now() / 1000;

  const newStudents = [];
  const scores = [];
  for (const row of scored) {
    const nameKey = normalizeName(row.display_name);
    let studentId = studentIdByName.get(nameKey);
    if (!studentId) {
      studentId = studentIdFor(className, row.display_name);
      studentIdByName.set(nameKey, studentId);
      newStudents.push({
        student_id: studentId,
        english_name: row.display_name,
        task_class: className,
        admin_class: className,
        last_modified: now,
      });
    }
    scores.push({ assignment_id: assignmentId, student_id: studentId, score: row.score, last_modified: now });
  }

  await pushSyncData(baseUrl, key, fetchImpl, {
    students: newStudents,
    assignments: [{
      id: assignmentId,
      name: assignmentTitle,
      class_filter: className,
      sections: [],
      score_total: scoreMax,
      last_modified: now,
    }],
    scores,
  });

  return { exported: scores.length };
}
