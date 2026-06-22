// Run: node probe.js YOUR_OPENROUTER_KEY
const key = process.argv[2];
if (!key) { console.error('Usage: node probe.js YOUR_KEY'); process.exit(1); }

async function test(model) {
  console.log(`\n--- Testing: ${model} ---`);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3471',
      'X-Title': 'Prototype Coder'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 8
    })
  });

  console.log('Status:', res.status);
  const body = await res.text();
  try {
    console.log('Body:', JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log('Body:', body);
  }
}

(async () => {
  await test('deepseek/deepseek-chat');
  await test('google/gemini-2.0-flash-001');
})();
