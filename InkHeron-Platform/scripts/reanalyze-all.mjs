// One-off maintenance: retract every AI grading result and re-run the fixed
// AI marking chain on every eligible pad across the whole database.
//
// This reuses the exact reanalyzePad logic the teacher "Run AI review" button
// uses, so there is a single source of truth. It exists because there is no
// bulk endpoint and the per-assignment HTTP route needs a teacher session.
//
// Usage (on the droplet, with the platform env loaded so INKHERON_DB_PATH and
// the OpenRouter settings are in place):
//   INKHERON_DB_PATH=/opt/inkheron-platform/data/inkheron.db node scripts/reanalyze-all.mjs
//
// It backs up nothing itself. Take a DB copy first.
import { openDatabase } from '../src/db/database.js';
import { reanalyzePad } from '../src/routes/nativeReanalyze.js';
import { readRawSetting } from '../src/services/settingsStore.js';

const ELIGIBLE_STATES = ['submitted', 'marked', 'green_pen_open', 'resubmitted'];

function hasText(pad) {
  return !!pad.plain_text && /\w/.test(pad.plain_text);
}

async function main() {
  const db = openDatabase();

  if (!readRawSetting(db, 'openrouter_api_key')) {
    console.error('No OpenRouter key is set in settings. Aborting; nothing was changed.');
    process.exit(1);
  }

  const placeholders = ELIGIBLE_STATES.map(() => '?').join(',');
  const pads = db.prepare(
    `SELECT * FROM native_pads WHERE state IN (${placeholders}) ORDER BY assignment_id ASC, id ASC`
  ).all(...ELIGIBLE_STATES).filter(hasText);

  console.log(`Re-analysing ${pads.length} eligible pads (retract + fresh AI run each).`);

  let totalMarks = 0;
  let done = 0;
  for (const pad of pads) {
    const r = await reanalyzePad(db, pad);
    totalMarks += r.marks;
    done += 1;
    console.log(
      `[${done}/${pads.length}] pad ${pad.id} (student ${pad.student_id}, assignment ${pad.assignment_id}): ` +
      `status=${r.literacy_status} marks=${r.marks} contested=${r.contested} suggestions=${r.suggestions}`
    );
  }

  console.log(`Done. ${pads.length} pads processed, ${totalMarks} literacy marks applied in total.`);
}

main().catch((err) => {
  console.error('reanalyze-all failed:', err);
  process.exit(1);
});
