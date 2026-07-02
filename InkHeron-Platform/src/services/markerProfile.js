/**
 * Marker-preference profile (phase D3).
 *
 * The AI privately estimates a rubric score BEFORE the teacher marks. The
 * estimate is hidden so it cannot anchor the teacher. When the teacher's own
 * score lands, the delta is recorded, and over time the deltas describe how
 * this teacher marks relative to the model.
 */

/**
 * ============================ SEAM FOR FABLE ============================
 * STUB. Phase D3 fills the body. See FABLE_HANDOFF.md.
 *
 * Contract:
 *   input  : db, { padId }
 *   reads  : native_pads.plain_text, the assignment's rubric criteria/bands
 *            (assignment_rubric_criteria + bands) for each rubric_kind.
 *   does   : Doer + Checker estimate a score per criterion.
 *   writes : one row per (pad, rubric_kind, criterion) into ai_grade_estimates
 *            with ai_score, model, rationale, teacher_score/delta left NULL.
 *            Run at submit time, before the teacher marks. Upsert-safe:
 *            clear prior estimate rows for the pad first.
 *   returns: { status } — never throws to the caller.
 * =======================================================================
 */
export async function estimateRubric(db, { padId } = {}) {
  // STUB: writes no estimate yet. Fable implements phase D3 here.
  void db; void padId;
  return { status: 'not_implemented' };
}

/**
 * Deterministic (non-AI) half of the marker profile: when the teacher saves
 * their own scores, fill teacher_score and delta on any matching hidden AI
 * estimate rows for this pad + rubric_kind. Safe to call even when no AI
 * estimate exists (it simply updates nothing). Implemented here, not a stub.
 *
 * scores: [{ criterion_id, selected_score }]
 */
export function recordTeacherScores(db, { padId, rubricKind = 'internal', scores = [] } = {}) {
  if (!padId || !Array.isArray(scores) || !scores.length) return { updated: 0 };
  const update = db.prepare(`
    UPDATE ai_grade_estimates
    SET teacher_score = ?,
        delta = CASE WHEN ai_score IS NULL THEN NULL ELSE (ai_score - ?) END,
        scored_at = datetime('now')
    WHERE native_pad_id = ? AND rubric_kind = ? AND criterion_id = ?
  `);
  let updated = 0;
  for (const item of scores) {
    const criterionId = Number(item?.criterion_id);
    const teacherScore = Number(item?.selected_score);
    if (!Number.isInteger(criterionId) || !Number.isFinite(teacherScore)) continue;
    const result = update.run(teacherScore, teacherScore, padId, rubricKind, criterionId);
    updated += result.changes ?? 0;
  }
  return { updated };
}
