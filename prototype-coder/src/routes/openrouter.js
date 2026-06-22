const { Router } = require('express');
const router = Router();

// In-memory model cache — refreshed every time the connection is tested
let modelCache = [];

router.post('/test', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
  const client = req.app.locals.createOpenRouter(apiKey);
  const result = await client.test();
  if (result.connected && result.models?.length) {
    modelCache = result.models;
  }
  res.json({ connected: result.connected, listReachable: result.listReachable, modelCount: modelCache.length, errorMessage: result.errorMessage, statusCode: result.statusCode, bodyExcerpt: result.bodyExcerpt });
});

router.get('/models', (req, res) => {
  res.json({ models: modelCache });
});

// Real completion call to a specific model — used for diagnosing access issues
router.post('/probe', async (req, res) => {
  const { apiKey, model } = req.body;
  if (!apiKey || !model) return res.status(400).json({ error: 'apiKey and model are required' });
  const client = req.app.locals.createOpenRouter(apiKey);
  try {
    const result = await client.complete({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      max_tokens: 8
    });
    res.json({ ok: true, model, reply: result.content, usage: result.usage });
  } catch (err) {
    res.json({ ok: false, model, status: err.status, message: err.message, detail: err.error || null });
  }
});

module.exports = { router, getModelCache: () => modelCache };
