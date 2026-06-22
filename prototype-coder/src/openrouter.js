const { OpenAI } = require('openai');
const { OPENROUTER_BASE_URL } = require('./config');

function createOpenRouter(apiKey) {
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3471',
      'X-Title': 'Prototype Coder'
    }
  });

  return {
    async test() {
      const url = `${OPENROUTER_BASE_URL}/models`;
      try {
        const res = await globalThis.fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            connected: false,
            listReachable: false,
            errorMessage: `OpenRouter returned ${res.status}: ${text}`,
            statusCode: res.status,
            bodyExcerpt: text.slice(0, 500)
          };
        }
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        const reachable = Array.isArray(data?.data) && data.data.length > 0;
        return { connected: true, listReachable: reachable };
      } catch (err) {
        return { connected: false, listReachable: false, errorMessage: err.message };
      }
    },

    async complete({ model, messages, temperature = 0.2, max_tokens = 8192, response_format }) {
      const params = { model, messages, temperature, max_tokens };
      if (response_format) params.response_format = response_format;
      const resp = await client.chat.completions.create(params);
      const choice = resp.choices?.[0];
      return {
        content: choice?.message?.content || '',
        usage: resp.usage || { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
  };
}

module.exports = { createOpenRouter };
