const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

let mockClient;

function mockOpenRouterFactory() {
  return mockClient;
}

function buildApp(packageBuild) {
  const { createApp } = require('../src/server');
  return createApp({
    createOpenRouter: mockOpenRouterFactory,
    packageBuild
  });
}

function mockBuildSuccess() {
  mockClient.complete.mockImplementation(({ messages }) => {
    const text = messages.map((m) => m.content).join('\n');
    if (text.includes('review') || text.includes('Review')) {
      return Promise.resolve({
        content: JSON.stringify({ passed: true, issues: [] }),
        usage: { prompt_tokens: 5, completion_tokens: 5 }
      });
    }
    return Promise.resolve({
      content: 'console.log("hello");',
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    });
  });
}

function makePlan() {
  return {
    projectName: 'Demo App',
    stack: 'node',
    budgetUsd: 4,
    defaults: {},
    tasks: [
      {
        id: 't1',
        path: 'app.js',
        instruction: 'Create a tiny Express app',
        dependsOn: []
      }
    ]
  };
}

async function waitForTerminal(manager, jobId) {
  for (let i = 0; i < 100; i++) {
    const job = manager.getJob(jobId);
    if (job.state === 'ready' || job.state === 'failed') return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for terminal state');
}

beforeEach(() => {
  jest.resetModules();
  mockClient = {
    test: jest.fn(),
    complete: jest.fn()
  };
});

describe('OpenRouter connection', () => {
  test('success reports connected and list reachable', async () => {
    mockClient.test.mockResolvedValue({ connected: true, listReachable: true });
    const app = buildApp();
    const res = await request(app).post('/api/openrouter/test').send({ apiKey: 'key' });
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.listReachable).toBe(true);
  });

  test('failure reports error and status code', async () => {
    mockClient.test.mockResolvedValue({
      connected: false,
      listReachable: false,
      errorMessage: 'Unauthorized',
      statusCode: 401,
      bodyExcerpt: 'invalid key'
    });
    const app = buildApp();
    const res = await request(app).post('/api/openrouter/test').send({ apiKey: 'bad' });
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.statusCode).toBe(401);
  });
});

describe('Plan conversion', () => {
  test('prompt conversion produces a valid task array', async () => {
    mockClient.complete.mockResolvedValue({
      content: JSON.stringify(makePlan()),
      usage: { prompt_tokens: 20, completion_tokens: 40 }
    });
    const app = buildApp();
    const res = await request(app)
      .post('/api/plan/convert')
      .send({ apiKey: 'k', prompt: 'build a demo app' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plan.tasks)).toBe(true);
    expect(res.body.plan.tasks[0]).toHaveProperty('path');
  });
});

describe('Plan dry run', () => {
  test('rejects invalid plans', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/plan/dry-run')
      .send({ plan: { projectName: 'x', tasks: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Plan validation failed');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  test('replaces same-family reviewer', async () => {
    const plan = makePlan();
    plan.tasks[0].generator = 'deepseek/deepseek-chat';
    plan.tasks[0].reviewer = 'deepseek/deepseek-coder';
    const app = buildApp();
    const res = await request(app).post('/api/plan/dry-run').send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.plan.tasks[0].reviewer).not.toMatch(/^deepseek\//);
  });
});

describe('Build pipeline', () => {
  test('failed packaging does not show download', async () => {
    mockBuildSuccess();
    const app = buildApp(() => Promise.reject(new Error('boom')));
    const manager = app.locals.manager;
    const res = await request(app)
      .post('/api/builds')
      .send({ apiKey: 'k', plan: makePlan() });
    const job = await waitForTerminal(manager, res.body.jobId);
    expect(job.state).toBe('failed');
    expect(job.getStatus().downloadUrl).toBeNull();
    const dl = await request(app).get(`/api/builds/${job.id}/download`);
    expect(dl.status).toBe(404);
  });

  test('missing zip blocks ready state', async () => {
    mockBuildSuccess();
    const app = buildApp(() => Promise.resolve('/does/not/exist.zip'));
    const manager = app.locals.manager;
    const res = await request(app)
      .post('/api/builds')
      .send({ apiKey: 'k', plan: makePlan() });
    const job = await waitForTerminal(manager, res.body.jobId);
    expect(job.state).toBe('failed');
    expect(job.getStatus().downloadUrl).toBeNull();
  });

  test('package:ready reveals download url', async () => {
    mockBuildSuccess();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-test-'));
    const zip = path.join(tmp, 'build.zip');
    fs.writeFileSync(zip, 'PK');
    const app = buildApp(() => Promise.resolve(zip));
    const manager = app.locals.manager;
    const res = await request(app)
      .post('/api/builds')
      .send({ apiKey: 'k', plan: makePlan() });
    const job = await waitForTerminal(manager, res.body.jobId);
    const ev = job.events.find((e) => e.type === 'package:ready');
    expect(ev).toBeTruthy();
    expect(ev.payload.downloadUrl).toBe(`/api/builds/${job.id}/download`);
  });

  test('job:ready downloadUrl matches job id', async () => {
    mockBuildSuccess();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-test-'));
    const zip = path.join(tmp, 'build.zip');
    fs.writeFileSync(zip, 'PK');
    const app = buildApp(() => Promise.resolve(zip));
    const manager = app.locals.manager;
    const res = await request(app)
      .post('/api/builds')
      .send({ apiKey: 'k', plan: makePlan() });
    const jobId = res.body.jobId;
    const job = await waitForTerminal(manager, jobId);
    expect(job.getStatus().downloadUrl).toBe(`/api/builds/${jobId}/download`);
  });

  test('unknown job id returns 404', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/builds/nonexistent-id');
    expect(res.status).toBe(404);
  });
});
