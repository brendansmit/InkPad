/**
 * Auto-literacy-coding service.
 *
 * Called after a student submits. Analyses the pad text paragraph-by-paragraph
 * using the same prompt and code set as the desktop Writing Analyzer, then saves
 * results to submission_codes. Results are held (not visible to students) until
 * the teacher explicitly releases feedback.
 */
import { callChat } from './openRouter.js';

const VALID_CODES = new Set([
  'Sp','Caps','P','^','Exp','Gra','Embed','AA/Adj',
  'STR','FOR','WO','WW','V','VT','del','inc','RO','Rep','✓','//',
]);

const SYSTEM_PROMPT = `You are a precise English literacy marker. You find ERRORS in a student paragraph and label each with ONE code. You are conservative: only flag things that are clearly wrong.

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

RULES (follow exactly):
1. Only flag genuine errors. If a phrase is correct standard English, DO NOT flag it. When unsure, leave it alone.
2. "quote" must be copied VERBATIM from the paragraph, character for character. Never invent or paraphrase it.
3. "quote" must be whole words only. Never select part of a word.
4. "quote" is the SHORTEST span containing the error — usually one word; a short phrase only if the error spans multiple words.
5. Pick exactly ONE code per finding.
6. "sentence" is the FULL verbatim sentence the quote sits in. Copy it exactly.
7. Do not flag style, tone, or things you would merely prefer differently. Errors only.
8. A paragraph with no errors returns []. That is a valid correct answer.

OUTPUT FORMAT — return ONLY a JSON array, nothing else:
[{"sentence": "<verbatim sentence>", "quote": "<verbatim error span>", "code": "<one code>"}]

EXAMPLE:
Paragraph: They is playing outside and she recieved the ball, the game was fun.
Answer:
[{"sentence":"They is playing outside and she recieved the ball, the game was fun.","quote":"is","code":"Gra"},{"sentence":"They is playing outside and she recieved the ball, the game was fun.","quote":"recieved","code":"Sp"}]`;

function parseLiteracyResponse(raw) {
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  raw = raw.replace(/```json|```/g, '');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < 0) return [];
  try {
    const items = JSON.parse(raw.slice(start, end + 1));
    return items
      .filter(it => it && typeof it.sentence === 'string' && typeof it.quote === 'string'
                 && VALID_CODES.has(it.code) && it.quote.trim())
      .map(it => ({ sentence: it.sentence.trim(), quote: it.quote.trim(), code: it.code }));
  } catch { return []; }
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

function findQuoteSpan(paraText, sentence, quote) {
  const sentSpan = locate(paraText, sentence);
  if (sentSpan) {
    const seg = paraText.slice(sentSpan.start, sentSpan.end);
    const q = locate(seg, quote);
    if (q) return { start: sentSpan.start + q.start, end: sentSpan.start + q.end };
  }
  return locate(paraText, quote);
}

function codeCategory(code) {
  if (['Sp','Caps','^','WW','AA/Adj','Rep'].includes(code)) return 'surface';
  if (['Gra','VT','V','WO','del','inc','RO','STR','Exp'].includes(code)) return 'grammar';
  if (['P','FOR','//','Embed'].includes(code)) return 'format';
  if (code === '✓') return 'positive';
  return 'other';
}

export async function analyseSubmission(db, { submissionId, text }) {
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 10 && p.split(/\s+/).length >= 2);

  if (!paragraphs.length) return;

  const findings = [];
  let searchFrom = 0;

  for (const para of paragraphs) {
    const paraStart = text.indexOf(para, searchFrom);
    if (paraStart < 0) continue;
    searchFrom = paraStart + para.length;

    let raw;
    try {
      const result = await callChat(db, {
        intent: 'anthropic claude haiku',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Paragraph:\n${para.slice(0, 3000)}\n\nAnswer:` },
        ],
        maxTokens: 1024,
        temperature: 0.1,
      });
      raw = result.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      console.warn(`[literacyCoder] callChat error for submission ${submissionId}:`, e.message);
      continue;
    }

    for (const { sentence, quote, code } of parseLiteracyResponse(raw)) {
      const span = findQuoteSpan(para, sentence, quote);
      if (!span) continue;
      findings.push({
        start_offset: paraStart + span.start,
        end_offset: paraStart + span.end,
        code,
        category: codeCategory(code),
      });
    }
  }

  if (!findings.length) {
    console.log(`[literacyCoder] no findings for submission ${submissionId}`);
    return;
  }

  db.prepare('DELETE FROM submission_codes WHERE submission_id = ?').run(submissionId);
  const insert = db.prepare(
    'INSERT INTO submission_codes (submission_id, start_offset, end_offset, code, category, label) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const f of findings) {
    insert.run(submissionId, f.start_offset, f.end_offset, f.code, f.category, '');
  }
  console.log(`[literacyCoder] saved ${findings.length} codes for submission ${submissionId}`);
}
