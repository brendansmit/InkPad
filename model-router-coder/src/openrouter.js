import { readFile } from "node:fs/promises";

export async function loadEnv(path) {
  const env = { ...process.env };
  try {
    const text = await readFile(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return env;
}

export async function fetchOpenRouterModels(env) {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: openRouterHeaders(env, false)
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`);
  }
  const body = await response.json();
  return body.data.map((model) => ({
    id: model.id,
    name: model.name,
    contextLength: model.context_length,
    inputPrice: Number(model.pricing?.prompt || 0),
    outputPrice: Number(model.pricing?.completion || 0)
  }));
}

export function openRouterHeaders(env, includeAuth = true) {
  const headers = {
    "content-type": "application/json",
    "http-referer": env.OPENROUTER_SITE_URL || "http://localhost:3470",
    "x-title": env.OPENROUTER_APP_NAME || "Model Router Coder"
  };
  if (includeAuth && env.OPENROUTER_API_KEY) {
    headers.authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
  }
  return headers;
}
