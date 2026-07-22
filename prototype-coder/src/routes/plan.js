const { Router } = require('express');
const { CONVERSION_MODEL, DEFAULTS, SPEC_DEFAULTS } = require('../config');
const { validatePlan } = require('../utils/planValidator');
const { estimatePlan } = require('../utils/estimator');
const { conversionMessages } = require('../utils/prompts');
const { validateModels } = require('../utils/modelFuzzy');

const router = Router();

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

router.post('/convert', async (req, res) => {
  const { apiKey, prompt, mode = 'prototype' } = req.body;
  if (!apiKey || !prompt) {
    return res.status(400).json({ error: 'apiKey and prompt are required' });
  }

  const convModel = CONVERSION_MODEL[mode] || CONVERSION_MODEL.prototype;

  try {
    const client = req.app.locals.createOpenRouter(apiKey);
    const result = await client.complete({
      model: convModel,
      messages: conversionMessages(prompt),
      temperature: 0.2,
      max_tokens: 8000
    });

    const plan = extractJson(result.content);
    if (!plan) throw new Error('model did not return valid JSON');

    const validation = validatePlan(plan);
    if (!validation.valid) {
      throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    }

    res.json({ plan: validation.plan });
  } catch (err) {
    res.status(400).json({
      error: 'OpenRouter conversion failed',
      model: convModel,
      details: err.message
    });
  }
});

router.post('/dry-run', (req, res) => {
  const { plan, mode = 'prototype' } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });

  const validation = validatePlan(plan, mode);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Plan validation failed', issues: validation.errors });
  }

  const validated = validation.plan;
  const estimate = estimatePlan(validated);

  const modelCache = req.app.locals.getModelCache ? req.app.locals.getModelCache() : [];
  let modelWarnings = [];
  if (modelCache.length > 0) {
    const usedIds = [
      validated.defaults?.generator,
      validated.defaults?.reviewer,
      ...validated.tasks.flatMap(t => [t.generator, t.reviewer])
    ].filter(Boolean);

    const corrections = validateModels(usedIds, modelCache);
    for (const [original, match] of Object.entries(corrections)) {
      if (!match) {
        modelWarnings.push({ original, suggestion: null, message: `"${original}" not found on OpenRouter — no close match` });
      } else {
        modelWarnings.push({ original, suggestion: match.id, message: `"${original}" → suggested "${match.id}"` });
      }
    }
  }

  res.json({ valid: true, plan: validated, estimate, modelWarnings });
});

module.exports = router;
