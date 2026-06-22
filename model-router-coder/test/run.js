import assert from "node:assert/strict";
import { modelFamily, pickCrossFamilyReviewer, sameModelFamily } from "../src/families.js";
import { createExecutionBatches, estimatePlanCost, parseBuildPlan } from "../src/plan.js";
import { executeBuildPlan, executeGenerationPlan, parseReviewJson } from "../src/executor.js";

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

test("parseReviewJson extracts fenced JSON", () => {
  const review = parseReviewJson("```json\n{\"approved\":true,\"summary\":\"ok\",\"issues\":[]}\n```");
  assert.equal(review.approved, true);
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
