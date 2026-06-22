function tokenise(id) {
  return id.toLowerCase().split(/[\/\-\._]+/).filter(Boolean);
}

function score(query, candidate) {
  const qt = tokenise(query);
  const ct = candidate.toLowerCase();
  const matches = qt.filter(t => ct.includes(t)).length;
  return matches / Math.max(qt.length, 1);
}

// Returns { id, name, exact } or null if nothing is close enough
function fuzzyMatch(query, models) {
  if (!query || !models?.length) return null;

  const q = query.toLowerCase();
  const exact = models.find(m => m.id.toLowerCase() === q);
  if (exact) return { id: exact.id, name: exact.name, exact: true };

  let best = null;
  let bestScore = 0;

  for (const m of models) {
    const s = score(query, m.id);
    if (s > bestScore || (s === bestScore && m.id.length < (best?.id.length || Infinity))) {
      bestScore = s;
      best = m;
    }
  }

  return bestScore >= 0.4 ? { id: best.id, name: best.name, exact: false, score: bestScore } : null;
}

// Validate a list of model IDs, return corrections map { originalId -> { id, name, exact } }
function validateModels(ids, models) {
  const corrections = {};
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    const match = fuzzyMatch(id, models);
    if (!match) {
      corrections[id] = null; // no match found at all
    } else if (!match.exact) {
      corrections[id] = match; // needs correction
    }
    // exact matches are fine, no entry needed
  }
  return corrections;
}

module.exports = { fuzzyMatch, validateModels };
