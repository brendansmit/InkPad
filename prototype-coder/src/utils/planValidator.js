const { z } = require('zod');
const { DEFAULTS } = require('../config');
const { resolveTaskModels } = require('./modelRouter');

const taskSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  instruction: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  generator: z.string().optional(),
  reviewer: z.string().optional(),
  maxOutputTokens: z.number().int().min(1).max(128000).default(8192)
});

const planSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().optional(),
  stack: z.union([z.string(), z.array(z.string())]).optional(),
  budgetUsd: z.number().positive().default(DEFAULTS.budgetUsd),
  defaults: z
    .object({
      generator: z.string().optional(),
      fastGenerator: z.string().optional(),
      hardGenerator: z.string().optional(),
      reviewer: z.string().optional(),
      temperature: z.number().optional(),
      concurrency: z.number().int().min(1).max(10).optional(),
      reviewRounds: z.number().int().min(2).max(5).optional(),
      retries: z.number().int().min(0).max(5).optional()
    })
    .default({}),
  tasks: z.array(taskSchema).min(1)
});

function validatePlan(raw) {
  const result = planSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
      taskId: i.path[1] || null
    }));
    return { valid: false, errors };
  }

  const plan = result.data;
  const ids = new Set();
  for (const t of plan.tasks) {
    if (ids.has(t.id)) {
      return {
        valid: false,
        errors: [{ path: `tasks.${t.id}.id`, message: 'duplicate task id', taskId: t.id }]
      };
    }
    ids.add(t.id);
  }

  for (const t of plan.tasks) {
    for (const d of t.dependsOn) {
      if (!ids.has(d)) {
        return {
          valid: false,
          errors: [{ path: `tasks.${t.id}.dependsOn`, message: `dependency ${d} not found`, taskId: t.id }]
        };
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));

  function visit(tid) {
    if (visiting.has(tid)) return false;
    if (visited.has(tid)) return true;
    visiting.add(tid);
    for (const d of byId.get(tid).dependsOn) {
      if (!visit(d)) return false;
    }
    visiting.delete(tid);
    visited.add(tid);
    return true;
  }

  for (const t of plan.tasks) {
    if (!visit(t.id)) {
      return {
        valid: false,
        errors: [{ path: 'tasks', message: 'cyclic dependency detected', taskId: t.id }]
      };
    }
  }

  // Strip placeholder model IDs from plan.defaults before merging
  const planDefaults = Object.fromEntries(
    Object.entries(plan.defaults || {}).filter(([k, v]) =>
      !['generator','fastGenerator','hardGenerator','reviewer'].includes(k) || (v && v.includes('/'))
    )
  );
  const defaults = { ...DEFAULTS, ...planDefaults };
  const correctedTasks = plan.tasks.map((t) => {
    const models = resolveTaskModels(t, defaults, {});
    return { ...t, ...models };
  });

  return { valid: true, plan: { ...plan, defaults, tasks: correctedTasks } };
}

module.exports = { validatePlan };
