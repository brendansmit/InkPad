/**
 * Checker pass for the literacy coder (CLAUDE.md §8).
 *
 * A DIFFERENT, cheaper model family from the Doer, used to validate the
 * Doer's findings against the source text. The Checker only FLAGS; it never
 * rewrites or invents findings.
 *
 * ============================ SEAM FOR FABLE ============================
 * This is a documented STUB. Phase B fills the body. See FABLE_HANDOFF.md.
 *
 * Contract:
 *   input  : db, { padPlainText, findings }
 *            findings: [{ start_offset, end_offset, quote, code, category }]
 *   does   : call callChat with a cheaper, different-family intent (e.g.
 *            'google gemini flash' or 'deepseek') to confirm each quote is
 *            copied verbatim from padPlainText and the code is defensible.
 *   returns: the same findings, each with a `checker` field:
 *            { verbatim: boolean, confidence: number, flag: string|null }.
 *            Callers drop findings where verbatim is false.
 * =======================================================================
 */
export async function verifyFindings(db, { padPlainText, findings } = {}) {
  // STUB: pass findings through with a null verdict so nothing is dropped.
  // Fable implements the second-model verification here.
  void db; void padPlainText;
  return (findings ?? []).map((finding) => ({
    ...finding,
    checker: { verbatim: null, confidence: null, flag: null },
  }));
}
