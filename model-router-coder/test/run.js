import assert from "node:assert/strict";
import { createExecutionBatches, estimatePlanCost, parseBuildPlan } from "../src/plan.js";
import { executeGenerationPlan } from "../src/executor.js";

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
