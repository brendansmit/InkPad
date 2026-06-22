export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}

export function planInputFromBody(body) {
  const input = body.planText ?? body.plan;
  if (input === undefined || input === null || input === "") {
    throw new ApiError(400, "Request must include planText or plan");
  }
  return input;
}

export function applyBudgetOverride(plan, body) {
  if (body.budgetUsd === undefined || body.budgetUsd === null || body.budgetUsd === "") {
    return plan;
  }
  const budget = Number(body.budgetUsd);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new ApiError(400, "budgetUsd must be a positive number");
  }
  plan.budgetUsd = budget;
  return plan;
}

export function requestEnv(baseEnv, body) {
  const apiKey = body.openRouterApiKey || body.apiKey || "";
  return {
    ...baseEnv,
    ...(apiKey ? { OPENROUTER_API_KEY: apiKey } : {})
  };
}

export function requireApiKey(env) {
  if (!env.OPENROUTER_API_KEY) {
    throw new ApiError(400, "OpenRouter API key is required");
  }
}
