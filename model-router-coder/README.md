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

## Current scope

- Fetch OpenRouter model metadata.
- Serve a small local UI.
- Keep premium APIs out of the pipeline.
- Enforce cheap-model usage in later build stages.
