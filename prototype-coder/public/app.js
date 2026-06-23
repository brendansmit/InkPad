const $ = (id) => document.getElementById(id);

let apiKeyTested = false;
let currentPlan = null;
let currentJobId = null;
let currentMode = 'prototype';

const apiKey        = $('apiKey');
const testBtn       = $('testBtn');
const testResult    = $('testResult');
const prompt        = $('prompt');
const convertBtn    = $('convertBtn');
const planPreview   = $('planPreview');
const dryRunBtn     = $('dryRunBtn');
const estimate      = $('estimate');
const buildBtn      = $('buildBtn');
const allowPartial  = $('allowPartial');
const statusBar     = $('statusBar');
const statusDot     = $('statusDot');
const statusText    = $('status');
const log           = $('log');
const finishedSection = $('finished-section');
const finishedInfo  = $('finishedInfo');
const downloadBtn   = $('downloadBtn');

// ── Persist API key ──────────────────────────────────────────────────────────
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

// ── Mode selection ───────────────────────────────────────────────────────────
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    currentMode = radio.value;
    document.querySelectorAll('.mode-card').forEach((c) => {
      c.classList.remove('selected', 'spec-selected');
    });
    const card = radio.closest('.mode-card');
    card.classList.add('selected');
    if (currentMode === 'spec') card.classList.add('spec-selected');
    currentPlan = null;
    planPreview.textContent = '';
    planPreview.classList.add('hidden');
    estimate.textContent = '';
    dryRunBtn.disabled = true;
    buildBtn.disabled = true;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setState(text) {
  statusBar.classList.remove('hidden');
  log.classList.remove('hidden');
  statusText.textContent = text;
  const running = !['ready', 'failed', 'idle'].includes(text);
  statusDot.className = 'status-dot' + (running ? ' running' : text === 'ready' ? ' ready' : text === 'failed' ? ' failed' : '');
}

function logLine(type, payload) {
  const isError = type.includes('failed') || type.includes('error');
  const isOk    = type.includes('passed') || type.includes('ready') || type.includes('done');
  const cls     = isError ? 'log-line-error' : isOk ? 'log-line-ok' : 'log-line-type';
  const time    = new Date().toLocaleTimeString();
  const payloadStr = Object.keys(payload).length ? '\n' + JSON.stringify(payload, null, 2) : '';
  log.innerHTML += `<span class="${cls}">[${time}] ${escapeHtml(type)}</span>${escapeHtml(payloadStr)}\n\n`;
  log.scrollTop = log.scrollHeight;
}

function hideDownload() {
  downloadBtn.classList.add('hidden');
  downloadBtn.removeAttribute('href');
  finishedSection.classList.add('hidden');
}

// ── Test connection ───────────────────────────────────────────────────────────
testBtn.addEventListener('click', async () => {
  hideDownload();
  testResult.className = 'connection-badge';
  testResult.textContent = 'Testing…';
  try {
    const res = await fetch('/api/openrouter/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.value })
    });
    const data = await res.json();
    if (data.connected) {
      apiKeyTested = true;
      testResult.className = 'connection-badge connected';
      testResult.textContent = `Connected · ${data.modelCount || '?'} models`;
      convertBtn.disabled = false;
    } else {
      apiKeyTested = false;
      testResult.className = 'connection-badge failed';
      testResult.textContent = `Failed${data.statusCode ? ' · ' + data.statusCode : ''}`;
      convertBtn.disabled = true;
      dryRunBtn.disabled = true;
      buildBtn.disabled = true;
    }
  } catch (err) {
    apiKeyTested = false;
    testResult.className = 'connection-badge failed';
    testResult.textContent = 'Network error';
  }
});

// ── Convert prompt ────────────────────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  hideDownload();
  if (!apiKeyTested) return;
  planPreview.textContent = 'Converting…';
  planPreview.classList.remove('hidden');
  convertBtn.disabled = true;
  try {
    const res = await fetch('/api/plan/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.value, prompt: prompt.value, mode: currentMode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error);
    currentPlan = data.plan;
    planPreview.textContent = JSON.stringify(currentPlan, null, 2);
    dryRunBtn.disabled = false;
  } catch (err) {
    planPreview.textContent = `Error: ${err.message}`;
    currentPlan = null;
    dryRunBtn.disabled = true;
    buildBtn.disabled = true;
  } finally {
    convertBtn.disabled = false;
  }
});

// ── Dry run ───────────────────────────────────────────────────────────────────
dryRunBtn.addEventListener('click', async () => {
  hideDownload();
  if (!currentPlan) return;
  estimate.textContent = 'Validating…';
  try {
    const res = await fetch('/api/plan/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: currentPlan, mode: currentMode })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data.issues || []).map((i) => `${i.path}: ${i.message}`).join('; '));
    }
    currentPlan = data.plan;

    let html = `<span class="valid-tag">✓ Valid</span> &nbsp;${data.estimate.taskCount} tasks &nbsp;·&nbsp; estimated <b>$${data.estimate.totalUsd}</b> / budget $${data.estimate.budgetUsd}`;
    if (data.modelWarnings?.length) {
      html += `<div class="model-warnings">`;
      for (const w of data.modelWarnings) {
        if (w.suggestion) {
          html += `<div class="mw-warn">⚠ ${escapeHtml(w.original)} → <b>${escapeHtml(w.suggestion)}</b></div>`;
        } else {
          html += `<div class="mw-error">✕ ${escapeHtml(w.original)} not found on OpenRouter</div>`;
        }
      }
      html += `</div>`;
    }
    estimate.innerHTML = html;
    buildBtn.disabled = false;
  } catch (err) {
    estimate.innerHTML = `<span style="color:var(--danger)">Invalid:</span> ${escapeHtml(err.message)}`;
    buildBtn.disabled = true;
  }
});

// ── Build ─────────────────────────────────────────────────────────────────────
buildBtn.addEventListener('click', async () => {
  hideDownload();
  if (!currentPlan) return;
  buildBtn.disabled = true;
  log.innerHTML = '';
  log.classList.remove('hidden');
  statusBar.classList.remove('hidden');
  try {
    const res = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey.value,
        plan: currentPlan,
        options: { allowPartial: allowPartial.checked, mode: currentMode }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentJobId = data.jobId;
    setState(data.state);
    subscribeEvents(data.jobId);
  } catch (err) {
    setState('failed');
    logLine('job:failed', { message: err.message });
    buildBtn.disabled = false;
  }
});

// ── SSE ───────────────────────────────────────────────────────────────────────
function subscribeEvents(jobId) {
  const es = new EventSource(`/api/builds/${jobId}/events`);
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      logLine(ev.type, ev.payload);
      handleEvent(ev, jobId, es);
    } catch {
      logLine('parse-error', { raw: e.data });
    }
  };
  es.onerror = () => logLine('sse-error', { message: 'stream error' });
}

function handleEvent(ev, jobId, es) {
  const stateMap = {
    'job:running':    'running',
    'plan:created':   'planning',
    'estimate:ready': 'estimating',
    'task:start':     'generating',
    'review:start':   'reviewing',
    'repair:start':   'repairing',
    'package:start':  'packaging'
  };
  if (stateMap[ev.type]) setState(stateMap[ev.type]);

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
        <div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">${escapeHtml(s.projectName || '—')}</div></div>
        <div class="meta-item"><div class="meta-label">Files</div><div class="meta-value">${s.fileCount}</div></div>
        <div class="meta-item"><div class="meta-label">Cost</div><div class="meta-value">$${s.costUsd}</div></div>
        <div class="meta-item"><div class="meta-label">Tokens</div><div class="meta-value">${((s.tokens.prompt + s.tokens.completion) / 1000).toFixed(1)}k</div></div>
      `;
    })
    .catch(() => {});
}
