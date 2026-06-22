const fs = require('fs');
const pLimit = require('p-limit');
const { DEFAULTS } = require('../config');
const { resolveTaskModels } = require('../utils/modelRouter');
const { price, estimatePlan } = require('../utils/estimator');
const { generationMessages, reviewMessages, repairMessages } = require('../utils/prompts');

function topoSort(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set();
  const visited = new Set();
  const order = [];

  function visit(t) {
    if (visited.has(t.id)) return;
    if (visiting.has(t.id)) throw new Error('cyclic dependency detected');
    visiting.add(t.id);
    for (const d of t.dependsOn) visit(byId.get(d));
    visiting.delete(t.id);
    visited.add(t.id);
    order.push(t);
  }

  for (const t of tasks) visit(t);
  return order;
}

function checkBudget(job, budget) {
  if (job.costUsd >= budget) {
    throw new Error(`Budget cap $${budget} exceeded`);
  }
}

function trackUsage(job, usage, model) {
  const p = usage?.prompt_tokens ?? 0;
  const c = usage?.completion_tokens ?? 0;
  job.tokens.prompt += p;
  job.tokens.completion += c;
  job.costUsd += p * price(model).input + c * price(model).output;
}

function extractJson(text) {
  const idx = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (idx === -1 || last === -1 || last < idx) return null;
  try {
    return JSON.parse(text.slice(idx, last + 1));
  } catch {
    return null;
  }
}

async function generateFile(client, task, generator, defaults, deps) {
  return client.complete({
    model: generator,
    messages: generationMessages(task, deps),
    temperature: defaults.temperature ?? DEFAULTS.temperature,
    max_tokens: task.maxOutputTokens
  });
}

async function reviewFile(client, task, content, reviewer) {
  const res = await client.complete({
    model: reviewer,
    messages: reviewMessages(task, content),
    temperature: 0.1,
    max_tokens: 2048,
    response_format: { type: 'json_object' }
  });
  const parsed = extractJson(res.content) || {};
  return {
    passed: !!parsed.passed,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    usage: res.usage
  };
}

async function repairFile(client, task, content, issues, repairer, defaults) {
  return client.complete({
    model: repairer,
    messages: repairMessages(task, content, issues),
    temperature: defaults.temperature ?? DEFAULTS.temperature,
    max_tokens: task.maxOutputTokens
  });
}

async function runJob(job, deps) {
  const { createOpenRouter, packageBuild } = deps;
  const client = createOpenRouter(job.apiKey);
  const defaults = { ...DEFAULTS, ...(job.plan.defaults || {}), ...(job.options || {}) };
  const budget = job.plan.budgetUsd || defaults.budgetUsd;
  const allowPartial = !!job.options.allowPartial;

  job.transition('running');
  job.emit('job:running');

  try {
    job.transition('planning');
    job.emit('plan:created', {
      projectName: job.plan.projectName,
      taskCount: job.plan.tasks.length
    });

    job.transition('estimating');
    const estimate = estimatePlan(job.plan);
    job.emit('estimate:ready', estimate);
    if (estimate.totalUsd > budget) {
      throw new Error(`Estimated cost $${estimate.totalUsd} exceeds budget $${budget}`);
    }

    const order = topoSort(job.plan.tasks);
    const completedOutputs = new Map();
    const limit = pLimit(defaults.concurrency || 2);

    job.transition('generating');
    const genPromises = new Map();

    async function generateTask(t) {
      job.emit('task:start', { taskId: t.id, path: t.path });
      for (const d of t.dependsOn) {
        if (genPromises.has(d)) await genPromises.get(d);
      }

      const deps = t.dependsOn.map((id) => completedOutputs.get(id)).filter(Boolean);
      const models = resolveTaskModels(t, defaults, {});

      try {
        checkBudget(job, budget);
        const res = await generateFile(client, t, models.generator, defaults, deps);
        trackUsage(job, res.usage, models.generator);
        completedOutputs.set(t.id, { path: t.path, content: res.content });
        job.addOutput(t.id, { path: t.path, content: res.content, model: models.generator });
        job.emit('task:generated', { taskId: t.id, path: t.path, model: models.generator });
      } catch (err) {
        job.emit('task:failed', { taskId: t.id, error: err.message });
        if (!allowPartial) throw err;
      }
    }

    for (const t of order) {
      genPromises.set(t.id, limit(() => generateTask(t)));
    }
    await Promise.all(genPromises.values());

    job.emit('generation:done', { generated: job.outputs.size });

    if (job.outputs.size === 0) {
      throw new Error('all tasks failed — no files were generated');
    }

    const reviewLimit = pLimit(defaults.concurrency || 2);
    const rounds = defaults.reviewRounds ?? DEFAULTS.reviewRounds;

    async function reviewTask(t) {
      if (!job.outputs.has(t.id)) return;
      const models = resolveTaskModels(t, defaults, {});
      let content = job.outputs.get(t.id).content;

      for (let r = 0; r < rounds; r++) {
        job.transition('reviewing');
        job.emit('review:start', { taskId: t.id, round: r + 1, model: models.reviewer });

        let review;
        try {
          checkBudget(job, budget);
          review = await reviewFile(client, t, content, models.reviewer);
          trackUsage(job, review.usage, models.reviewer);
        } catch (err) {
          job.issues.push({ taskId: t.id, message: `Review error (round ${r + 1}): ${err.message}` });
          job.emit('review:error', { taskId: t.id, round: r + 1, error: err.message });
          return;
        }

        if (review.passed) {
          job.emit('review:passed', { taskId: t.id, round: r + 1 });
          return;
        }

        job.emit('review:failed', { taskId: t.id, round: r + 1, issues: review.issues });

        if (r < rounds - 1) {
          job.transition('repairing');
          job.emit('repair:start', { taskId: t.id, round: r + 1, model: models.repairer });
          try {
            checkBudget(job, budget);
            const repaired = await repairFile(client, t, content, review.issues, models.repairer, defaults);
            trackUsage(job, repaired.usage, models.repairer);
            content = repaired.content;
            job.addOutput(t.id, { path: t.path, content, model: models.repairer });
            job.emit('repair:done', { taskId: t.id, round: r + 1 });
          } catch (err) {
            job.issues.push({ taskId: t.id, message: `Repair error (round ${r + 1}): ${err.message}` });
            job.emit('repair:error', { taskId: t.id, round: r + 1, error: err.message });
            return;
          }
        }
      }

      job.issues.push({ taskId: t.id, message: `Review did not pass after ${rounds} round(s)` });
    }

    await Promise.all(order.map((t) => reviewLimit(() => reviewTask(t))));

    job.transition('packaging');
    job.emit('package:start', { fileCount: job.outputs.size });

    const zipPath = await packageBuild(job);
    job.zipPath = zipPath;

    if (!zipPath || !fs.existsSync(zipPath)) {
      throw new Error('packaging did not produce a zip');
    }

    const downloadUrl = `/api/builds/${job.id}/download`;
    job.emit('package:ready', { downloadUrl, zipPath });

    job.transition('ready');
    job.emit('job:ready', { ...job.getStatus(), downloadUrl });
  } catch (err) {
    job.transition('failed');
    job.emit('job:failed', { message: err.message });
  }
}

module.exports = { runJob };
