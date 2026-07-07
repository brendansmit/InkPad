/**
 * Auto-literacy-coding service.
 *
 * Called after a student submits. Analyses the pad text paragraph-by-paragraph
 * using the same prompt and code set as the desktop Writing Analyzer, then saves
 * results to submission_codes. Results are held (not visible to students) until
 * the teacher explicitly releases feedback.
 */
import { callChat } from './openRouter.js';
import { readDoerIntent } from './settingsStore.js';
import { verifyFindings } from './checker.js';
import { buildCalibration } from './promptCalibration.js';



export const VALID_CODES = new Set([
  'Sp','Caps','P','^','Exp','Gra','Embed','AA/Adj',
  'STR','FOR','WO','WW','V','VT','del','inc','RO','Rep','✓','//',
  'MT',
]);

// Codes that NEVER auto-apply, whatever the checker says. MT (a name, title
// or saying translated literally from Chinese) needs the teacher's
// judgement: only a human can tell whether an established English version
// exists or the student's rendering is a fair choice.
export const MANUAL_REVIEW_CODES = new Set(['MT']);

const SYSTEM_PROMPT = `You are a precise English literacy marker for second language learners. You find ERRORS in a student paragraph and label each with ONE code. These codes are practice feedback for the student, not grades, so completeness matters: flag EVERY genuine error, even small ones, even when a paragraph has many. A dense paragraph can easily have 10 or more findings.

CODES:
Sp     = spelling error ("recieved" → "received")
Caps   = missing capital letter ("i went" → "I went")
P      = punctuation missing/wrong (missing comma, apostrophe, hyphen in "so-called")
^      = a needed word is missing ("She ready" → "She is ready")
Exp    = awkward/unidiomatic expression that is not a clean grammar error
Gra    = grammatical error: subject-verb agreement, wrong/missing article, wrong preposition
Embed  = quotation embedded incorrectly (missing comma or quote marks)
AA/Adj = wrong adjective form ("most easiest" → "easiest")
STR    = sentence structure problem (clunky or ill-formed clause)
FOR    = formatting problem (register, heading, layout)
WO     = word order error ("To the store quickly went she")
WW     = wrong word, real word used incorrectly ("borrow" for "borrowed")
V      = missing or wrong verb formation ("They playing" → "They are playing")
VT     = verb tense error ("Yesterday he runs" → "ran")
del    = word should be deleted (redundant: "The dog, it barked")
inc    = incomplete sentence / fragment ("Because she was tired.")
RO     = run-on sentence (two clauses fused without punctuation)
Rep    = redundant repetition of a word or idea just used
MT     = mistranslated NAME or FIXED EXPRESSION only: a book/film/show title, a proper noun, a saying or an idiom rendered word-for-word from Chinese when an established English name or natural equivalent exists ("people mountain people sea" for a crowded scene; a novel referred to by a literal title instead of its published English title). MT is RARE: at most a few per essay. Ordinary Chinese-influenced grammar or sentence structure is NEVER MT; code those as Gra, STR, WO or Exp as usual.

RULES (follow exactly):
1. Flag every genuine error. Never skip an error because you already flagged similar ones. But if a phrase is correct standard English, DO NOT flag it.
1b. Judge by how the SENTENCE READS, not by pedantry. If fluent speakers naturally write or say it that way (informal register, sentence-initial And/But, stranded prepositions, singular they, colloquial phrasing), it is NOT an error. Flag only what a fluent reader would stumble on.
2. "quote" must be copied VERBATIM from the paragraph, character for character. Never invent or paraphrase it.
3. "quote" must be whole words only. Never select part of a word.
4. "quote" is the SHORTEST span containing the error — usually one word; a short phrase only if the error spans multiple words.
5. Pick exactly ONE code per finding.
6. "sentence" is the FULL verbatim sentence the quote sits in. Copy it exactly.
7. Do not flag style, tone, or things you would merely prefer differently. Errors only.
8. A paragraph with no errors returns []. That is a valid correct answer.
9. Errors can overlap. When a whole clause has a structure error (STR, inc, RO) and words inside it also have their own errors (Sp, WW, VT and so on), report BOTH: the clause-level finding AND each word-level finding separately, each as its own object. Never drop a word-level error just because it sits inside a larger structure error.

OUTPUT FORMAT — return ONLY a JSON array, nothing else:
[{"sentence": "<verbatim sentence>", "quote": "<verbatim error span>", "code": "<one code>"}]

EXAMPLE:
Paragraph: They is playing outside and she recieved the ball, the game was fun.
Answer:
[{"sentence":"They is playing outside and she recieved the ball, the game was fun.","quote":"is","code":"Gra"},{"sentence":"They is playing outside and she recieved the ball, the game was fun.","quote":"recieved","code":"Sp"}]`;

// Parse a JSON array, salvaging a truncated one (model hit max tokens) by
// cutting back to the last complete object. Dense L2 paragraphs produce long
// arrays; losing every finding to one truncated bracket is the worst outcome.
export function parseJsonArraySalvage(slice) {
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : null;
  } catch { /* fall through to salvage */ }
  const lastBrace = slice.lastIndexOf('}');
  if (lastBrace > 0) {
    try {
      const parsed = JSON.parse(slice.slice(0, lastBrace + 1) + ']');
      return Array.isArray(parsed) ? parsed : null;
    } catch { /* unsalvageable */ }
  }
  return null;
}

export function parseLiteracyResponse(raw) {
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  raw = raw.replace(/```json|```/g, '');
  const start = raw.indexOf('[');
  if (start < 0) return [];
  const end = raw.lastIndexOf(']');
  const slice = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  const items = parseJsonArraySalvage(slice);
  if (!items) return [];
  return items
      .filter(it => it && typeof it.sentence === 'string' && typeof it.quote === 'string'
                 && VALID_CODES.has(it.code) && it.quote.trim())
      .map(it => ({ sentence: it.sentence.trim(), quote: it.quote.trim(), code: it.code }));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locate(haystack, needle) {
  needle = needle.trim();
  if (!needle) return null;
  const tokens = needle.split(/\s+/).map(escapeRegex);
  let pat = tokens.join('\\s+');
  if (/^[\w']/.test(needle)) pat = '(?<!\\w)' + pat;
  if (/[\w'"]$/.test(needle)) pat = pat + '(?!\\w)';
  try {
    const m = new RegExp(pat).exec(haystack);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  } catch { return null; }
}

export function findQuoteSpan(paraText, sentence, quote) {
  const sentSpan = locate(paraText, sentence);
  if (sentSpan) {
    const seg = paraText.slice(sentSpan.start, sentSpan.end);
    const q = locate(seg, quote);
    if (q) return { start: sentSpan.start + q.start, end: sentSpan.start + q.end };
  }
  return locate(paraText, quote);
}

export function codeCategory(code) {
  if (['Sp','Caps','^','WW','AA/Adj','Rep'].includes(code)) return 'surface';
  if (['Gra','VT','V','WO','del','inc','RO','STR','Exp','MT'].includes(code)) return 'grammar';
  if (['P','FOR','//','Embed'].includes(code)) return 'format';
  if (code === '✓') return 'positive';
  return 'other';
}

/**
 * Analyse the current text of a native pad and write HIDDEN literacy
 * suggestions to `ai_literacy_suggestions`. Suggestions are NOT visible as
 * marks and do NOT touch the student profile until a teacher accepts one
 * (POST /api/native/pads/:padId/suggestions/:id/accept in nativePads.js
 * promotes an accepted suggestion into a real native_annotation).
 *
 * ============================ SEAM FOR FABLE ============================
 * This is a documented STUB. Phase B fills the body. See FABLE_HANDOFF.md.
 *
 * Contract:
 *   input  : db, { padId }
 *   reads  : native_pads.plain_text and .version for padId
 *   Doer   : per paragraph call callChat(db, { intent: 'anthropic claude haiku',
 *            messages: [{role:'system',content:SYSTEM_PROMPT},{role:'user',...}] });
 *            parse with parseLiteracyResponse; locate each quote with
 *            findQuoteSpan for absolute offsets into plain_text.
 *   Checker: verifyFindings from ./checker.js (a DIFFERENT model family)
 *            confirms each quote is verbatim and drops false positives.
 *   writes : one row per surviving finding into ai_literacy_suggestions
 *            (native_pad_id, document_version, start_offset, end_offset,
 *             quote, code, category=codeCategory(code), label, model,
 *             checker_json, status='pending'). Clear prior 'pending' rows
 *            for the pad first.
 *   returns: { status, written }. Never throw to the caller: log and swallow
 *            errors so a missing API key is a clean no-op (as in tests).
 * =======================================================================
 */
const CODE_LABELS = {
  Sp: 'Spelling', Caps: 'Capital letter', P: 'Punctuation', '^': 'Missing word',
  Exp: 'Expression', Gra: 'Grammar', Embed: 'Quotation embedding', 'AA/Adj': 'Adjective form',
  STR: 'Sentence structure', FOR: 'Formatting', WO: 'Word order', WW: 'Wrong word',
  V: 'Verb formation', VT: 'Verb tense', del: 'Delete word', inc: 'Incomplete sentence',
  RO: 'Run-on sentence', Rep: 'Repetition', '✓': 'Good work', '//': 'New paragraph',
  MT: 'Mistranslated name or saying',
};

// Non-blank runs of lines with their absolute start offset into plain_text.
export function splitParagraphs(text) {
  const paragraphs = [];
  const re = /[^\n]+/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (/\w/.test(match[0])) paragraphs.push({ text: match[0], offset: match.index });
  }
  return paragraphs;
}

export async function runLiteracyAnalysis(db, { padId } = {}, { chat = callChat } = {}) {
  try {
    const pad = db.prepare('SELECT id, plain_text, version FROM native_pads WHERE id = ?').get(padId);
    if (!pad || !pad.plain_text || !/\w/.test(pad.plain_text)) return { status: 'skipped', written: 0 };
    const plainText = pad.plain_text;

    const findings = [];
    let modelId = '';
    // Corrections from past marking sessions steer this run (learning loop).
    const calibration = buildCalibration(db);
    const systemPrompt = SYSTEM_PROMPT + calibration;
    for (const para of splitParagraphs(plainText)) {
      const result = await chat(db, {
        intent: readDoerIntent(db),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: para.text },
        ],
        maxTokens: 4000,
        temperature: 0,
      });
      modelId = result?.model ?? modelId;
      for (const item of parseLiteracyResponse(result?.choices?.[0]?.message?.content ?? '')) {
        const span = findQuoteSpan(para.text, item.sentence, item.quote);
        if (!span) continue;
        const start = para.offset + span.start;
        const end = para.offset + span.end;
        // Store the exact pad slice so offsets and quote can never disagree.
        findings.push({
          start_offset: start,
          end_offset: end,
          quote: plainText.slice(start, end),
          code: item.code,
          category: codeCategory(item.code),
          label: CODE_LABELS[item.code] ?? item.code,
        });
      }
    }

    // Dedupe identical spans with the same code (models repeat themselves).
    const seen = new Set();
    const unique = findings.filter((f) => {
      const key = `${f.start_offset}:${f.end_offset}:${f.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const verified = await verifyFindings(db, { padPlainText: plainText, findings: unique }, { chat });
    const surviving = verified.filter((f) => f.checker.verbatim !== false);

    const clear = db.prepare("DELETE FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'pending'");
    const insert = db.prepare(`
      INSERT INTO ai_literacy_suggestions
        (native_pad_id, document_version, start_offset, end_offset, quote, code, category, label, model, checker_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    db.exec('BEGIN');
    try {
      clear.run(padId);
      for (const f of surviving) {
        insert.run(padId, pad.version, f.start_offset, f.end_offset, f.quote,
          f.code, f.category, f.label, modelId, JSON.stringify(f.checker));
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return { status: 'ok', written: surviving.length };
  } catch (error) {
    console.warn('[literacyCoder]', error?.message ?? error);
    return { status: 'error', written: 0 };
  }
}
