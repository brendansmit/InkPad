const modelButton = document.querySelector("#load-models");
const convertButton = document.querySelector("#convert");
const dryRunButton = document.querySelector("#dry-run");
const buildButton = document.querySelector("#build");
const downloadLink = document.querySelector("#download");
const latestDownloadLink = document.querySelector("#latest-download");
const promptInput = document.querySelector("#prompt");
const planInput = document.querySelector("#plan");
const budgetInput = document.querySelector("#budget");
const apiKeyInput = document.querySelector("#api-key");
const reviewRoundsInput = document.querySelector("#review-rounds");
const useKimiInput = document.querySelector("#use-kimi");
const promptPanel = document.querySelector("#prompt-panel");
const jsonPanel = document.querySelector("#json-panel");
const promptTab = document.querySelector("#tab-prompt");
const jsonTab = document.querySelector("#tab-json");
const estimateBox = document.querySelector("#estimate");
const statusBox = document.querySelector("#status");
let planSource = "empty";

apiKeyInput.value = localStorage.getItem("model-router-openrouter-key") || "";
apiKeyInput.addEventListener("input", () => {
  localStorage.setItem("model-router-openrouter-key", apiKeyInput.value.trim());
});

promptInput.value = "";
planInput.value = "";
refreshLatestDownload();

promptTab.addEventListener("click", () => setMode("prompt"));
jsonTab.addEventListener("click", () => setMode("json"));
promptInput.addEventListener("input", () => {
  planSource = "stale";
});
planInput.addEventListener("input", () => {
  planSource = planInput.value.trim() ? "manual" : "empty";
});

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

convertButton.addEventListener("click", async () => {
  convertButton.disabled = true;
  statusBox.textContent = "Converting Claude prompt with DeepSeek V4 Flash...";
  try {
    requireApiKey();
    requirePrompt();
    const response = await postJson("/api/plan", {
      prompt: promptInput.value,
      budgetUsd: Number(budgetInput.value || 4),
      maxReviewRounds: Number(reviewRoundsInput.value || 2),
      useKimi: useKimiInput.checked,
      openRouterApiKey: apiKeyInput.value.trim()
    });
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Prompt conversion failed");
    planInput.value = JSON.stringify(body.plan, null, 2);
    planSource = "converted";
    setMode("json");
    statusBox.textContent = `Plan created with ${body.model}.\nTasks: ${body.plan.tasks.length}`;
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  } finally {
    convertButton.disabled = false;
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
    requireApiKey();
    requireUsablePlan();
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
    requireUsablePlan();
    const response = await postJson("/api/dry-run", buildPayload(false));
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Dry run failed");
    planInput.value = JSON.stringify(body.plan, null, 2);
    if (planSource === "manual") planSource = "manual";
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
  let finished = false;
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    lines.push(formatEvent(event));
    statusBox.textContent = lines.join("\n");
    statusBox.scrollTop = statusBox.scrollHeight;
    if (event.type === "package:ready") {
      showDownload(`/api/builds/${jobId}/download`, "Download zip");
      refreshLatestDownload();
    }
    if (event.type === "done" || event.type === "error") {
      finished = true;
      refreshLatestDownload();
      events.close();
      buildButton.disabled = false;
    }
  };
  events.onerror = () => {
    if (!finished) {
      lines.push("SSE connection closed. Use Download latest if the package finished.");
      statusBox.textContent = lines.join("\n");
      refreshLatestDownload();
    }
    events.close();
    buildButton.disabled = false;
  };
}

async function refreshLatestDownload() {
  try {
    const response = await fetch("/api/builds/latest");
    const body = await response.json();
    if (!body.ok || !body.build) return;
    latestDownloadLink.href = body.build.downloadUrl || "/api/builds/latest/download";
    latestDownloadLink.textContent = `Download latest (${body.build.runId})`;
    latestDownloadLink.hidden = false;
  } catch {
    latestDownloadLink.hidden = true;
  }
}

function showDownload(url, label) {
  downloadLink.href = url;
  downloadLink.textContent = label;
  downloadLink.hidden = false;
}

function buildPayload(includeKey = true) {
  const payload = {
    planText: planInput.value,
    budgetUsd: Number(budgetInput.value || 4)
  };
  if (includeKey) payload.openRouterApiKey = apiKeyInput.value.trim();
  return payload;
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function setMode(mode) {
  const promptMode = mode === "prompt";
  promptPanel.hidden = !promptMode;
  jsonPanel.hidden = promptMode;
  promptTab.classList.toggle("active", promptMode);
  jsonTab.classList.toggle("active", !promptMode);
}

function requireApiKey() {
  if (!apiKeyInput.value.trim()) {
    throw new Error("Paste your OpenRouter API key first");
  }
}

function requirePrompt() {
  if (!promptInput.value.trim()) {
    throw new Error("Paste the Claude build prompt first");
  }
}

function requireUsablePlan() {
  if (!planInput.value.trim()) {
    throw new Error("No task plan exists. Convert the Claude Prompt first or paste Advanced JSON.");
  }
  if (planSource === "stale") {
    throw new Error("Prompt changed after conversion. Convert the prompt again before dry run or build.");
  }
  const plan = parsePlanInput();
  if (isSamplePlan(plan)) {
    throw new Error("Refusing to build the removed sample plan. Convert your real prompt first.");
  }
}

function parsePlanInput() {
  try {
    return JSON.parse(planInput.value);
  } catch {
    throw new Error("Task plan JSON is invalid");
  }
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
  if (event.type === "review:failed") return `${prefix} review failed ${event.taskId}: ${event.error}`;
  if (event.type === "repair:start") return `${prefix} repair ${event.taskId} round ${event.round}`;
  if (event.type === "package:ready") return `${prefix} package ready`;
  if (event.type === "repair:failed") return `${prefix} repair failed ${event.taskId}: ${event.error}`;
  if (event.type === "error") return `${prefix} error: ${event.error}`;
  return `${prefix} ${event.type}`;
}

function price(raw) {
  return `$${(raw * 1_000_000).toFixed(3)}/M`;
}

function isSamplePlan(plan) {
  return plan?.projectName === "Example App" &&
    plan?.stack === "Node, plain HTML, CSS" &&
    Array.isArray(plan.tasks) &&
    plan.tasks.length === 3 &&
    plan.tasks.some((task) => task.id === "package") &&
    plan.tasks.some((task) => task.id === "server") &&
    plan.tasks.some((task) => task.id === "home");
}
