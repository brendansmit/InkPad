# Model Router Coder

Cheap-model prebuilder for turning a subscription-made build plan into a draft project.

The intended flow is:

1. Use Claude, ChatGPT or Codex subscription time to make the plan and tech stack.
2. Paste the plan into this tool.
3. Let cheap OpenRouter models generate, cross-review and repair the draft.
4. Bring the output back to Codex or Claude for installs, runtime fixes, polish and shipping.

This tool is not meant to replace the finishing pass. It is meant to reduce the amount of premium-model window time spent on boilerplate and first drafts.

## Setup

```bash
cp .env.example .env
# Add your OpenRouter key to .env
npm start
```

Then open `http://localhost:3470`.

The UI supports:

- Loading current OpenRouter prices for Kimi, Qwen and DeepSeek.
- Pasting a Claude/Codex build and tech-stack prompt.
- Converting that prompt into a structured task plan with DeepSeek V4 Flash.
- Editing structured JSON build plans in advanced mode.
- Dry-running estimated spend before any generation calls.
- Starting a build job with live logs.
- Downloading a zip with generated files, `HANDOFF.md` and `build-log.json`.

## Main Flow

1. Paste your OpenRouter API key in Settings. It is stored in browser localStorage and sent with local requests.
2. Paste the build prompt from Claude, ChatGPT or Codex.
3. Click **Convert prompt**. This spends a small API call using `deepseek/deepseek-v4-flash`.
4. Click **Dry run**. This does not generate files or spend generation tokens.
5. Click **Build draft** when the cost and task plan look right.

Default routing:

```text
Prompt-to-plan: deepseek/deepseek-v4-flash
Bulk build: deepseek/deepseek-v4-pro
Review: qwen/qwen3-coder-flash
Optional hard-file reviewer: moonshotai/kimi-k2.7-code
```

## Current scope

- Fetch OpenRouter model metadata.
- Dry-run structured build plans against live OpenRouter prices.
- Run build jobs with server-sent event logs.
- Package generated drafts into files, handoff report, build log and zip.
- Keep premium APIs out of the pipeline.
- Enforce cheap-model usage in later build stages.

## Build Plan Shape

Paste JSON in this shape:

```json
{
  "projectName": "Example App",
  "stack": "Node, plain HTML, CSS",
  "budgetUsd": 4,
  "defaults": {
    "generator": "deepseek/deepseek-v4-pro",
    "reviewer": "qwen/qwen3-coder-flash",
    "maxReviewRounds": 2,
    "concurrency": 3
  },
  "tasks": [
    {
      "id": "package",
      "path": "package.json",
      "instruction": "Create a minimal package.json with start and check scripts."
    },
    {
      "id": "server",
      "path": "server.js",
      "dependsOn": ["package"],
      "instruction": "Create the HTTP server."
    }
  ]
}
```
