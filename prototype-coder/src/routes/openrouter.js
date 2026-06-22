const { Router } = require('express');
const router = Router();

router.post('/test', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
  const client = req.app.locals.createOpenRouter(apiKey);
  const result = await client.test();
  res.json(result);
});

module.exports = router;
