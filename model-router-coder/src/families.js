const REVIEWER_POOL = [
  "qwen/qwen3-coder-flash",
  "deepseek/deepseek-v4-flash",
  "moonshotai/kimi-k2.7-code"
];

export function modelFamily(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("kimi") || id.includes("moonshot")) return "kimi";
  if (id.includes("anthropic") || id.includes("claude")) return "anthropic";
  if (id.includes("openai") || id.includes("gpt")) return "openai";
  if (id.includes("google") || id.includes("gemini")) return "google";
  return id.split("/")[0] || "unknown";
}

export function sameModelFamily(a, b) {
  return modelFamily(a) === modelFamily(b);
}

export function pickCrossFamilyReviewer(generator, preferred = "") {
  if (preferred && !sameModelFamily(generator, preferred)) {
    return preferred;
  }
  const reviewer = REVIEWER_POOL.find((candidate) => !sameModelFamily(generator, candidate));
  if (!reviewer) {
    throw new Error(`No cross-family reviewer available for ${generator}`);
  }
  return reviewer;
}
