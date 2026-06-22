import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, fetchOpenRouterModels } from "./src/openrouter.js";
import { executeBuildPlan } from "./src/executor.js";
import { estimatePlanCost, modelPriceMap, parseBuildPlan, createExecutionBatches } from "./src/plan.js";
import { writeBuildOutput } from "./src/output.js";
import { ApiError, applyBudgetOverride, planInputFromBody, readJsonBody, rejectSamplePlan, requestEnv, requireApiKey } from "./src/api.js";
import { createPlanFromPrompt } from "./src/prompt-planner.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const env = await loadEnv(join(rootDir, ".env"));
const port = Number(env.PORT || 3470);
const host = env.HOST || "127.0.0.1";
const jobs = new Map();
const FALLBACK_PRICES = new Map([
  ["deepseek/deepseek-v4-pro", { inputPrice: 0.000000435, outputPrice: 0.00000087 }],
  ["deepseek/deepseek-v4-flash", { inputPrice: 0.00000009, outputPrice: 0.00000018 }],
  ["qwen/qwen3-coder-flash", { inputPrice: 0.000000195, outputPrice: 0.000000975 }],
  ["qwen/qwen3-coder", { inputPrice: 0.00000022, outputPrice: 0.0000018 }],
  ["moonshotai/kimi-k2.7-code", { inputPrice: 0.000000612, outputPrice: 0.000003069 }]
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendSse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      const models = await fetchOpenRouterModels(env);
      sendJson(res, 200, { ok: true, models });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dry-run") {
      const body = await readJsonBody(req);
      const plan = rejectSamplePlan(applyBudgetOverride(parseBuildPlan(planInputFromBody(body)), body));
      const prices = await getModelPrices();
      const estimate = estimatePlanCost(plan, prices.prices);
      sendJson(res, 200, {
        ok: true,
        plan,
        batches: createExecutionBatches(plan.tasks).map((batch) => batch.map((task) => task.id)),
        estimate,
        priceSource: prices.source,
        warning: prices.warning
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/plan") {
      const body = await readJsonBody(req);
      const envForRequest = requestEnv(env, body);
      requireApiKey(envForRequest);
      const result = await createPlanFromPrompt(envForRequest, {
        prompt: body.prompt,
        budgetUsd: body.budgetUsd,
        maxReviewRounds: body.maxReviewRounds,
        useKimi: body.useKimi
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/builds") {
      const body = await readJsonBody(req);
      const envForRequest = requestEnv(env, body);
      requireApiKey(envForRequest);
      const plan = rejectSamplePlan(applyBudgetOverride(parseBuildPlan(planInputFromBody(body)), body));
      const prices = await getModelPrices();
      const estimate = estimatePlanCost(plan, prices.prices);
      if (estimate.overBudget) {
        sendJson(res, 400, { ok: false, error: "Dry-run estimate exceeds budget cap", estimate, priceSource: prices.source });
        return;
      }
      const job = createJob(plan, estimate, envForRequest);
      sendJson(res, 202, { ok: true, jobId: job.id, estimate });
      runBuildJob(job).catch((error) => {
        pushJobEvent(job, { type: "error", error: error.message });
        finishJob(job, "error");
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/builds/latest") {
      const latest = await latestBuild();
      sendJson(res, 200, { ok: true, build: latest });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/builds/latest/download") {
      const latest = await latestBuild();
      if (!latest) {
        sendJson(res, 404, { ok: false, error: "No build zip found" });
        return;
      }
      await sendZip(res, latest.zipPath, `${latest.runId}.zip`);
      return;
    }

    const eventsMatch = url.pathname.match(/^\/api\/builds\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      const job = jobs.get(eventsMatch[1]);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "Build job not found" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      for (const event of job.events) sendSse(res, event);
      job.clients.add(res);
      req.on("close", () => job.clients.delete(res));
      return;
    }

    const downloadMatch = url.pathname.match(/^\/api\/builds\/([^/]+)\/download$/);
    if (req.method === "GET" && downloadMatch) {
      const job = jobs.get(downloadMatch[1]);
      if (!job?.result?.zipPath) {
        sendJson(res, 404, { ok: false, error: "Build zip not ready" });
        return;
      }
      await sendZip(res, job.result.zipPath, `${job.result.runId}.zip`);
      return;
    }

    const runDownloadMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/download$/);
    if (req.method === "GET" && runDownloadMatch) {
      const build = await buildByRunId(runDownloadMatch[1]);
      if (!build) {
        sendJson(res, 404, { ok: false, error: "Build zip not found" });
        return;
      }
      await sendZip(res, build.zipPath, `${build.runId}.zip`);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    sendJson(res, status, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Model Router Coder listening on http://${host}:${port}`);
});

function createJob(plan, estimate, jobEnv) {
  const job = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    plan,
    estimate,
    events: [],
    clients: new Set(),
    result: null,
    env: jobEnv
  };
  jobs.set(job.id, job);
  pushJobEvent(job, { type: "queued", jobId: job.id, estimate });
  return job;
}

async function runBuildJob(job) {
  job.status = "running";
  pushJobEvent(job, { type: "running", jobId: job.id });
  const outputs = await executeBuildPlan(job.plan, job.env, {
    onEvent: (event) => pushJobEvent(job, event)
  });
  const result = await writeBuildOutput(rootDir, job.plan, outputs, job.events);
  job.result = result;
  pushJobEvent(job, { type: "package:ready", result });
  finishJob(job, "done");
}

function pushJobEvent(job, event) {
  const stamped = { ...event, at: new Date().toISOString() };
  job.events.push(stamped);
  for (const client of [...job.clients]) {
    try {
      sendSse(client, stamped);
    } catch {
      job.clients.delete(client);
    }
  }
}

function finishJob(job, status) {
  job.status = status;
  pushJobEvent(job, { type: status, jobId: job.id });
  for (const client of job.clients) {
    client.end();
  }
  job.clients.clear();
}

async function getModelPrices() {
  try {
    const models = await withTimeout(fetchOpenRouterModels(env), 3000, "OpenRouter price fetch timed out");
    return { prices: modelPriceMap(models), source: "openrouter" };
  } catch (error) {
    return {
      prices: FALLBACK_PRICES,
      source: "fallback",
      warning: `Could not fetch live OpenRouter prices. Used built-in fallback prices. ${error.message}`
    };
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendZip(res, zipPath, filename) {
  const file = await readFile(zipPath);
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-length": file.length,
    "content-disposition": `attachment; filename="${filename}"`
  });
  res.end(file);
}

async function latestBuild() {
  const builds = await listBuilds();
  return builds[0] || null;
}

async function buildByRunId(runId) {
  const safeRunId = basename(String(runId || ""));
  if (!safeRunId || safeRunId !== runId) return null;
  return (await listBuilds()).find((build) => build.runId === safeRunId) || null;
}

async function listBuilds() {
  const runsDir = join(rootDir, "runs");
  let entries = [];
  try {
    entries = await readdir(runsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const builds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    const runDir = join(runsDir, runId);
    const zipName = `${runId.replace(/^\d{8}-\d{6}-/, "")}.zip`;
    const guessedZip = join(runDir, zipName);
    const zipPath = await firstExistingZip(runDir, guessedZip);
    if (!zipPath) continue;
    const info = await stat(zipPath);
    builds.push({
      runId,
      zipPath,
      size: info.size,
      createdAt: info.mtime.toISOString(),
      downloadUrl: `/api/runs/${encodeURIComponent(runId)}/download`
    });
  }
  builds.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return builds;
}

async function firstExistingZip(runDir, guessedZip) {
  try {
    await stat(guessedZip);
    return guessedZip;
  } catch {
    const entries = await readdir(runDir, { withFileTypes: true });
    const zip = entries.find((entry) => entry.isFile() && entry.name.endsWith(".zip"));
    return zip ? join(runDir, zip.name) : null;
  }
}
