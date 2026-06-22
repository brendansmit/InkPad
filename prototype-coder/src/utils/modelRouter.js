const { DEFAULTS } = require('../config');

function family(modelId = '') {
  return String(modelId).split('/')[0].toLowerCase();
}

function sameFamily(a, b) {
  return family(a) === family(b);
}

const DEFAULT_REVIEWER_FOR = {
  deepseek: 'qwen/qwen-2.5-coder-32b-instruct',
  qwen: 'deepseek/deepseek-chat'
};

const THIRD_FAMILY_CANDIDATES = [
  'moonshotai/kimi-k2'
];

// Placeholder strings that look like model IDs but aren't
const INVALID_MODEL_IDS = new Set(['default', 'auto', 'none', '', null, undefined]);

function defaultReviewer(generator) {
  return DEFAULT_REVIEWER_FOR[family(generator)] || 'qwen/qwen-2.5-coder-32b-instruct';
}

function validModel(id) {
  return id && !INVALID_MODEL_IDS.has(id) && id.includes('/');
}

function resolveTaskModels(task, defaults, opts = {}) {
  let generator =
    (validModel(task.generator) ? task.generator : null) ||
    (opts.fast ? defaults.fastGenerator : opts.hard ? defaults.hardGenerator : defaults.generator) ||
    DEFAULTS.generator;

  let reviewer = validModel(task.reviewer) ? task.reviewer
    : validModel(defaults.reviewer) ? defaults.reviewer
    : null;
  if (!reviewer || sameFamily(reviewer, generator)) {
    reviewer = defaultReviewer(generator);
  }

  const genFam = family(generator);
  const revFam = family(reviewer);
  let repairer = null;
  for (const cand of defaults.repairCandidates || THIRD_FAMILY_CANDIDATES) {
    const cf = family(cand);
    if (cf !== genFam && cf !== revFam) {
      repairer = cand;
      break;
    }
  }
  if (!repairer) repairer = reviewer;

  return { generator, reviewer, repairer };
}

module.exports = { family, sameFamily, defaultReviewer, resolveTaskModels };
