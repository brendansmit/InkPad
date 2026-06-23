const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(process.cwd(), 'outputs'),
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',

  CONVERSION_MODEL: {
    prototype: 'deepseek/deepseek-chat',
    spec: 'moonshotai/kimi-k2'
  },

  DEFAULTS: {
    generator: 'deepseek/deepseek-chat',
    fastGenerator: 'qwen/qwen3-coder-flash',
    hardGenerator: 'moonshotai/kimi-k2',
    reviewer: 'qwen/qwen-2.5-coder-32b-instruct',
    repairer: 'moonshotai/kimi-k2',
    temperature: 0.2,
    concurrency: 2,
    reviewRounds: 2,
    retries: 2,
    budgetUsd: 4,
    allowPartial: false
  },

  SPEC_DEFAULTS: {
    generator: 'moonshotai/kimi-k2',
    fastGenerator: 'moonshotai/kimi-k2',
    hardGenerator: 'moonshotai/kimi-k2',
    reviewer: 'qwen/qwen3-coder',
    repairer: 'deepseek/deepseek-r1',
    temperature: 0.15,
    concurrency: 1,
    reviewRounds: 3,
    retries: 3,
    budgetUsd: 12,
    allowPartial: false
  },

  MODEL_PRICES: {
    'deepseek/deepseek-chat': { input: 0.27e-6, output: 1.1e-6 },
    'deepseek/deepseek-r1': { input: 0.55e-6, output: 2.19e-6 },
    'google/gemini-2.5-flash': { input: 0.15e-6, output: 0.6e-6 },
    'moonshotai/kimi-k2': { input: 1e-6, output: 3e-6 },
    'qwen/qwen-2.5-coder-32b-instruct': { input: 0.2e-6, output: 0.6e-6 },
    'qwen/qwen3-coder': { input: 0.5e-6, output: 1.5e-6 },
    'qwen/qwen3-coder-flash': { input: 0.05e-6, output: 0.15e-6 },
    'anthropic/claude-haiku-4-5': { input: 0.8e-6, output: 4e-6 },
    'anthropic/claude-sonnet-4-5': { input: 3e-6, output: 15e-6 },
    'anthropic/claude-opus-4-8': { input: 15e-6, output: 75e-6 },
    'openai/gpt-4o-mini': { input: 0.15e-6, output: 0.6e-6 },
    'openai/gpt-4o': { input: 2.5e-6, output: 10e-6 },
    'openai/o4-mini': { input: 1.1e-6, output: 4.4e-6 },
    default: { input: 3e-6, output: 9e-6 }
  }
};
