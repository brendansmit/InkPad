const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(process.cwd(), 'outputs'),
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  CONVERSION_MODEL: 'deepseek/deepseek-chat',

  DEFAULTS: {
    generator: 'deepseek/deepseek-chat',
    fastGenerator: 'qwen/qwen-2.5-coder-7b-instruct',
    hardGenerator: 'moonshotai/kimi-k2',
    reviewer: null,
    temperature: 0.2,
    concurrency: 2,
    reviewRounds: 2,
    retries: 2,
    budgetUsd: 4,
    allowPartial: false
  },

  MODEL_PRICES: {
    'deepseek/deepseek-chat': { input: 0.5e-6, output: 2e-6 },
    'deepseek/deepseek-coder': { input: 0.5e-6, output: 2e-6 },
    'qwen/qwen-2.5-coder-32b-instruct': { input: 1.2e-6, output: 1.2e-6 },
    'qwen/qwen-2.5-coder-7b-instruct': { input: 0.2e-6, output: 0.2e-6 },
    'moonshotai/kimi-k2': { input: 2e-6, output: 8e-6 },
    'google/gemini-2.0-flash-001': { input: 0.35e-6, output: 0.7e-6 },
    'mistralai/codestral-2501': { input: 1e-6, output: 3e-6 },
    default: { input: 3e-6, output: 9e-6 }
  }
};
