import assert from "node:assert/strict";
import { modelFamily, pickCrossFamilyReviewer, sameModelFamily } from "../src/families.js";
import { createExecutionBatches, estimatePlanCost, parseBuildPlan } from "../src/plan.js";
import { executeBuildPlan, executeGenerationPlan, parseReviewJson } from "../src/executor.js";
import { cleanGeneratedContent, createAgentsInstructions, createHandoffReport, createZipBuffer } from "../src/output.js";
import { ApiError, applyBudgetOverride, planInputFromBody, readJsonBody, rejectSamplePlan, requestEnv, requireApiKey } from "../src/api.js";
import { buildPlannerPrompt, extractJson } from "../src/prompt-planner.js";

const tests = [];

test("parseBuildPlan normalizes tasks and dependencies", () => {
  const plan = parseBuildPlan(JSON.stringify({
    projectName: "Demo",
    stack: "Node",
    tasks: [
      { id: "a", path: "package.json", instruction: "Create package file" },
      { id: "b", path: "src/index.js", instruction: "Create server", dependsOn: ["a"] }
    ]
  }));

  assert.equal(plan.projectName, "Demo");
  assert.equal(plan.tasks[0].generator, "deepseek/deepseek-v4-pro");
  assert.deepEqual(plan.tasks[1].dependsOn, ["a"]);
});

test("parseBuildPlan rejects blank output paths", () => {
  assert.throws(() => parseBuildPlan({
    tasks: [{ id: "a", path: "   ", instruction: "A" }]
  }), /missing path|Unsafe output path/);
});

test("createExecutionBatches respects dependencies", () => {
  const plan = parseBuildPlan({
    tasks: [
      { id: "a", path: "a.txt", instruction: "A" },
      { id: "b", path: "b.txt", instruction: "B", dependsOn: ["a"] },
      { id: "c", path: "c.txt", instruction: "C", dependsOn: ["a"] }
    ]
  });

  const batches = createExecutionBatches(plan.tasks);
  assert.deepEqual(batches.map((batch) => batch.map((task) => task.id)), [["a"], ["b", "c"]]);
});

test("estimatePlanCost reports over-budget plans", () => {
  const plan = parseBuildPlan({
    budgetUsd: 0.0009,
    tasks: [{ id: "a", path: "a.txt", instruction: "A", maxOutputTokens: 1000 }]
  });
  const prices = new Map([["deepseek/deepseek-v4-pro", { inputPrice: 0, outputPrice: 0.000001 }]]);
  const estimate = estimatePlanCost(plan, prices);
  assert.equal(estimate.overBudget, true);
});

test("executeGenerationPlan injects dependency outputs", async () => {
  const seen = [];
  const plan = parseBuildPlan({
    defaults: { concurrency: 2 },
    tasks: [
      { id: "a", path: "a.txt", instruction: "A" },
      { id: "b", path: "b.txt", instruction: "B", dependsOn: ["a"] }
    ]
  });
  const outputs = await executeGenerationPlan(plan, {}, {
    generate: async (_plan, task, dependencies) => {
      seen.push({ id: task.id, dependencies: dependencies.map((item) => item.path) });
      return { content: `content:${task.id}` };
    }
  });

  assert.equal(outputs.length, 2);
  assert.deepEqual(seen, [
    { id: "a", dependencies: [] },
    { id: "b", dependencies: ["a.txt"] }
  ]);
});

test("families block same-family review", () => {
  assert.equal(modelFamily("moonshotai/kimi-k2.7-code"), "kimi");
  assert.equal(sameModelFamily("deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"), true);
  assert.equal(pickCrossFamilyReviewer("deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash"), "qwen/qwen3-coder-flash");
});

test("parseBuildPlan replaces same-family reviewer", () => {
  const plan = parseBuildPlan({
    tasks: [{
      id: "a",
      path: "a.txt",
      instruction: "A",
      generator: "qwen/qwen3-coder",
      reviewer: "qwen/qwen3-coder-flash"
    }]
  });
  assert.equal(plan.tasks[0].reviewer, "deepseek/deepseek-v4-flash");
});

test("executeBuildPlan repairs after failed review", async () => {
  const events = [];
  const plan = parseBuildPlan({
    defaults: { maxReviewRounds: 2 },
    tasks: [{ id: "a", path: "a.txt", instruction: "A" }]
  });
  const outputs = await executeBuildPlan(plan, {}, {
    onEvent: (event) => events.push(event.type),
    generate: async () => ({ content: "bad" }),
    review: async (_plan, _task, content) => ({
      approved: content === "fixed",
      summary: content === "fixed" ? "clean" : "bug",
      issues: content === "fixed" ? [] : [{ severity: "high", evidence: "bad", problem: "bad", fix: "fix it" }]
    }),
    repair: async () => ({ content: "fixed" })
  });
  assert.equal(outputs[0].content, "fixed");
  assert.equal(outputs[0].knownIssues.length, 0);
  assert.equal(events.includes("review:start"), true);
  assert.equal(events.includes("repair:done"), true);
});

test("executeBuildPlan preserves content when repair fails", async () => {
  const events = [];
  const plan = parseBuildPlan({
    defaults: { maxReviewRounds: 2 },
    tasks: [{ id: "a", path: "a.txt", instruction: "A" }]
  });
  const outputs = await executeBuildPlan(plan, {}, {
    onEvent: (event) => events.push(event.type),
    generate: async () => ({ content: "last-good" }),
    review: async () => ({
      approved: false,
      summary: "bug",
      issues: [{ severity: "high", evidence: "x", problem: "broken", fix: "repair" }]
    }),
    repair: async () => {
      throw new Error("OpenRouter returned no message content");
    }
  });
  assert.equal(outputs[0].content, "last-good");
  assert.equal(outputs[0].knownIssues.some((issue) => issue.evidence === "repair-failed"), true);
  assert.equal(events.includes("repair:failed"), true);
});

test("parseReviewJson extracts fenced JSON", () => {
  const review = parseReviewJson("```json\n{\"approved\":true,\"summary\":\"ok\",\"issues\":[]}\n```");
  assert.equal(review.approved, true);
});

test("cleanGeneratedContent removes wrapping code fences", () => {
  assert.equal(cleanGeneratedContent("```js\nconsole.log(1);\n```"), "console.log(1);");
});

test("createHandoffReport includes known issues", () => {
  const plan = parseBuildPlan({ projectName: "Demo", stack: "Node", tasks: [{ id: "a", path: "a.js", instruction: "A" }] });
  const report = createHandoffReport(plan, [{
    path: "a.js",
    model: "deepseek/deepseek-v4-pro",
    reviewer: "qwen/qwen3-coder-flash",
    knownIssues: [{ severity: "high", problem: "Bug", fix: "Fix bug" }]
  }]);
  assert.equal(report.includes("Bug"), true);
});

test("createAgentsInstructions includes required first steps and issues", () => {
  const plan = parseBuildPlan({ projectName: "Demo", stack: "Node", tasks: [{ id: "a", path: "a.js", instruction: "A" }] });
  const report = createAgentsInstructions(plan, [{
    path: "a.js",
    knownIssues: [{ severity: "high", evidence: "repair-failed", problem: "Repair failed", fix: "Inspect it" }]
  }]);
  assert.equal(report.includes("Required First Steps"), true);
  assert.equal(report.includes("Repair failed"), true);
});

test("createZipBuffer writes a zip archive", () => {
  const zip = createZipBuffer([{ path: "a.txt", content: "hello" }]);
  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(zip.includes(Buffer.from("a.txt")), true);
});

test("createZipBuffer rejects blank paths", () => {
  assert.throws(() => createZipBuffer([{ path: "   ", content: "hello" }]), /Unsafe output path/);
});

test("api helpers validate request plans and budgets", () => {
  const plan = parseBuildPlan({ tasks: [{ id: "a", path: "a.txt", instruction: "A" }] });
  applyBudgetOverride(plan, { budgetUsd: "2.5" });
  assert.equal(plan.budgetUsd, 2.5);
  assert.throws(() => applyBudgetOverride(plan, { budgetUsd: "free" }), /positive number/);
  assert.throws(() => planInputFromBody({}), /planText or plan/);
  assert.equal(requestEnv({}, { openRouterApiKey: "sk-test" }).OPENROUTER_API_KEY, "sk-test");
  assert.throws(() => requireApiKey({}), /API key/);
});

test("api rejects removed sample plan", () => {
  const sample = parseBuildPlan({
    projectName: "Example App",
    stack: "Node, plain HTML, CSS",
    tasks: [
      { id: "package", path: "package.json", instruction: "A" },
      { id: "server", path: "server.js", instruction: "B" },
      { id: "home", path: "public/index.html", instruction: "C" }
    ]
  });
  assert.throws(() => rejectSamplePlan(sample), /removed sample plan/);
});

test("readJsonBody handles empty and invalid bodies", async () => {
  assert.deepEqual(await readJsonBody(asyncIterable([])), {});
  await assert.rejects(() => readJsonBody(asyncIterable(["{bad"])), ApiError);
});

test("prompt planner helpers enforce default models", () => {
  const prompt = buildPlannerPrompt("Build an app", { budgetUsd: 3, maxReviewRounds: 2, useKimi: true });
  assert.equal(prompt.includes("deepseek/deepseek-v4-pro"), true);
  assert.equal(prompt.includes("qwen/qwen3-coder-flash"), true);
  assert.equal(prompt.includes("moonshotai/kimi-k2.7-code"), true);
  assert.equal(extractJson("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
});

test("download fallback route format is stable", () => {
  const runId = "20260622-120000-example-app";
  assert.equal(`/api/runs/${encodeURIComponent(runId)}/download`, "/api/runs/20260622-120000-example-app/download");
});

test("README plan shape remains parseable", () => {
  const plan = parseBuildPlan({
    projectName: "Reference App",
    stack: "Node, plain HTML, CSS",
    budgetUsd: 4,
    defaults: {
      generator: "deepseek/deepseek-v4-pro",
      reviewer: "qwen/qwen3-coder-flash",
      maxReviewRounds: 2,
      concurrency: 3
    },
    tasks: [
      { id: "package", path: "package.json", instruction: "Create package file." },
      { id: "server", path: "server.js", dependsOn: ["package"], instruction: "Create server." }
    ]
  });
  assert.equal(plan.tasks.length, 2);
});

for (const item of tests) {
  try {
    await item.fn();
    console.log(`ok - ${item.name}`);
  } catch (error) {
    console.error(`not ok - ${item.name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function test(name, fn) {
  tests.push({ name, fn });
}

async function* asyncIterable(parts) {
  for (const part of parts) {
    yield Buffer.from(part);
  }
}
