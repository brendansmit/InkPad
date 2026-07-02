/**
 * Green-pen implementation scorer (phase D2).
 *
 * Judges whether a student's rewrite actually acted on the feedback, versus
 * making cosmetic edits. This is the highest-value analysis feature: it turns
 * the green-pen loop into a measured revision skill, not just a second draft.
 *
 * ============================ SEAM FOR FABLE ============================
 * This is a documented STUB. Phase D2 fills the body. See FABLE_HANDOFF.md.
 *
 * Contract:
 *   input  : db, { rewritePadId }
 *   reads  : the rewrite native_pad (plain_text) and its rewrite_of_pad_id;
 *            the original pad's plain_text, its native_annotations
 *            (literacy_code + inline_comment) and native_feedback_items
 *            (targets). A deterministic text diff plus an AI judgement.
 *   does   : decide per code / per target / per inline comment whether it was
 *            addressed; estimate cosmetic vs meaningful revision.
 *   writes : one row into implementation_scores (rewrite_pad_id UNIQUE,
 *            original_pad_id, student_id, addressed_json, cosmetic_ratio,
 *            meaningful, summary, model). Upsert by rewrite_pad_id.
 *   returns: { status } — never throws to the caller.
 * =======================================================================
 */
export async function scoreRewrite(db, { rewritePadId } = {}) {
  // STUB: writes nothing yet. Fable implements phase D2 here.
  void db; void rewritePadId;
  return { status: 'not_implemented' };
}
