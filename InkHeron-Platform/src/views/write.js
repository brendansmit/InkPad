function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDue(dueAt) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function renderWriteView({ title, dueAt, spellcheck, pasteBlock, etherpadPadId, padId, csrfToken, prompt, passageText, passagePdf, assignmentId }) {
  const dueLabel = formatDue(dueAt);
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;
  const spellcheckJs = spellcheck ? 'true' : 'false';
  const pasteBlockJs = pasteBlock ? 'true' : 'false';
  const padIdJs = JSON.stringify(Number(padId) || 0);
  const csrfTokenJs = JSON.stringify(String(csrfToken ?? ''));
  const hasPrompt = !!(prompt && prompt.trim());
  const hasPassage = !!(passageText || passagePdf);
  const assignmentIdSafe = Number(assignmentId) || 0;

  const promptBtn = hasPrompt
    ? `<button class="prompt-btn" id="prompt-btn" type="button">Task</button>`
    : '';

  const promptPanel = hasPrompt ? `
    <div class="prompt-panel" id="prompt-panel">
      <div class="prompt-panel-inner">
        <div class="prompt-label">Assignment task</div>
        <div class="prompt-text">${esc(prompt)}</div>
      </div>
    </div>` : '';

  const passagePanel = hasPassage ? `
    <div class="split-left">
      <div class="passage-head">Reference passage</div>
      ${passagePdf
        ? `<iframe class="passage-pdf-frame" src="/api/assignments/${assignmentIdSafe}/passage-pdf" title="Reference passage"></iframe>`
        : `<div class="passage-text-content">${esc(passageText)}</div>`
      }
    </div>` : '';

  // ── Padchrome toolbar ─────────────────────────────────────────────────────
  // All formatting controls in a single row; Etherpad's own toolbar is hidden.
  // data-key buttons click the corresponding hidden Etherpad [data-key] buttons.
  // data-cmd buttons use execCommand on ace_inner.
  // data-epcolor buttons trigger ep_colors programmatically.

  const fmtBtns = `
    <div class="fmt-group">
      <button class="fmt-btn" data-key="bold" title="Bold" onmousedown="return false"><b>B</b></button>
      <button class="fmt-btn" data-key="italic" title="Italic" onmousedown="return false"><i>I</i></button>
      <button class="fmt-btn" data-key="underline" title="Underline" onmousedown="return false"><u>U</u></button>
      <button class="fmt-btn" data-key="strikethrough" title="Strikethrough" onmousedown="return false"><s>S</s></button>
    </div>
    <span class="fmt-sep"></span>
    <div class="fmt-group">
      <button class="fmt-btn" data-cmd="justifyLeft" title="Align left" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><rect x="0" y="0" width="13" height="2" rx="1" fill="currentColor"/><rect x="0" y="4" width="9" height="2" rx="1" fill="currentColor"/><rect x="0" y="8" width="11" height="2" rx="1" fill="currentColor"/></svg>
      </button>
      <button class="fmt-btn" data-cmd="justifyCenter" title="Center" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><rect x="0" y="0" width="13" height="2" rx="1" fill="currentColor"/><rect x="2" y="4" width="9" height="2" rx="1" fill="currentColor"/><rect x="1" y="8" width="11" height="2" rx="1" fill="currentColor"/></svg>
      </button>
      <button class="fmt-btn" data-cmd="justifyRight" title="Align right" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><rect x="0" y="0" width="13" height="2" rx="1" fill="currentColor"/><rect x="4" y="4" width="9" height="2" rx="1" fill="currentColor"/><rect x="2" y="8" width="11" height="2" rx="1" fill="currentColor"/></svg>
      </button>
    </div>
    <span class="fmt-sep"></span>
    <div class="fmt-group">
      <button class="fmt-btn" data-key="insertorderedlist" title="Numbered list" onmousedown="return false">
        <svg width="21" height="18" viewBox="0 0 14 12"><text x="0" y="10" font-size="10" fill="currentColor" font-family="monospace">1.</text><rect x="7" y="1" width="7" height="2" rx="1" fill="currentColor"/><rect x="7" y="5" width="7" height="2" rx="1" fill="currentColor"/><rect x="7" y="9" width="7" height="2" rx="1" fill="currentColor"/></svg>
      </button>
      <button class="fmt-btn" data-key="insertunorderedlist" title="Bullet list" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><circle cx="1.5" cy="2" r="1.5" fill="currentColor"/><rect x="4" y="1" width="9" height="2" rx="1" fill="currentColor"/><circle cx="1.5" cy="6" r="1.5" fill="currentColor"/><rect x="4" y="5" width="9" height="2" rx="1" fill="currentColor"/><circle cx="1.5" cy="10" r="1.5" fill="currentColor"/><rect x="4" y="9" width="9" height="2" rx="1" fill="currentColor"/></svg>
      </button>
      <button class="fmt-btn" data-key="indent" title="Indent" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><rect x="0" y="0" width="13" height="2" rx="1" fill="currentColor"/><rect x="4" y="4" width="9" height="2" rx="1" fill="currentColor"/><rect x="4" y="8" width="9" height="2" rx="1" fill="currentColor"/><path d="M0 5 L3 6.5 L0 8Z" fill="currentColor"/></svg>
      </button>
      <button class="fmt-btn" data-key="outdent" title="Outdent" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 13 12"><rect x="0" y="0" width="13" height="2" rx="1" fill="currentColor"/><rect x="4" y="4" width="9" height="2" rx="1" fill="currentColor"/><rect x="4" y="8" width="9" height="2" rx="1" fill="currentColor"/><path d="M3 5 L0 6.5 L3 8Z" fill="currentColor"/></svg>
      </button>
    </div>
    <span class="fmt-sep"></span>
    <div class="fmt-group">
      <button class="fmt-btn" data-key="undo" title="Undo" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><path d="M3 6h9a5 5 0 0 1 0 10H8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="7,2 3,6 7,10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="fmt-btn" data-key="redo" title="Redo" onmousedown="return false">
        <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><path d="M17 6H8a5 5 0 0 0 0 10h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="13,2 17,6 13,10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <span class="fmt-sep"></span>
    <div class="clr-palette">
      <button class="clr-btn" data-epcolor="0" title="Black" style="background:#111111" onmousedown="return false"></button>
      <button class="clr-btn" data-epcolor="1" title="Red" style="background:#cc0000" onmousedown="return false"></button>
      <button class="clr-btn" data-epcolor="2" title="Green" style="background:#009900" onmousedown="return false"></button>
      <button class="clr-btn" data-epcolor="3" title="Blue" style="background:#0000cc" onmousedown="return false"></button>
      <button class="clr-btn" data-epcolor="5" title="Orange" style="background:#e67300" onmousedown="return false"></button>
    </div>
    <span class="fmt-sep"></span>
    <select id="fsize-sel" class="fsize-select" title="Font size">
      <option value="" disabled selected>Size</option>
      <option value="2">10</option>
      <option value="4">12</option>
      <option value="6">14</option>
      <option value="8">16</option>
      <option value="10">18</option>
      <option value="14">24</option>
      <option value="19">40</option>
    </select>`;

  const zoomSelect = `<div class="zoom-wrap">
        <label for="zoom-sel">Zoom</label>
        <select id="zoom-sel" class="zoom-select">
          <option value="0.75">75%</option>
          <option value="0.9">90%</option>
          <option value="1" selected>100%</option>
          <option value="1.1">110%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
        </select>
      </div>`;

  const padchrome = `
    <div class="padchrome">
      ${hasPrompt ? promptBtn : ''}
      <span class="wordcount" id="wc"></span>
      <span class="fmt-sep"></span>
      ${fmtBtns}
      ${zoomSelect}
    </div>`;

  const writeActions = `
    <div class="writeactions">
      <span class="sp"></span>
      <button class="btn ghost" id="save-btn">Save</button>
      <button class="btn p" id="submit-btn">Submit for grading</button>
    </div>`;

  const padContent = hasPassage ? `
<div class="padwrap has-passage">
  ${passagePanel}
  <div class="split-right">
    <div class="padframe">
      ${padchrome}
      ${promptPanel}
      <iframe class="padiframe" id="padiframe" src="${padUrl}" title="Writing pad"></iframe>
    </div>
    ${writeActions}
  </div>
</div>` : `
<div class="padwrap">
  <div class="padframe">
    ${padchrome}
    ${promptPanel}
    <iframe class="padiframe" id="padiframe" src="${padUrl}" title="Writing pad"></iframe>
  </div>
</div>
${writeActions}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — InkHeron</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh;}
    *{box-sizing:border-box;}
    .writetop{position:sticky;top:0;z-index:50;background:rgba(247,246,242,0.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:12px 26px;display:flex;align-items:center;gap:14px;}
    .backbtn{background:none;border:none;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--text-2);font-size:13.5px;font-weight:500;transition:background .2s;}
    .backbtn:hover{background:var(--surface-3);}
    .writetop .ttl{font-weight:600;font-size:14.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50vw;}
    .writetop .sp{flex:1;}
    .savestate{font-size:12.5px;color:var(--text-3);white-space:nowrap;display:flex;align-items:center;gap:5px;}
    .savestate .tick{color:var(--sage-500);}
    .savestate.saving{color:var(--amber-700);}
    .savestate.saving .tick{color:var(--amber-700);}
    .duebar{padding:10px 20px 0;}
    .duenote{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:11px 15px;font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:8px;}
    .duenote .ic{font-size:14px;}
    /* ── Pad layout ─────────────────────────────────── */
    .padwrap{margin:0;padding:0;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padwrap.has-passage{flex-direction:row;}
    .split-left{width:340px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface);overflow:hidden;}
    .split-right{flex:1;min-width:0;display:flex;flex-direction:column;}
    .passage-head{padding:9px 14px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);border-bottom:1px solid var(--border);flex-shrink:0;}
    .passage-text-content{flex:1;overflow-y:auto;padding:16px 18px;white-space:pre-wrap;font-family:var(--serif,Georgia,serif);font-size:14.5px;line-height:1.75;color:var(--text);}
    .passage-pdf-frame{flex:1;border:none;width:100%;display:block;}
    /* ── Padframe + chrome ─────────────────────────── */
    .padframe{background:var(--surface);border-top:1px solid var(--border);overflow:hidden;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padchrome{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;min-height:54px;overflow-x:auto;}
    .prompt-btn{font-size:11.5px;font-weight:700;color:var(--primary);background:var(--green-50,#f0fdf4);border:1px solid var(--green-200,#bbf7d0);border-radius:5px;padding:3px 10px;cursor:pointer;white-space:nowrap;flex-shrink:0;}
    .prompt-btn:hover{background:var(--green-100,#dcfce7);}
    .prompt-btn.active{background:var(--green-100,#dcfce7);border-color:var(--primary);}
    .wordcount{font-size:11px;color:var(--text-3);white-space:nowrap;flex-shrink:0;}
    .fmt-sep{width:1px;height:24px;background:var(--border);flex-shrink:0;margin:0 3px;}
    /* ── Toolbar buttons ────────────────────────────── */
    .fmt-group{display:flex;align-items:center;gap:2px;flex-shrink:0;}
    .fmt-btn{display:flex;align-items:center;justify-content:center;width:39px;height:39px;padding:0;border:1px solid transparent;border-radius:7px;background:none;cursor:pointer;color:var(--text-2);transition:background .15s,color .15s;font-size:19px;line-height:1;flex-shrink:0;}
    .fmt-btn b,.fmt-btn i,.fmt-btn u,.fmt-btn s{font-size:19px;pointer-events:none;}
    .fmt-btn:hover{background:var(--surface-3);color:var(--text);}
    .fmt-btn.active{background:var(--surface-3);color:var(--primary);border-color:var(--border);}
    /* ── Color swatches ─────────────────────────────── */
    .clr-palette{display:flex;align-items:center;gap:6px;flex-shrink:0;}
    .clr-btn{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;transition:transform .15s,border-color .15s;outline:none;flex-shrink:0;}
    .clr-btn:hover{transform:scale(1.25);}
    .clr-btn.active{border-color:var(--text);}
    /* ── Font size + Zoom ──────────────────────────── */
    .fsize-select{font-size:11.5px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;max-width:58px;flex-shrink:0;}
    .zoom-wrap{margin-left:auto;display:flex;align-items:center;gap:5px;flex-shrink:0;}
    .zoom-wrap label{font-size:11px;color:var(--text-3);}
    .zoom-select{font-size:11.5px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;}
    /* ── Prompt panel ───────────────────────────────── */
    .prompt-panel{display:none;border-bottom:1px solid var(--border);background:var(--surface-2,#f9f8f5);max-height:180px;overflow-y:auto;flex-shrink:0;}
    .prompt-panel.open{display:block;}
    .prompt-panel-inner{padding:12px 18px;}
    .prompt-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:6px;}
    .prompt-text{font-size:14px;line-height:1.65;color:var(--text);white-space:pre-wrap;}
    /* ── Pad iframe ─────────────────────────────────── */
    .padiframe{flex:1;width:100%;border:none;min-height:0;display:block;}
    /* ── Write actions ──────────────────────────────── */
    .writeactions{padding:12px 20px;display:flex;align-items:center;gap:12px;background:var(--bg);border-top:1px solid var(--border);flex-shrink:0;}
    .writeactions .sp{flex:1;}
    .btn{font-size:13.5px;font-weight:600;padding:9px 18px;border-radius:var(--r-sm);cursor:pointer;transition:transform .12s var(--ease),box-shadow .2s;}
    .btn:hover{transform:translateY(-1px);}
    .btn:active{transform:translateY(0);}
    .btn.ghost{background:var(--surface);border:1.5px solid var(--border-2);color:var(--text);}
    .btn.p{background:var(--primary);color:#fff;border:none;box-shadow:0 4px 14px rgba(36,99,67,0.22);}
    .btn.p:hover{box-shadow:0 7px 20px rgba(36,99,67,0.30);}
    @media(max-width:700px){.padwrap.has-passage{flex-direction:column;}.split-left{width:100%;height:45vh;border-right:none;border-bottom:1px solid var(--border);}}
  </style>
</head>
<body>

<div class="writetop">
  <button class="backbtn" onclick="history.back()">&#8592; Back</button>
  <span class="ttl">${esc(title)}</span>
  <span class="sp"></span>
  <span class="savestate" id="savestate"><span class="tick">&#10003;</span> Saved</span>
</div>

${dueLabel ? `<div class="duebar">
  <div class="duenote"><span class="ic">&#9711;</span> Due ${esc(dueLabel)}. You can keep editing until then.</div>
</div>` : ''}

${padContent}

<script>
(function () {
  'use strict';

  var SPELLCHECK = ${spellcheckJs};
  var PASTE_BLOCK = ${pasteBlockJs};
  var PAD_ID = ${padIdJs};
  var CSRF_TOKEN = ${csrfTokenJs};
  var saveEl = document.getElementById('savestate');
  var wcEl = document.getElementById('wc');
  var saveBtn = document.getElementById('save-btn');
  var iframe = document.getElementById('padiframe');

  // ── Prompt panel toggle ───────────────────────────────────────────────────
  var promptBtn = document.getElementById('prompt-btn');
  var promptPanel = document.getElementById('prompt-panel');
  if (promptBtn && promptPanel) {
    promptBtn.addEventListener('click', function () {
      var open = promptPanel.classList.toggle('open');
      promptBtn.classList.toggle('active', open);
      promptBtn.textContent = open ? 'Hide task' : 'Task';
    });
  }

  // ── Save-state UI ─────────────────────────────────────────────────────────
  var saveTimer = null;
  function setSaving() {
    clearTimeout(saveTimer);
    saveEl.className = 'savestate saving';
    saveEl.innerHTML = '<span class="tick">&#8230;</span> Saving';
    saveTimer = setTimeout(setSaved, 1500);
  }
  function setSaved() {
    saveEl.className = 'savestate';
    saveEl.innerHTML = '<span class="tick">&#10003;</span> Saved';
  }
  window.addEventListener('message', function (event) {
    if (!event.data || event.source !== iframe.contentWindow) return;
    var action = typeof event.data === 'object' ? event.data.action : '';
    if (action === 'change' || action === 'commit') setSaving();
  });
  saveBtn.addEventListener('click', function () {
    setSaving();
    setTimeout(setSaved, 800);
  });

  // ── Submit for grading ────────────────────────────────────────────────────
  var submitBtn = document.getElementById('submit-btn');
  if (submitBtn && PAD_ID) {
    submitBtn.addEventListener('click', function () {
      if (!confirm('Submit for grading? You can keep editing until the due date, but this marks your current version for your teacher.')) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      fetch('/api/pads/' + PAD_ID + '/submit', {
        method: 'POST',
        headers: { 'X-CSRF-Token': CSRF_TOKEN },
        credentials: 'same-origin',
      }).then(function (r) {
        if (r.ok) {
          submitBtn.textContent = '✓ Submitted';
          setSaved();
        } else {
          return r.json().then(function (d) { throw new Error(d.error || 'submit failed'); });
        }
      }).catch(function (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for grading';
        alert('Could not submit: ' + e.message);
      });
    });
  }

  // ── ace_inner accessor ─────────────────────────────────────────────────────
  function getAceInner() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc) return null;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return null;
      var aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
      return aceInner ? aceInner.contentDocument : aceOuter.contentDocument;
    } catch (_) { return null; }
  }

  // ── padDoc accessor (Etherpad outer iframe document) ─────────────────────
  function getPadDoc() {
    try { return iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document); }
    catch (_) { return null; }
  }

  // ── Click a hidden Etherpad toolbar button by data-key ───────────────────
  // Bold/italic/underline etc. go through Etherpad's changeset system this way.
  function clickEditbarBtn(key) {
    var padDoc = getPadDoc();
    if (!padDoc) return;
    try {
      var btn = padDoc.querySelector('[data-key="' + key + '"]');
      if (btn) { btn.click(); return; }
    } catch (_) {}
  }

  // Wire data-key buttons (text formatting + lists + undo/redo)
  document.querySelectorAll('.fmt-btn[data-key]').forEach(function (btn) {
    btn.addEventListener('click', function () { clickEditbarBtn(btn.dataset.key); });
  });

  // ── Alignment via ep_align hidden buttons ─────────────────────────────────
  var alignCmdMap = {
    'justifyLeft': '.ep_align_left',
    'justifyCenter': '.ep_align_center',
    'justifyRight': '.ep_align_right',
  };
  function applyEpAlign(cmd) {
    try {
      var padDoc = getPadDoc();
      if (!padDoc) return;
      var sel = alignCmdMap[cmd];
      var btn = sel && padDoc.querySelector(sel);
      if (btn) { btn.click(); return; }
    } catch (_) {}
    // Fallback: execCommand
    var doc = getAceInner();
    if (doc) try { doc.execCommand(cmd, false, null); } catch (_) {}
  }
  document.querySelectorAll('.fmt-btn[data-cmd]').forEach(function (btn) {
    btn.addEventListener('click', function () { applyEpAlign(btn.dataset.cmd); });
  });

  // ── Color via ep_colors ───────────────────────────────────────────────────
  function applyEpColor(colorIndex) {
    try {
      var padDoc = getPadDoc();
      if (!padDoc) return;
      var sel = padDoc.getElementById('color-selection');
      if (sel) {
        sel.value = String(colorIndex);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) {}
  }
  var activeClrBtn = null;
  document.querySelectorAll('.clr-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyEpColor(btn.dataset.epcolor);
      if (activeClrBtn) activeClrBtn.classList.remove('active');
      btn.classList.add('active');
      activeClrBtn = btn;
    });
  });

  // ── Font size via ep_font_size ────────────────────────────────────────────
  // ep_font_size stores a select at #font-size select.size-selection with index values.
  var fsizeSel = document.getElementById('fsize-sel');
  if (fsizeSel) {
    fsizeSel.addEventListener('change', function () {
      if (!fsizeSel.value) return;
      try {
        var padDoc = getPadDoc();
        if (!padDoc) return;
        var epSel = padDoc.querySelector('#font-size select.size-selection');
        if (epSel) {
          epSel.value = fsizeSel.value;
          epSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (_) {}
      fsizeSel.value = '';
    });
  }



  // ── Paste blocking ────────────────────────────────────────────────────────
  // Allow paste from: (1) within ace_inner, (2) passage panel / parent frame.
  var lastCopyFromPage = false;
  window.addEventListener('copy', function () { lastCopyFromPage = true; });
  window.addEventListener('cut', function () { lastCopyFromPage = true; });

  var pendingPasteLength = 0;

  function recordPaste(len) {
    if (!PAD_ID || len < 5) return;
    fetch('/api/pads/' + PAD_ID + '/paste-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN },
      body: JSON.stringify({ length: len, input_type: 'insertFromPaste' }),
      credentials: 'same-origin',
    }).catch(function () {});
  }

  function attachPasteListeners(innerDoc) {
    var lastCopyFromPad = false;
    innerDoc.addEventListener('copy', function () { lastCopyFromPad = true; });
    innerDoc.addEventListener('cut', function () { lastCopyFromPad = true; });

    innerDoc.addEventListener('beforeinput', function (evt) {
      if (evt.inputType !== 'insertFromPaste') return;
      if (PASTE_BLOCK) {
        if (!lastCopyFromPad && !lastCopyFromPage) {
          evt.preventDefault();
          return;
        }
        lastCopyFromPad = false;
        lastCopyFromPage = false;
      }
      try {
        var text = evt.dataTransfer ? evt.dataTransfer.getData('text/plain') : '';
        pendingPasteLength = text ? text.length : 0;
      } catch (_) { pendingPasteLength = 0; }
    });

    innerDoc.addEventListener('input', function (evt) {
      if (evt.inputType !== 'insertFromPaste') return;
      var len = pendingPasteLength;
      pendingPasteLength = 0;
      recordPaste(len);
    });
  }

  var pasteAttached = false;
  var pasteAttempts = 0;
  function tryAttachPaste() {
    if (pasteAttached) return;
    var doc = getAceInner();
    if (doc) { attachPasteListeners(doc); pasteAttached = true; return; }
    if (++pasteAttempts < 30) setTimeout(tryAttachPaste, 500);
  }

  // ── Word count ─────────────────────────────────────────────────────────────
  function syncWordCount() {
    try {
      var doc = getAceInner();
      if (!doc) return;
      var body = doc.querySelector('#innerdocbody, .innerdocbody, [contenteditable="true"]');
      if (!body) return;
      var text = body.innerText || body.textContent || '';
      var words = text.trim() ? text.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length : 0;
      var chars = text.replace(/[\s​]/g, '').length;
      wcEl.textContent = words + ' words · ' + chars + ' chars';
    } catch (_) {}
  }
  var wcInterval = setInterval(syncWordCount, 1500);

  // ── Spellcheck ─────────────────────────────────────────────────────────────
  function applySpellcheck() {
    try {
      var padDoc = getPadDoc();
      if (!padDoc) return false;
      var outerFrame = padDoc.querySelector('iframe[name="ace_outer"], #editorcontainerbox iframe');
      if (!outerFrame || !outerFrame.contentDocument) return false;
      var editable = outerFrame.contentDocument.querySelector('#innerdocbody, [contenteditable="true"]');
      if (!editable) return false;
      editable.setAttribute('spellcheck', SPELLCHECK ? 'true' : 'false');
      return true;
    } catch (_) { return false; }
  }
  var spellRetries = 0;
  function trySpellcheck() {
    if (applySpellcheck()) return;
    if (++spellRetries < 20) setTimeout(trySpellcheck, 500);
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  // #editorcontainerbox lives inside ace_outer, not padDoc — must target that frame.
  var zoomSel = document.getElementById('zoom-sel');
  function applyZoom(level) {
    try {
      var padDoc = getPadDoc();
      if (!padDoc) return;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument || !aceOuter.contentDocument.head) return;
      var outerDoc = aceOuter.contentDocument;
      var zs = outerDoc.getElementById('ih-zoom');
      if (!zs) { zs = outerDoc.createElement('style'); zs.id = 'ih-zoom'; outerDoc.head.appendChild(zs); }
      zs.textContent = '#editorcontainerbox{zoom:' + level + '!important;transform-origin:top left;}';
    } catch (_) {}
  }
  zoomSel && zoomSel.addEventListener('change', function () { applyZoom(Number(zoomSel.value)); });

  // ── Pad UI cleanup + author color suppression ─────────────────────────────
  function injectInnerFrameStyles(doc) {
    if (!doc || !doc.head) return false;
    if (!doc.getElementById('ih-author-suppress')) {
      var s = doc.createElement('style');
      s.id = 'ih-author-suppress';
      // Force white bg on the writing surface and kill author highlight colours.
      // #innerdocbody span beats .authorColors .author-XXX on specificity (id+el > class+class).
      s.textContent =
        ':root,html,body{color-scheme:light!important;background:#fff!important;color:#000!important;}' +
        '#innerdocbody,#outerdocbody{background:#fff!important;color:#000!important;}' +
        '#editorcontainerbox{background:#fff!important;}' +
        '#innerdocbody span{background:none!important;background-color:transparent!important;' +
        'border-left:none!important;box-shadow:none!important;}';
      doc.head.appendChild(s);
    }
    return true;
  }

  function applyPadUiCleanup() {
    try {
      var padDoc = getPadDoc();
      if (!padDoc || !padDoc.head) return false;

      if (!padDoc.getElementById('ih-ui-cleanup')) {
        var s = padDoc.createElement('style');
        s.id = 'ih-ui-cleanup';
        s.textContent =
          // Force light mode on the outer pad iframe
          ':root,html,body{color-scheme:light!important;background:#fff!important;color:#000!important;}' +
          // Hide Etherpad's own toolbar
          '#editbar{display:none!important}' +
          // Hide ALL chat elements — EP 3.x uses several different selectors
          '#chaticon,#chat,#chatbutton,#chatAndUsers,.chat-container,.buttonicon-chat,' +
          '.chatbuttons,#chatcounter,.chat,.stick-to-bottom{display:none!important}' +
          // Hide user list, right-side chrome
          'ul.menu_right,ul.menu_right *{display:none!important}' +
          '#history-controls,.history-controls{display:none!important}' +
          '#online_count,#users,#userlist,.popup.users{display:none!important}' +
          // Hide ep_colors, ep_align, ep_font_size native UIs
          '#color,#color-selection{display:none!important}' +
          '.ep_align_left,.ep_align_center,.ep_align_right,.ep_align_justify{display:none!important}' +
          '#font-size,li#font-size{display:none!important}';
        padDoc.head.appendChild(s);
      }

      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return false;
      var aoDoc = aceOuter.contentDocument;
      injectInnerFrameStyles(aoDoc);
      // EP may set body background via inline JS which beats stylesheet !important.
      // Override with setProperty which wins over both stylesheet rules and inline styles.
      if (aoDoc.body) {
        aoDoc.body.style.setProperty('background', '#fff', 'important');
        aoDoc.body.style.setProperty('background-color', '#fff', 'important');
      }
      var edBox = aoDoc.getElementById('editorcontainerbox');
      if (edBox) edBox.style.setProperty('background', '#fff', 'important');

      var aceInner = aoDoc.querySelector('iframe[name="ace_inner"]');
      // Don't mark done until aceInner is also injected — it loads slightly later.
      if (!aceInner || !aceInner.contentDocument) return false;
      injectInnerFrameStyles(aceInner.contentDocument);

      return true;
    } catch (_) { return false; }
  }

  var cleanupDone = false;
  var cleanupAttempts = 0;
  function tryCleanup() {
    if (cleanupDone) return;
    if (applyPadUiCleanup()) { cleanupDone = true; return; }
    if (++cleanupAttempts < 40) setTimeout(tryCleanup, 300);
  }

  iframe.addEventListener('load', function () {
    setTimeout(trySpellcheck, 200);
    setTimeout(tryAttachPaste, 500);
    setTimeout(tryCleanup, 300);
    syncWordCount();
  });

  window.addEventListener('beforeunload', function () { clearInterval(wcInterval); });
}());
</script>

</body>
</html>`;
}
