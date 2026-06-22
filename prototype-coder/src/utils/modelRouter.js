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
  'google/gemini-2.0-flash-001',
  'mistralai/codestral-2501'
];

function defaultReviewer(generator) {
  return DEFAULT_REVIEWER_FOR[family(generator)] || 'qwen/qwen-2.5-coder-32b-instruct';
}

function resolveTaskModels(task, defaults, opts = {}) {
  let generator =
    task.generator ||
    (opts.fast ? defaults.fastGenerator : opts.hard ? defaults.hardGenerator : defaults.generator) ||
    DEFAULTS.generator;

  let reviewer = task.reviewer || defaults.reviewer;
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
