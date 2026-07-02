/**
 * Student writing-profile summariser (phase C).
 *
 * Turns the accumulated evidence for one student into the human-readable
 * profile fields the student and teacher see: a recurring-issues summary, a
 * voice/style summary, and a prioritised target list.
 *
 * ============================ SEAM FOR FABLE ============================
 * This is a documented STUB. Phase C fills the body. See FABLE_HANDOFF.md.
 *
 * Contract:
 *   input  : db, { studentId }
 *   reads  : student_literacy_issue_stats, student_literacy_evidence,
 *            native_feedback_items (targets), score_snapshots for the student.
 *   does   : Doer + Checker summarise the recurring problems, the voice/style
 *            patterns, and the top targets to work on before exams.
 *   writes : UPDATE student_writing_profiles SET writing_summary, voice_summary,
 *            targets_json (JSON array of {title, explanation}) WHERE student_id.
 *   returns: { status } — never throws to the caller.
 * =======================================================================
 */
export async function generateProfileSummary(db, { studentId } = {}) {
  // STUB: leaves the profile summary fields untouched. Fable implements phase C.
  void db; void studentId;
  return { status: 'not_implemented' };
}
