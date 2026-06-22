const { Router } = require('express');
const router = Router();

router.post('/test', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
  const client = req.app.locals.createOpenRouter(apiKey);
  const result = await client.test();
  res.json(result);
});

// Makes a real tiny completion call so you can confirm a specific model
// is reachable from this server's network (not just the /models list).
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
    res.json({
      ok: false,
      model,
      status: err.status,
      message: err.message,
      detail: err.error || null
    });
  }
});

module.exports = router;
