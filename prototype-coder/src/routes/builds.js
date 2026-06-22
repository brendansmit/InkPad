const { Router } = require('express');
const fs = require('fs');

const router = Router();

router.post('/', (req, res) => {
  const { apiKey, plan, options = {} } = req.body;
  if (!apiKey || !plan) {
    return res.status(400).json({ error: 'apiKey and plan are required' });
  }
  const job = req.app.locals.manager.createJob({ plan, apiKey, options });
  res.json({ jobId: job.id, runId: job.runId, state: job.state });
});

router.get('/:jobId', (req, res) => {
  const job = req.app.locals.manager.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job.getStatus());
});

router.get('/:jobId/events', (req, res) => {
  const job = req.app.locals.manager.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);

  job.events.forEach(send);
  const off = job.onEvent(send);
  req.on('close', off);
});

router.get('/:jobId/download', (req, res) => {
  const job = req.app.locals.manager.getJob(req.params.jobId);
  if (!job || job.state !== 'ready' || !job.zipPath || !fs.existsSync(job.zipPath)) {
    return res.status(404).send('Zip missing for this job');
  }
  const filename = `${job.plan.projectName}-${job.id}.zip`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
  res.download(job.zipPath, filename);
});

module.exports = router;
