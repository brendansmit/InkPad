const { MODEL_PRICES, DEFAULTS } = require('../config');

function price(modelId) {
  return MODEL_PRICES[modelId] || MODEL_PRICES.default;
}

function estimateTask(task, defaults) {
  const gen = task.generator || defaults.generator;
  const rev = task.reviewer || defaults.reviewer;
  const inputTokens = Math.ceil((task.instruction.length + task.path.length) / 4) + 200;
  const outputTokens = task.maxOutputTokens || 8192;

  const genCost = inputTokens * price(gen).input + outputTokens * price(gen).output;
  const reviewCost = (outputTokens + 500) * price(rev || gen).input + 500 * price(rev || gen).output;
  const repairCost = genCost * 0.5;

  return genCost + reviewCost + repairCost;
}

function estimatePlan(plan) {
  const defaults = { ...DEFAULTS, ...(plan.defaults || {}) };
  const tasks = plan.tasks || [];
  const total = tasks.reduce((sum, t) => sum + estimateTask(t, defaults), 0);
  return {
    totalUsd: Math.round(total * 1000) / 1000,
    taskCount: tasks.length,
    budgetUsd: plan.budgetUsd || defaults.budgetUsd
  };
}

module.exports = { price, estimateTask, estimatePlan };
