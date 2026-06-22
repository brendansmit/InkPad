const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(process.cwd(), 'outputs'),
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  CONVERSION_MODEL: 'google/gemini-2.0-flash-001',

  DEFAULTS: {
    generator: 'google/gemini-2.0-flash-001',
    fastGenerator: 'google/gemini-2.0-flash-001',
    hardGenerator: 'anthropic/claude-sonnet-4-5',
    reviewer: 'mistralai/codestral-2501',
    temperature: 0.2,
    concurrency: 2,
    reviewRounds: 2,
    retries: 2,
    budgetUsd: 4,
    allowPartial: false
  },

  MODEL_PRICES: {
    'google/gemini-2.0-flash-001': { input: 0.1e-6, output: 0.4e-6 },
    'google/gemini-2.5-flash-preview': { input: 0.15e-6, output: 0.6e-6 },
    'mistralai/codestral-2501': { input: 1e-6, output: 3e-6 },
    'mistralai/mistral-small-3.1-24b-instruct': { input: 0.1e-6, output: 0.3e-6 },
    'anthropic/claude-haiku-4-5': { input: 0.8e-6, output: 4e-6 },
    'anthropic/claude-sonnet-4-5': { input: 3e-6, output: 15e-6 },
    'anthropic/claude-opus-4-8': { input: 15e-6, output: 75e-6 },
    'openai/gpt-4o-mini': { input: 0.15e-6, output: 0.6e-6 },
    'openai/gpt-4o': { input: 2.5e-6, output: 10e-6 },
    'openai/o4-mini': { input: 1.1e-6, output: 4.4e-6 },
    default: { input: 3e-6, output: 9e-6 }
  }
};
