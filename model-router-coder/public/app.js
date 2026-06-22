const modelButton = document.querySelector("#load-models");
const dryRunButton = document.querySelector("#dry-run");
const buildButton = document.querySelector("#build");
const downloadLink = document.querySelector("#download");
const planInput = document.querySelector("#plan");
const budgetInput = document.querySelector("#budget");
const estimateBox = document.querySelector("#estimate");
const statusBox = document.querySelector("#status");

planInput.value = JSON.stringify({
  projectName: "Example App",
  stack: "Node, plain HTML, CSS",
  budgetUsd: 4,
  defaults: {
    generator: "deepseek/deepseek-v4-pro",
    reviewer: "qwen/qwen3-coder-flash",
    maxReviewRounds: 2,
    concurrency: 3
  },
  tasks: [
    {
      id: "package",
      path: "package.json",
      instruction: "Create a minimal package.json with start and check scripts."
    },
    {
      id: "server",
      path: "server.js",
      dependsOn: ["package"],
      instruction: "Create a small HTTP server that serves a health endpoint and static files."
    },
    {
      id: "home",
      path: "public/index.html",
      dependsOn: ["server"],
      instruction: "Create the main app UI."
    }
  ]
}, null, 2);

modelButton.addEventListener("click", async () => {
  modelButton.disabled = true;
  statusBox.textContent = "Loading models...";
  try {
    const response = await fetch("/api/models");
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Unknown error");
    const useful = body.models
      .filter((model) => /deepseek|qwen|kimi/i.test(model.id))
      .slice(0, 20)
      .map((model) => `${model.id} | in ${price(model.inputPrice)} | out ${price(model.outputPrice)}`)
      .join("\n");
    statusBox.textContent = useful || "No matching models found.";
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  } finally {
    modelButton.disabled = false;
  }
});

dryRunButton.addEventListener("click", async () => {
  await dryRun();
});

buildButton.addEventListener("click", async () => {
  downloadLink.hidden = true;
  buildButton.disabled = true;
  statusBox.textContent = "Creating build job...";
  try {
    const response = await postJson("/api/builds", buildPayload());
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Build request failed");
    estimateBox.textContent = formatEstimate(body.estimate);
    watchJob(body.jobId);
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
    buildButton.disabled = false;
  }
});

async function dryRun() {
  dryRunButton.disabled = true;
  estimateBox.textContent = "Estimating...";
  try {
    const response = await postJson("/api/dry-run", buildPayload());
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Dry run failed");
    estimateBox.textContent = formatEstimate(body.estimate);
    statusBox.textContent = `Batches:\n${body.batches.map((batch, index) => `${index + 1}: ${batch.join(", ")}`).join("\n")}`;
  } catch (error) {
    estimateBox.textContent = `Error: ${error.message}`;
  } finally {
    dryRunButton.disabled = false;
  }
}

function watchJob(jobId) {
  const events = new EventSource(`/api/builds/${jobId}/events`);
  const lines = [];
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    lines.push(formatEvent(event));
    statusBox.textContent = lines.join("\n");
    statusBox.scrollTop = statusBox.scrollHeight;
    if (event.type === "package:ready") {
      downloadLink.href = `/api/builds/${jobId}/download`;
      downloadLink.hidden = false;
    }
    if (event.type === "done" || event.type === "error") {
      events.close();
      buildButton.disabled = false;
    }
  };
  events.onerror = () => {
    lines.push("SSE connection closed.");
    statusBox.textContent = lines.join("\n");
    events.close();
    buildButton.disabled = false;
  };
}

function buildPayload() {
  return {
    planText: planInput.value,
    budgetUsd: Number(budgetInput.value || 4)
  };
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function formatEstimate(estimate) {
  return [
    `Budget: $${estimate.budgetUsd.toFixed(2)}`,
    `Estimated: $${estimate.totalUsd.toFixed(4)}`,
    `Over budget: ${estimate.overBudget ? "yes" : "no"}`,
    "",
    ...estimate.tasks.map((task) => `${task.id} -> ${task.generator} | $${task.estimatedUsd.toFixed(4)}`)
  ].join("\n");
}

function formatEvent(event) {
  const prefix = event.at ? event.at.slice(11, 19) : "--:--:--";
  if (event.type === "task:start") return `${prefix} start ${event.taskId} (${event.model})`;
  if (event.type === "task:done") return `${prefix} done ${event.taskId}`;
  if (event.type === "review:start") return `${prefix} review ${event.taskId} round ${event.round} (${event.reviewer})`;
  if (event.type === "review:done") return `${prefix} review ${event.taskId}: ${event.approved ? "approved" : `${event.issues} issues`}`;
  if (event.type === "repair:start") return `${prefix} repair ${event.taskId} round ${event.round}`;
  if (event.type === "package:ready") return `${prefix} package ready`;
  if (event.type === "error") return `${prefix} error: ${event.error}`;
  return `${prefix} ${event.type}`;
}

function price(raw) {
  return `$${(raw * 1_000_000).toFixed(3)}/M`;
}
