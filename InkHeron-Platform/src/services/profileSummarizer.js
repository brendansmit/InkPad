/**
 * Student writing-profile summariser (phase C).
 *
 * Turns the accumulated evidence for one student into the human-readable
 * profile fields the student and teacher see: a recurring-issues summary, a
 * voice/style summary, and a prioritised target list. The voice summary is
 * grounded in the deterministic stylometric fingerprint (styleMetrics.js) so
 * the AI can only describe patterns the numbers actually show.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent } from './settingsStore.js';
import { aggregateStyleProfile } from './styleMetrics.js';


const CHECKER_INTENT = 'google gemini flash';
const MAX_TARGETS = 4;

const DOER_SYSTEM_PROMPT = `You write a short profile summary for one English learner (L2) student in an AP Language and Composition course, based only on the evidence given. This is formative coaching, not a grade. Grammar and spelling issues are practice targets, never punishment.

The course has three exam essay types and each tends to pull the voice in a different direction. These are tendencies, not rules; the student's teacher decides what good looks like, so describe, never prescribe:
- synthesis: builds the student's own argument from provided sources, so it usually leans toward quoted evidence and attribution verbs (argues, claims, contends) with the student's own position staying visible.
- rhetorical_analysis: analyses how another writer persuades, so it usually leans toward an analytical register with rhetoric terms (tone, diction, appeals, audience) and verbs of effect (conveys, evokes, emphasizes).
- argument: defends the student's own position, so it usually leans toward a claim-driven voice, often with concession markers (admittedly, granted, critics) and controlled hedging.
The stylometric fingerprint includes direct measures of these registers (attribution_verbs, rhetoric_terms, concession_markers, quoted_evidence, hedges, boosters, first/second person, contractions, nominalizations, all per 100 words). "by_essay_type" gives the fingerprint separately per type. When the data covers more than one type, describe how the student's voice shifts (or does not shift) between types, in neutral observational terms (e.g. their rhetorical analysis reads much like their argument essays, with few rhetoric terms and many claim markers). Point out where a fingerprint sits far from where that essay type usually leans, as an observation to think about, not a fault.

Ground every claim in the numbers you are given. "writing_summary" describes recurring TECHNICAL issues using the per-100-words rates provided, not raw counts (essays differ in length, so counts alone mislead). "voice_summary" describes style and voice patterns using ONLY the stylometric numbers given (e.g. long flowing sentences with heavy coordination, an I-heavy personal register, few transitions), including the per-type register shifts above when the data allows — never invent a pattern the numbers do not support. "targets" is a prioritised, exam-focused coaching list, at most 4 items, most important first; tie a target to the essay type it matters for when the evidence is type-specific.

Write like a friendly teacher talking directly to the student, not like a report. Use "you", use contractions, keep sentences short. Low C1 level. No em dashes, no en dashes, no Oxford commas. Metric units only if any unit is mentioned. Target titles stay short, 3 to 6 words.

Example of the tone shift, same finding:
Too stiff: title "Improve verb tense consistency", explanation "The essay demonstrates inconsistent temporal marking."
Wanted: title "Keep your tenses steady", explanation "You start in the past then jump to the present in the same sentence. Pick the time frame first, then keep every verb in it."

Return ONLY JSON:
{"writing_summary": "2 to 4 sentences", "voice_summary": "2 to 3 sentences", "targets": [{"title": "...", "explanation": "..."}]}`;

const CHECKER_SYSTEM_PROMPT = `You verify a student profile summary against the evidence it was built from. You NEVER add or rewrite content. For each of the three fields "writing_summary", "voice_summary" and "targets", judge:
- "supported": is every claim in that field actually backed by the evidence given?
- "confidence": 0 to 1, how sure you are.

Return ONLY JSON:
{"writing_summary": {"supported": true, "confidence": 0.9}, "voice_summary": {"supported": true, "confidence": 0.9}, "targets": {"supported": true, "confidence": 0.9}}`;

function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function parseJsonObject(raw) {
  raw = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, MAX_TARGETS)
    .map((t) => ({ title: t.title.trim(), explanation: typeof t.explanation === 'string' ? t.explanation.trim() : '' }));
}

/**
 * Analyse the accumulated evidence for one student and write the
 * human-readable profile fields (writing_summary, voice_summary,
 * targets_json) to student_writing_profiles.
 */
export async function generateProfileSummary(db, { studentId } = {}, { chat = callChat } = {}) {
  try {
    if (!studentId) return { status: 'skipped' };

    const issueRows = db.prepare(`
      SELECT code, category, label, evidence_count, open_count, resolved_count
      FROM student_literacy_issue_stats
      WHERE student_id = ?
      ORDER BY open_count DESC, evidence_count DESC
    `).all(studentId);

    const evidenceRows = db.prepare(`
      SELECT code, category, label, selected_text
      FROM student_literacy_evidence
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(studentId);

    const targetRows = db.prepare(`
      SELECT nfi.title, nfi.explanation
      FROM native_feedback_items nfi
      JOIN native_pads np ON np.id = nfi.native_pad_id
      WHERE np.student_id = ? AND nfi.kind = 'target'
      ORDER BY nfi.created_at DESC
      LIMIT 20
    `).all(studentId);

    const snapshotRows = db.prepare(`
      SELECT ss.rubric_kind, ss.total, ss.recorded_at,
             COALESCE(json_extract(a.settings_json, '$.essay_type'), 'other') AS essay_type
      FROM score_snapshots ss
      JOIN assignments a ON a.id = ss.assignment_id
      WHERE ss.student_id = ?
      ORDER BY ss.recorded_at ASC
    `).all(studentId);

    const styleProfile = aggregateStyleProfile(db, { studentId });

    if (issueRows.length === 0 && styleProfile.essays === 0) {
      return { status: 'skipped' };
    }

    const { total: totalWords } = db.prepare(
      'SELECT COALESCE(SUM(word_count), 0) AS total FROM style_metrics WHERE student_id = ?'
    ).get(studentId);

    // Per-100-words rates, never raw counts, so essays of different lengths
    // compare fairly (CLAUDE.md normalization rule).
    const issueRates = issueRows.map((row) => ({
      code: row.code,
      category: row.category,
      label: row.label,
      rate_per_100_words: totalWords > 0 ? round((row.evidence_count / totalWords) * 100) : 0,
      open_count: row.open_count,
      resolved_count: row.resolved_count,
    }));

    const evidence = {
      total_words_seen: totalWords,
      recurring_issues: issueRates,
      example_quotes: evidenceRows.map((r) => ({ code: r.code, label: r.label, quote: r.selected_text })),
      known_targets: targetRows,
      score_trajectory: snapshotRows.map((r) => ({ rubric_kind: r.rubric_kind, essay_type: r.essay_type, total: r.total, at: r.recorded_at })),
      style_fingerprint: styleProfile.features,
      style_fingerprint_by_essay_type: styleProfile.by_essay_type,
      essays_with_style_data: styleProfile.essays,
    };

    const result = await chat(db, {
      intent: readDoerIntent(db),
      messages: [
        { role: 'system', content: DOER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(evidence) },
      ],
      maxTokens: 1500,
      temperature: 0,
    });
    const doerOutput = parseJsonObject(result?.choices?.[0]?.message?.content);
    if (!doerOutput) throw new Error('unparseable profile summary response');

    let fields = {
      writing_summary: typeof doerOutput.writing_summary === 'string' ? doerOutput.writing_summary.trim() : '',
      voice_summary: typeof doerOutput.voice_summary === 'string' ? doerOutput.voice_summary.trim() : '',
      targets: normalizeTargets(doerOutput.targets),
    };

    try {
      const checkerResult = await chat(db, {
        intent: CHECKER_INTENT,
        messages: [
          { role: 'system', content: CHECKER_SYSTEM_PROMPT },
          { role: 'user', content: `EVIDENCE:\n${JSON.stringify(evidence)}\n\nSUMMARY:\n${JSON.stringify(fields)}` },
        ],
        maxTokens: 800,
        temperature: 0,
      });
      const verdicts = parseJsonObject(checkerResult?.choices?.[0]?.message?.content);
      if (verdicts) {
        for (const field of ['writing_summary', 'voice_summary', 'targets']) {
          const v = verdicts[field];
          if (v && v.supported === false && typeof v.confidence === 'number' && v.confidence >= 0.8) {
            fields[field] = field === 'targets' ? [] : '';
          }
        }
      }
    } catch (error) {
      console.warn('[profileSummarizer] checker unavailable:', error?.message ?? error);
    }

    db.prepare(`
      INSERT INTO student_writing_profiles (student_id, writing_summary, voice_summary, targets_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET
        writing_summary = excluded.writing_summary,
        voice_summary = excluded.voice_summary,
        targets_json = excluded.targets_json,
        updated_at = datetime('now')
    `).run(studentId, fields.writing_summary, fields.voice_summary, JSON.stringify(fields.targets));

    return { status: 'ok' };
  } catch (error) {
    console.warn('[profileSummarizer]', error?.message ?? error);
    return { status: 'error' };
  }
}
