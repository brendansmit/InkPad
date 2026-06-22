const $ = (id) => document.getElementById(id);

let apiKeyTested = false;
let currentPlan = null;
let currentJobId = null;

const apiKey = $('apiKey');
const testBtn = $('testBtn');
const testResult = $('testResult');
const prompt = $('prompt');
const convertBtn = $('convertBtn');
const planPreview = $('planPreview');
const dryRunBtn = $('dryRunBtn');
const estimate = $('estimate');
const buildBtn = $('buildBtn');
const allowPartial = $('allowPartial');
const status = $('status');
const log = $('log');
const finishedSection = $('finished-section');
const finishedInfo = $('finishedInfo');
const downloadBtn = $('downloadBtn');

// Restore saved API key
const STORAGE_KEY = 'pc_openrouter_key';
const _saved = localStorage.getItem(STORAGE_KEY);
if (_saved) {
  apiKey.value = _saved;
  convertBtn.disabled = false;
}
apiKey.addEventListener('input', () => {
  if (apiKey.value) localStorage.setItem(STORAGE_KEY, apiKey.value);
  else localStorage.removeItem(STORAGE_KEY);
});

function setState(text) {
  status.textContent = `State: ${text}`;
}

function logEvent(type, payload) {
  const line = `[${new Date().toLocaleTimeString()}] ${type}\n${JSON.stringify(payload, null, 2)}`;
  log.textContent += line + '\n\n';
  log.scrollTop = log.scrollHeight;
}

function hideDownload() {
  downloadBtn.classList.add('hidden');
  downloadBtn.removeAttribute('href');
  finishedSection.classList.add('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

testBtn.addEventListener('click', async () => {
  hideDownload();
  testResult.className = 'status';
  testResult.textContent = 'Testing...';
  try {
    const res = await fetch('/api/openrouter/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.value })
    });
    const data = await res.json();
    if (data.connected) {
      apiKeyTested = true;
      testResult.innerHTML = `<span class="connected">connected</span> · model list reachable: ${data.listReachable}`;
      convertBtn.disabled = false;
    } else {
      apiKeyTested = false;
      testResult.innerHTML = `<span class="failed">failed</span><br>${escapeHtml(data.errorMessage || '')}${
        data.statusCode ? `<br>Status: ${data.statusCode}` : ''
      }${data.bodyExcerpt ? `<br><pre>${escapeHtml(data.bodyExcerpt)}</pre>` : ''}`;
      convertBtn.disabled = true;
      dryRunBtn.disabled = true;
      buildBtn.disabled = true;
    }
  } catch (err) {
    apiKeyTested = false;
    testResult.innerHTML = `<span class="failed">failed</span><br>${escapeHtml(err.message)}`;
  }
});

convertBtn.addEventListener('click', async () => {
  hideDownload();
  if (!apiKeyTested) return;
  planPreview.textContent = 'Converting...';
  convertBtn.disabled = true;
  try {
    const res = await fetch('/api/plan/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.value, prompt: prompt.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error);
    currentPlan = data.plan;
    planPreview.textContent = JSON.stringify(currentPlan, null, 2);
    dryRunBtn.disabled = false;
  } catch (err) {
    planPreview.textContent = `Conversion error: ${err.message}`;
    currentPlan = null;
    dryRunBtn.disabled = true;
    buildBtn.disabled = true;
  } finally {
    convertBtn.disabled = false;
  }
});

dryRunBtn.addEventListener('click', async () => {
  hideDownload();
  if (!currentPlan) return;
  estimate.textContent = 'Validating...';
  try {
    const res = await fetch('/api/plan/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: currentPlan })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data.issues || []).map((i) => `${i.path}: ${i.message}`).join('; '));
    }
    currentPlan = data.plan;
    estimate.innerHTML = `valid · ${data.estimate.taskCount} tasks · estimated <b>$${data.estimate.totalUsd}</b> / budget $${data.estimate.budgetUsd}`;
    buildBtn.disabled = false;
  } catch (err) {
    estimate.innerHTML = `<span class="failed">Invalid plan:</span> ${escapeHtml(err.message)}`;
    buildBtn.disabled = true;
  }
});

buildBtn.addEventListener('click', async () => {
  hideDownload();
  if (!currentPlan) return;
  buildBtn.disabled = true;
  log.textContent = '';
  try {
    const res = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey.value,
        plan: currentPlan,
        options: { allowPartial: allowPartial.checked }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentJobId = data.jobId;
    setState(data.state);
    subscribeEvents(data.jobId);
  } catch (err) {
    setState('failed');
    logEvent('job:failed', { message: err.message });
    buildBtn.disabled = false;
  }
});

function subscribeEvents(jobId) {
  const es = new EventSource(`/api/builds/${jobId}/events`);
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      logEvent(ev.type, ev.payload);
      handleEvent(ev, jobId, es);
    } catch {
      logEvent('parse-error', { raw: e.data });
    }
  };
  es.onerror = () => logEvent('sse-error', { message: 'event stream error' });
}

function handleEvent(ev, jobId, es) {
  if (ev.type === 'job:running') setState('running');
  if (ev.type === 'plan:created') setState('planning');
  if (ev.type === 'estimate:ready') setState('estimating');
  if (ev.type === 'task:start') setState('generating');
  if (ev.type === 'review:start') setState('reviewing');
  if (ev.type === 'repair:start') setState('repairing');
  if (ev.type === 'package:start') setState('packaging');

  if (ev.type === 'package:ready' && ev.payload?.downloadUrl) {
    revealDownload(ev.payload.downloadUrl, jobId);
  }

  if (ev.type === 'job:ready') {
    if (ev.payload?.downloadUrl) revealDownload(ev.payload.downloadUrl, jobId);
    setState('ready');
    if (es) es.close();
  }

  if (ev.type === 'job:failed') {
    setState('failed');
    buildBtn.disabled = false;
    if (es) es.close();
  }
}

function revealDownload(url, jobId) {
  if (!url.includes(`/api/builds/${jobId}/download`)) return;
  downloadBtn.setAttribute('href', url);
  downloadBtn.classList.remove('hidden');
  finishedSection.classList.remove('hidden');
  populateFinished(jobId);
}

function populateFinished(jobId) {
  fetch(`/api/builds/${jobId}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return;
      finishedInfo.innerHTML = `
        <p><b>Project:</b> ${escapeHtml(s.projectName)}</p>
        <p><b>Job ID:</b> ${s.id}</p>
        <p><b>Files:</b> ${s.fileCount}</p>
        <p><b>Cost:</b> $${s.costUsd}</p>
        <p><b>Tokens:</b> ${s.tokens.prompt} prompt / ${s.tokens.completion} completion</p>
      `;
    })
    .catch(() => {});
}
