/**
 * Deterministic stylometric feature extraction (the voice fingerprint).
 *
 * Runs on every submit, costs nothing, never calls a model. The point is a
 * stable, comparable set of numbers per essay so that "how does this student
 * usually write" is grounded in counted evidence, not model vibes. The AI
 * narrative in the profile summariser may only describe patterns these
 * numbers support.
 *
 * All rate features are per 100 words or per sentence so essays of different
 * lengths compare fairly. TTR uses a moving window (MATTR) because plain
 * type-token ratio collapses as texts get longer.
 */

const SUBORDINATORS = new Set(['because', 'although', 'though', 'while', 'since', 'if', 'unless', 'until', 'when', 'whenever', 'whereas', 'that', 'which', 'who', 'whom', 'whose', 'where', 'after', 'before', 'as']);
const COORDINATORS = new Set(['and', 'but', 'or', 'so', 'yet', 'nor']);
const TRANSITIONS = new Set(['however', 'therefore', 'moreover', 'furthermore', 'consequently', 'nevertheless', 'nonetheless', 'meanwhile', 'additionally', 'finally', 'firstly', 'secondly', 'thirdly', 'overall', 'instead', 'thus', 'hence', 'besides']);
const HEDGES = new Set(['maybe', 'perhaps', 'might', 'may', 'could', 'possibly', 'probably', 'somewhat', 'seem', 'seems', 'seemed', 'appear', 'appears', 'suggest', 'suggests', 'likely', 'arguably']);
const BOOSTERS = new Set(['very', 'really', 'extremely', 'absolutely', 'definitely', 'certainly', 'always', 'never', 'completely', 'totally', 'highly', 'strongly']);
const FIRST_PERSON = new Set(['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours']);
const SECOND_PERSON = new Set(['you', 'your', 'yours', 'yourself', 'yourselves']);
// AP Lang register markers. Attribution verbs signal source engagement
// (synthesis and rhetorical analysis); concession markers signal
// counterargument handling (argument); rhetoric terms signal explicit
// analysis of choices and effect (rhetorical analysis).
const ATTRIBUTION_VERBS = new Set(['argues', 'argued', 'claims', 'claimed', 'asserts', 'asserted', 'contends', 'contended', 'states', 'stated', 'notes', 'noted', 'observes', 'observed', 'writes', 'wrote', 'according', 'acknowledges', 'maintains', 'insists', 'points']);
const CONCESSION_MARKERS = new Set(['admittedly', 'granted', 'critics', 'opponents', 'skeptics', 'counterargument', 'concede', 'concedes', 'conceding', 'undeniably', 'certainly', 'true', 'detractors']);
const RHETORIC_TERMS = new Set(['audience', 'tone', 'diction', 'imagery', 'appeal', 'appeals', 'ethos', 'pathos', 'logos', 'rhetorical', 'juxtaposition', 'repetition', 'anecdote', 'irony', 'metaphor', 'simile', 'syntax', 'shift', 'strategy', 'strategies', 'persuade', 'persuades', 'convey', 'conveys', 'emphasize', 'emphasizes', 'evoke', 'evokes']);
const NOMINALIZATION_SUFFIX = /(tion|sion|ment|ness|ance|ence|ity)s?$/;
const BE_FORMS = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being']);
const FUNCTION_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'so', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'that', 'this', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'not', 'no', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'their', 'our', 'there', 'here', 'what', 'which', 'who', 'when', 'where', 'how', 'than', 'then', 'if', 'because', 'while', 'about', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'again', 'also', 'just', 'only', 'both', 'each', 'all', 'any', 'some', 'more', 'most', 'other', 'such', 'own', 'same', 'too', 'am']);

function round(n, places = 3) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

export function splitSentences(text) {
  // Abbreviation-light splitter, fine for student essays.
  return String(text ?? '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\w/.test(s));
}

function words(text) {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

// Moving-average type-token ratio, window 50; falls back to plain TTR when short.
function mattr(tokens, window = 50) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= window) return new Set(tokens).size / tokens.length;
  let sum = 0;
  const counts = new Map();
  let distinct = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    counts.set(t, (counts.get(t) ?? 0) + 1);
    if (counts.get(t) === 1) distinct++;
    if (i >= window) {
      const out = tokens[i - window];
      counts.set(out, counts.get(out) - 1);
      if (counts.get(out) === 0) distinct--;
    }
    if (i >= window - 1) sum += distinct / window;
  }
  return sum / (tokens.length - window + 1);
}

/**
 * Pure feature extractor. Returns the full metrics object; never throws on
 * weird input (empty text gives zeros).
 */
export function computeStyleMetrics(text) {
  const plain = String(text ?? '');
  const sentences = splitSentences(plain);
  const tokens = words(plain);
  const wordCount = tokens.length;
  const per100 = (n) => (wordCount ? round((n / wordCount) * 100) : 0);

  const sentenceLengths = sentences.map((s) => words(s).length);
  const openers = sentences.map((s) => (words(s)[0] ?? ''));
  const openerCounts = new Map();
  for (const o of openers) openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);
  const repeatedOpeners = openers.length
    ? [...openerCounts.values()].filter((c) => c > 1).reduce((a, b) => a + b, 0) / openers.length : 0;

  const paragraphs = plain.split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => /\w/.test(p));
  const paraSentenceCounts = paragraphs.map((p) => splitSentences(p).length);

  let subord = 0; let coord = 0; let transitions = 0; let hedges = 0; let boosters = 0;
  let firstPerson = 0; let functionWords = 0; let longWords = 0; let charSum = 0;
  let passiveHits = 0; let secondPerson = 0; let attribution = 0; let concession = 0;
  let rhetoric = 0; let nominalizations = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (SUBORDINATORS.has(t)) subord++;
    if (COORDINATORS.has(t)) coord++;
    if (TRANSITIONS.has(t)) transitions++;
    if (HEDGES.has(t)) hedges++;
    if (BOOSTERS.has(t)) boosters++;
    if (FIRST_PERSON.has(t)) firstPerson++;
    if (SECOND_PERSON.has(t)) secondPerson++;
    if (ATTRIBUTION_VERBS.has(t)) attribution++;
    if (CONCESSION_MARKERS.has(t)) concession++;
    if (RHETORIC_TERMS.has(t)) rhetoric++;
    if (t.length >= 6 && !FUNCTION_WORDS.has(t) && NOMINALIZATION_SUFFIX.test(t)) nominalizations++;
    if (FUNCTION_WORDS.has(t)) functionWords++;
    if (t.length >= 7) longWords++;
    charSum += t.length;
    if (BE_FORMS.has(t) && i + 1 < tokens.length && /(ed|en)$/.test(tokens[i + 1]) && tokens[i + 1].length > 4) passiveHits++;
  }
  const contractions = (plain.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) ?? []).length;
  // Straight and curly double quotes, counted as pairs: quoted evidence rate.
  const quotePairs = Math.floor(((plain.match(/["“”]/g) ?? []).length) / 2);

  const punct = (re) => (plain.match(re) ?? []).length;
  const sentenceCount = sentences.length || 1;

  return {
    word_count: wordCount,
    sentence_count: sentences.length,
    paragraph_count: paragraphs.length,
    // Rhythm
    mean_sentence_length: round(mean(sentenceLengths), 2),
    sentence_length_sd: round(stdev(sentenceLengths), 2),
    short_sentence_share: round(sentenceLengths.filter((l) => l > 0 && l < 8).length / sentenceCount),
    long_sentence_share: round(sentenceLengths.filter((l) => l > 30).length / sentenceCount),
    mean_paragraph_sentences: round(mean(paraSentenceCounts), 2),
    repeated_opener_share: round(repeatedOpeners),
    // Lexis
    mattr_50: round(mattr(tokens)),
    mean_word_length: round(wordCount ? charSum / wordCount : 0, 2),
    long_word_share: round(wordCount ? longWords / wordCount : 0),
    lexical_density: round(wordCount ? (wordCount - functionWords) / wordCount : 0),
    // Syntax proxies
    commas_per_sentence: round(punct(/,/g) / sentenceCount, 2),
    semicolons_per_100_words: per100(punct(/;/g)),
    questions_share: round(punct(/\?/g) / sentenceCount),
    exclamations_share: round(punct(/!/g) / sentenceCount),
    subordinators_per_sentence: round(subord / sentenceCount, 2),
    coordinators_per_sentence: round(coord / sentenceCount, 2),
    passive_per_100_words: per100(passiveHits),
    // Discourse habits
    transitions_per_100_words: per100(transitions),
    hedges_per_100_words: per100(hedges),
    boosters_per_100_words: per100(boosters),
    first_person_per_100_words: per100(firstPerson),
    // AP Lang register markers (genre voice: synthesis, rhetorical analysis, argument)
    second_person_per_100_words: per100(secondPerson),
    attribution_verbs_per_100_words: per100(attribution),
    concession_markers_per_100_words: per100(concession),
    rhetoric_terms_per_100_words: per100(rhetoric),
    quoted_evidence_per_100_words: per100(quotePairs),
    contractions_per_100_words: per100(contractions),
    nominalizations_per_100_words: per100(nominalizations),
  };
}

/**
 * Compute and store the fingerprint for a pad. Upsert by pad. Never throws.
 */
export function recordStyleMetrics(db, { padId } = {}) {
  try {
    const pad = db.prepare('SELECT id, student_id, assignment_id, plain_text FROM native_pads WHERE id = ?').get(padId);
    if (!pad || !pad.plain_text || !/\w/.test(pad.plain_text)) return { status: 'skipped' };
    const metrics = computeStyleMetrics(pad.plain_text);
    const essayType = db.prepare(
      "SELECT COALESCE(json_extract(settings_json, '$.essay_type'), 'other') AS t FROM assignments WHERE id = ?"
    ).get(pad.assignment_id)?.t ?? 'other';
    db.prepare(`
      INSERT INTO style_metrics (native_pad_id, student_id, assignment_id, word_count, metrics_json, essay_type)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(native_pad_id) DO UPDATE SET
        word_count = excluded.word_count,
        metrics_json = excluded.metrics_json,
        essay_type = excluded.essay_type,
        created_at = CURRENT_TIMESTAMP
    `).run(pad.id, pad.student_id, pad.assignment_id, metrics.word_count, JSON.stringify(metrics), essayType);
    return { status: 'ok', metrics };
  } catch (error) {
    console.warn('[styleMetrics]', error?.message ?? error);
    return { status: 'error' };
  }
}

// Features that scale with essay length; never used for anomaly z-scores.
const LENGTH_FEATURES = new Set(['word_count', 'sentence_count', 'paragraph_count']);

/**
 * Compare one essay's fingerprint against the student's other essays.
 * Returns per-feature z-scores where the essay sits far outside the
 * student's own normal (|z| >= threshold). This is evidence for "does this
 * homework essay sound like the writing I have watched them do", not proof:
 * genre shifts also move these numbers, so surface it with the assignment
 * type and provenance next to it, never as an accusation on its own.
 */
export function detectStyleAnomaly(db, { padId, threshold = 2 } = {}) {
  const row = db.prepare('SELECT student_id, essay_type, metrics_json FROM style_metrics WHERE native_pad_id = ?').get(padId);
  if (!row) return { status: 'skipped', anomalies: [] };
  // Compare within the same essay type when there is enough of it: a
  // synthesis essay judged against argument history reads as an anomaly
  // when it is really a genre shift. Fall back to all essays when thin.
  let history = db.prepare(
    'SELECT metrics_json FROM style_metrics WHERE student_id = ? AND native_pad_id != ? AND essay_type = ? ORDER BY created_at, id'
  ).all(row.student_id, padId, row.essay_type ?? 'other');
  let baseline = 'same_type';
  if (history.length < 3) {
    history = db.prepare(
      'SELECT metrics_json FROM style_metrics WHERE student_id = ? AND native_pad_id != ? ORDER BY created_at, id'
    ).all(row.student_id, padId);
    baseline = 'all_types';
  }
  const series = history.map((r) => { try { return JSON.parse(r.metrics_json); } catch { return null; } }).filter(Boolean);
  if (series.length < 3) return { status: 'insufficient_history', essays: series.length, anomalies: [] };

  let current;
  try { current = JSON.parse(row.metrics_json); } catch { return { status: 'skipped', anomalies: [] }; }

  const anomalies = [];
  for (const key of Object.keys(current)) {
    if (LENGTH_FEATURES.has(key)) continue;
    const vals = series.map((m) => Number(m[key])).filter(Number.isFinite);
    if (vals.length < 3) continue;
    const m = mean(vals);
    const sd = stdev(vals);
    if (sd < 1e-9) continue;
    const z = (Number(current[key]) - m) / sd;
    if (Math.abs(z) >= threshold) {
      anomalies.push({ feature: key, value: Number(current[key]), mean: round(m), sd: round(sd), z: round(z, 2) });
    }
  }
  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { status: 'ok', essays: series.length, baseline, anomalies };
}

/**
 * Aggregate a student's fingerprints for the profile/dashboard: per-feature
 * mean, spread and simple trend (first-half vs second-half mean) across pads
 * in time order. Read-side only; nothing is stored.
 */
export function aggregateStyleProfile(db, { studentId } = {}) {
  const rows = db.prepare(
    'SELECT metrics_json, essay_type, created_at FROM style_metrics WHERE student_id = ? ORDER BY created_at, id'
  ).all(studentId);
  const parsed = rows
    .map((r) => { try { return { metrics: JSON.parse(r.metrics_json), essay_type: r.essay_type ?? 'other' }; } catch { return null; } })
    .filter(Boolean);
  if (!parsed.length) return { essays: 0, features: {}, by_essay_type: {} };

  const summarize = (series) => {
    const features = {};
    for (const key of Object.keys(series[0])) {
      const vals = series.map((m) => Number(m[key])).filter(Number.isFinite);
      if (!vals.length) continue;
      const half = Math.floor(vals.length / 2);
      features[key] = {
        mean: round(mean(vals)),
        sd: round(stdev(vals)),
        latest: round(vals[vals.length - 1]),
        trend: vals.length >= 4 ? round(mean(vals.slice(half)) - mean(vals.slice(0, half))) : null,
      };
    }
    return features;
  };

  // The three AP Lang tasks demand different voices, so the profile keeps a
  // per-type fingerprint next to the overall one (types with a single essay
  // still show, with sd 0 and no trend).
  const byType = {};
  for (const p of parsed) (byType[p.essay_type] ??= []).push(p.metrics);
  const by_essay_type = {};
  for (const [type, series] of Object.entries(byType)) {
    by_essay_type[type] = { essays: series.length, features: summarize(series) };
  }

  return { essays: parsed.length, features: summarize(parsed.map((p) => p.metrics)), by_essay_type };
}
