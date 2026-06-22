const DEFAULT_GENERATOR = "deepseek/deepseek-v4-pro";
const DEFAULT_REVIEWER = "qwen/qwen3-coder-flash";
const DEFAULT_BUDGET_USD = 4;
const DEFAULT_OUTPUT_TOKENS = 1800;

export function parseBuildPlan(input) {
  const source = typeof input === "string" ? input.trim() : input;
  let parsed = source;
  if (typeof source === "string") {
    parsed = JSON.parse(source);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Build plan must be a JSON object");
  }
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("Build plan must include a non-empty tasks array");
  }

  const defaults = parsed.defaults || {};
  const plan = {
    projectName: String(parsed.projectName || "draft-project"),
    stack: String(parsed.stack || "Unspecified"),
    budgetUsd: numberOr(defaults.budgetUsd, numberOr(parsed.budgetUsd, DEFAULT_BUDGET_USD)),
    defaults: {
      generator: String(defaults.generator || DEFAULT_GENERATOR),
      reviewer: String(defaults.reviewer || DEFAULT_REVIEWER),
      maxOutputTokens: numberOr(defaults.maxOutputTokens, DEFAULT_OUTPUT_TOKENS),
      concurrency: Math.max(1, Math.min(8, numberOr(defaults.concurrency, 3)))
    },
    tasks: parsed.tasks.map((task, index) => normalizeTask(task, index, defaults))
  };

  validateUniqueTaskIds(plan.tasks);
  validateDependencies(plan.tasks);
  return plan;
}

export function createExecutionBatches(tasks) {
  const remaining = new Map(tasks.map((task) => [task.id, task]));
  const completed = new Set();
  const batches = [];

  while (remaining.size > 0) {
    const ready = [];
    for (const task of remaining.values()) {
      if (task.dependsOn.every((id) => completed.has(id))) ready.push(task);
    }
    if (ready.length === 0) {
      throw new Error("Dependency cycle detected");
    }
    batches.push(ready);
    for (const task of ready) {
      remaining.delete(task.id);
      completed.add(task.id);
    }
  }

  return batches;
}

export function estimatePlanCost(plan, modelPrices = new Map()) {
  let totalUsd = 0;
  const tasks = [];

  for (const task of plan.tasks) {
    const promptTokens = estimateTokens([
      plan.projectName,
      plan.stack,
      task.instruction,
      task.dependsOn.join("\n")
    ].join("\n"));
    const outputTokens = task.maxOutputTokens;
    const prices = modelPrices.get(task.generator) || { inputPrice: 0, outputPrice: 0 };
    const estimatedUsd = promptTokens * prices.inputPrice + outputTokens * prices.outputPrice;
    totalUsd += estimatedUsd;
    tasks.push({
      id: task.id,
      path: task.path,
      generator: task.generator,
      promptTokens,
      outputTokens,
      estimatedUsd
    });
  }

  return {
    budgetUsd: plan.budgetUsd,
    totalUsd,
    overBudget: totalUsd > plan.budgetUsd,
    tasks
  };
}

export function modelPriceMap(models) {
  return new Map(models.map((model) => [
    model.id,
    {
      inputPrice: Number(model.inputPrice || 0),
      outputPrice: Number(model.outputPrice || 0)
    }
  ]));
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function normalizeTask(task, index, defaults) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new Error(`Task ${index + 1} must be an object`);
  }
  if (!task.path) {
    throw new Error(`Task ${index + 1} is missing path`);
  }
  const instruction = task.instruction || task.prompt || task.description;
  if (!instruction) {
    throw new Error(`Task ${index + 1} is missing instruction`);
  }

  return {
    id: String(task.id || `task-${index + 1}`),
    path: cleanOutputPath(task.path),
    instruction: String(instruction),
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
    generator: String(task.generator || defaults.generator || DEFAULT_GENERATOR),
    reviewer: String(task.reviewer || defaults.reviewer || DEFAULT_REVIEWER),
    maxOutputTokens: numberOr(task.maxOutputTokens, numberOr(defaults.maxOutputTokens, DEFAULT_OUTPUT_TOKENS))
  };
}

function cleanOutputPath(path) {
  const value = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || value.includes("..")) {
    throw new Error(`Unsafe output path: ${path}`);
  }
  return value;
}

function validateUniqueTaskIds(tasks) {
  const seen = new Set();
  for (const task of tasks) {
    if (seen.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    seen.add(task.id);
  }
}

function validateDependencies(tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Task ${task.id} depends on unknown task: ${dependency}`);
      }
    }
  }
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
