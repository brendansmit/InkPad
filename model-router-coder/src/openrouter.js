import { request } from "node:https";
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
  const body = await requestJson("GET", "https://openrouter.ai/api/v1/models", openRouterHeaders(env, false));
  return body.data.map((model) => ({
    id: model.id,
    name: model.name,
    contextLength: model.context_length,
    inputPrice: Number(model.pricing?.prompt || 0),
    outputPrice: Number(model.pricing?.completion || 0)
  }));
}

export async function createChatCompletion(env, request) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }
  const attempts = Math.max(1, Number(request.retries ?? 2));
  let lastBody = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const body = await requestJson(
      "POST",
      "https://openrouter.ai/api/v1/chat/completions",
      openRouterHeaders(env, true),
      {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens
      }
    );
    lastBody = body;
    const content = body.choices?.[0]?.message?.content;
    if (content) {
      return {
        content,
        usage: body.usage || null,
        raw: body
      };
    }
  }
  throw new Error(`OpenRouter returned no message content for ${request.model}. ${summarizeEmptyResponse(lastBody)}`);
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

function requestJson(method, target, headers, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    const payload = body ? JSON.stringify(body) : null;
    const req = request({
      method,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: {
        ...headers,
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch {
          reject(new Error(`OpenRouter returned invalid JSON with status ${res.statusCode}`));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed.error?.message || parsed.message || `OpenRouter request failed: ${res.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function summarizeEmptyResponse(body) {
  if (!body) return "No response body.";
  const choice = body.choices?.[0];
  const parts = [
    choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : "",
    body.error?.message ? `error=${body.error.message}` : "",
    body.provider ? `provider=${body.provider}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "Response had choices but no text content.";
}
