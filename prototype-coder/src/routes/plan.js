const { Router } = require('express');
const { CONVERSION_MODEL } = require('../config');
const { validatePlan } = require('../utils/planValidator');
const { estimatePlan } = require('../utils/estimator');
const { conversionMessages } = require('../utils/prompts');

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
  const { apiKey, prompt } = req.body;
  if (!apiKey || !prompt) {
    return res.status(400).json({ error: 'apiKey and prompt are required' });
  }

  try {
    const client = req.app.locals.createOpenRouter(apiKey);
    const result = await client.complete({
      model: CONVERSION_MODEL,
      messages: conversionMessages(prompt),
      temperature: 0.2,
      max_tokens: 32000,
      response_format: { type: 'json_object' }
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
      model: CONVERSION_MODEL,
      details: err.message
    });
  }
});

router.post('/dry-run', (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });

  const validation = validatePlan(plan);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Plan validation failed', issues: validation.errors });
  }

  const estimate = estimatePlan(validation.plan);
  res.json({ valid: true, plan: validation.plan, estimate });
});

module.exports = router;
