import { createChatCompletion } from "./openrouter.js";
import { createExecutionBatches } from "./plan.js";

export async function executeGenerationPlan(plan, env, options = {}) {
  const generate = options.generate || generateFile;
  const onEvent = options.onEvent || (() => {});
  const concurrency = options.concurrency || plan.defaults.concurrency;
  const outputs = new Map();
  const batches = createExecutionBatches(plan.tasks);

  onEvent({ type: "start", taskCount: plan.tasks.length, batches: batches.length });

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    onEvent({ type: "batch:start", batch: index + 1, taskIds: batch.map((task) => task.id) });
    await runQueue(batch, concurrency, async (task) => {
      const dependencies = task.dependsOn.map((id) => outputs.get(id)).filter(Boolean);
      onEvent({ type: "task:start", taskId: task.id, path: task.path, model: task.generator });
      const result = await generate(plan, task, dependencies, env);
      outputs.set(task.id, {
        taskId: task.id,
        path: task.path,
        content: result.content,
        model: task.generator,
        usage: result.usage || null
      });
      onEvent({ type: "task:done", taskId: task.id, path: task.path });
    });
    onEvent({ type: "batch:done", batch: index + 1 });
  }

  onEvent({ type: "done", fileCount: outputs.size });
  return [...outputs.values()];
}

export async function generateFile(plan, task, dependencies, env) {
  const messages = [
    {
      role: "system",
      content: [
        "You generate one project file from a build plan.",
        "Return only the exact file contents.",
        "Do not wrap the file in Markdown fences.",
        "Do not add explanation outside the file."
      ].join("\n")
    },
    {
      role: "user",
      content: buildGenerationPrompt(plan, task, dependencies)
    }
  ];
  return createChatCompletion(env, {
    model: task.generator,
    messages,
    maxTokens: task.maxOutputTokens,
    temperature: 0.2
  });
}

export function buildGenerationPrompt(plan, task, dependencies) {
  const dependencyText = dependencies.length
    ? dependencies.map((item) => `## ${item.path}\n${item.content}`).join("\n\n")
    : "No completed dependency files.";

  return [
    `Project: ${plan.projectName}`,
    `Stack: ${plan.stack}`,
    `Target file: ${task.path}`,
    "",
    "Task instruction:",
    task.instruction,
    "",
    "Completed dependency context:",
    dependencyText,
    "",
    "Write the complete target file now."
  ].join("\n");
}

async function runQueue(items, concurrency, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}
