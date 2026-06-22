const express = require('express');
const path = require('path');
const { createOpenRouter } = require('./openrouter');
const { packageBuild } = require('./utils/packager');
const { JobManager } = require('./jobs/manager');

function createApp(deps = {}) {
  const _createOpenRouter = deps.createOpenRouter || createOpenRouter;
  const _packageBuild = deps.packageBuild || packageBuild;

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const manager = new JobManager({
    createOpenRouter: _createOpenRouter,
    packageBuild: _packageBuild
  });

  app.locals.manager = manager;
  app.locals.createOpenRouter = _createOpenRouter;

  const { router: openrouterRouter, getModelCache } = require('./routes/openrouter');
  app.use('/api/openrouter', openrouterRouter);
  app.locals.getModelCache = getModelCache;
  app.use('/api/plan', require('./routes/plan'));
  app.use('/api/builds', require('./routes/builds'));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
