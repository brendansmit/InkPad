import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, fetchOpenRouterModels } from "./src/openrouter.js";
import { executeBuildPlan } from "./src/executor.js";
import { estimatePlanCost, modelPriceMap, parseBuildPlan, createExecutionBatches } from "./src/plan.js";
import { writeBuildOutput } from "./src/output.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const env = await loadEnv(join(rootDir, ".env"));
const port = Number(env.PORT || 3470);
const host = env.HOST || "127.0.0.1";
const jobs = new Map();

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

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
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
      const plan = parseBuildPlan(body.planText || body.plan);
      if (body.budgetUsd) plan.budgetUsd = Number(body.budgetUsd);
      const models = await fetchOpenRouterModels(env);
      const estimate = estimatePlanCost(plan, modelPriceMap(models));
      sendJson(res, 200, {
        ok: true,
        plan,
        batches: createExecutionBatches(plan.tasks).map((batch) => batch.map((task) => task.id)),
        estimate
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/builds") {
      const body = await readJsonBody(req);
      const plan = parseBuildPlan(body.planText || body.plan);
      if (body.budgetUsd) plan.budgetUsd = Number(body.budgetUsd);
      const models = await fetchOpenRouterModels(env);
      const estimate = estimatePlanCost(plan, modelPriceMap(models));
      if (estimate.overBudget) {
        sendJson(res, 400, { ok: false, error: "Dry-run estimate exceeds budget cap", estimate });
        return;
      }
      const job = createJob(plan, estimate);
      sendJson(res, 202, { ok: true, jobId: job.id, estimate });
      runBuildJob(job).catch((error) => {
        pushJobEvent(job, { type: "error", error: error.message });
        finishJob(job, "error");
      });
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
      const file = await readFile(job.result.zipPath);
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${job.result.runId}.zip"`
      });
      res.end(file);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Model Router Coder listening on http://${host}:${port}`);
});

function createJob(plan, estimate) {
  const job = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    plan,
    estimate,
    events: [],
    clients: new Set(),
    result: null
  };
  jobs.set(job.id, job);
  pushJobEvent(job, { type: "queued", jobId: job.id, estimate });
  return job;
}

async function runBuildJob(job) {
  job.status = "running";
  pushJobEvent(job, { type: "running", jobId: job.id });
  const outputs = await executeBuildPlan(job.plan, env, {
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
  for (const client of job.clients) {
    sendSse(client, stamped);
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
