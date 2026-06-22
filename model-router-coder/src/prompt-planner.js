import { createChatCompletion } from "./openrouter.js";
import { parseBuildPlan } from "./plan.js";

const PLANNER_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_GENERATOR = "deepseek/deepseek-v4-pro";
const DEFAULT_REVIEWER = "qwen/qwen3-coder-flash";
const KIMI_REVIEWER = "moonshotai/kimi-k2.7-code";

export async function createPlanFromPrompt(env, options) {
  const prompt = String(options.prompt || "").trim();
  if (!prompt) {
    throw new Error("Claude build prompt is required");
  }
  const response = await createChatCompletion(env, {
    model: PLANNER_MODEL,
    temperature: 0.1,
    maxTokens: 4000,
    messages: [
      {
        role: "system",
        content: [
          "You convert a product build prompt into a strict JSON build plan.",
          "Do not write prose.",
          "Do not wrap JSON in Markdown.",
          "Use the default models unless a task explicitly needs Kimi review.",
          "Keep tasks file-based and small enough for independent generation."
        ].join("\n")
      },
      {
        role: "user",
        content: buildPlannerPrompt(prompt, options)
      }
    ]
  });
  return {
    plan: parseBuildPlan(extractJson(response.content)),
    raw: response.content,
    model: PLANNER_MODEL,
    usage: response.usage || null
  };
}

export function buildPlannerPrompt(prompt, options = {}) {
  const budgetUsd = Number(options.budgetUsd || 4);
  const maxReviewRounds = Math.max(1, Math.min(3, Number(options.maxReviewRounds || 2)));
  const useKimi = Boolean(options.useKimi);
  return [
    "Convert this Claude/Codex build and tech-stack prompt into JSON.",
    "",
    "Required JSON shape:",
    JSON.stringify({
      projectName: "Short project name",
      stack: "Tech stack summary",
      budgetUsd,
      defaults: {
        generator: DEFAULT_GENERATOR,
        reviewer: DEFAULT_REVIEWER,
        maxReviewRounds,
        concurrency: 3
      },
      tasks: [
        {
          id: "short-id",
          path: "relative/file/path.ext",
          dependsOn: [],
          instruction: "Specific implementation instruction for this one file."
        }
      ]
    }, null, 2),
    "",
    "Rules:",
    `- Bulk generator must be ${DEFAULT_GENERATOR}.`,
    `- Default reviewer must be ${DEFAULT_REVIEWER}.`,
    "- Never choose a same-family reviewer.",
    "- Use relative paths only.",
    "- Include package/config files before files that depend on them.",
    "- Use dependsOn for files that need context from earlier files.",
    "- Keep tasks concrete. One task should write one file.",
    "- Do not include install commands as tasks unless they create a file.",
    useKimi ? `- For important hard frontend or integration files only, set reviewer to ${KIMI_REVIEWER}.` : "- Do not use Kimi.",
    "",
    "Build prompt:",
    prompt
  ].join("\n");
}

export function extractJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1];
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Planner did not return JSON");
  }
  return trimmed.slice(start, end + 1);
}
