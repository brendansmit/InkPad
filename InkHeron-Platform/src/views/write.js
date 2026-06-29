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
  const spellLabel = spellcheck ? 'Spellcheck on for this draft' : 'Spellcheck off for this draft';
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
    /* ── Pad layout ──────────────────────────────────── */
    .padwrap{margin:0;padding:0;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padwrap.has-passage{flex-direction:row;}
    .split-left{width:340px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface);overflow:hidden;}
    .split-right{flex:1;min-width:0;display:flex;flex-direction:column;}
    .passage-head{padding:9px 14px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);border-bottom:1px solid var(--border);flex-shrink:0;}
    .passage-text-content{flex:1;overflow-y:auto;padding:16px 18px;white-space:pre-wrap;font-family:var(--serif,Georgia,serif);font-size:14.5px;line-height:1.75;color:var(--text);}
    .passage-pdf-frame{flex:1;border:none;width:100%;display:block;}
    /* ── Padframe ──────────────────────────────────────── */
    .padframe{background:var(--surface);border-top:1px solid var(--border);overflow:hidden;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padchrome{display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;min-height:36px;}
    .prompt-btn{font-size:11.5px;font-weight:700;color:var(--primary);background:var(--green-50,#f0fdf4);border:1px solid var(--green-200,#bbf7d0);border-radius:5px;padding:3px 10px;cursor:pointer;}
    .prompt-btn:hover{background:var(--green-100,#dcfce7);}
    .prompt-btn.active{background:var(--green-100,#dcfce7);border-color:var(--primary);}
    .zoom-wrap{margin-left:auto;display:flex;align-items:center;gap:6px;}
    .zoom-wrap label{font-size:11.5px;color:var(--text-3);}
    .zoom-select{font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;}
    .wordcount{font-size:12px;color:var(--text-3);}
    /* ── Prompt panel ──────────────────────────────────── */
    .prompt-panel{display:none;border-bottom:1px solid var(--border);background:var(--surface-2,#f9f8f5);max-height:180px;overflow-y:auto;flex-shrink:0;}
    .prompt-panel.open{display:block;}
    .prompt-panel-inner{padding:12px 18px;}
    .prompt-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:6px;}
    .prompt-text{font-size:14px;line-height:1.65;color:var(--text);white-space:pre-wrap;}
    /* ── Pad iframe ──────────────────────────────────────── */
    .padiframe{flex:1;width:100%;border:none;min-height:0;display:block;}
    /* ── Write actions ───────────────────────────────────── */
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

  // ── Save-state UI (Step 3.7) ─────────────────────────────────────────────
  // Etherpad autosaves on every keystroke. We show "Saving…" briefly
  // whenever the iframe fires a message indicating a change, then settle to
  // "Saved ✓" after 1.5 s of silence.
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

  // Etherpad emits postMessages for various events; "padInitialized" means
  // it finished loading, "message" type with action "change" means a revision
  // was committed. We listen broadly and use any revision-related message.
  window.addEventListener('message', function (event) {
    if (!event.data) return;
    var data = event.data;
    if (event.source === iframe.contentWindow) {
      var action = typeof data === 'object' ? data.action : '';
      if (action === 'change' || action === 'commit') setSaving();
    }
  });

  // ── Paste detection (Step 5.2 / 5.3) ─────────────────────────────────────
  // Direct DOM approach — same-origin access through nginx means we can reach
  // inside Etherpad's nested iframes without a plugin.
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

  function getAceInnerDoc() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc) return null;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return null;
      var aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
      if (aceInner && aceInner.contentDocument) return aceInner.contentDocument;
      // Some builds have a flatter structure
      return aceOuter.contentDocument;
    } catch (_) { return null; }
  }

  function attachPasteListeners(innerDoc) {
    var lastCopyFromPad = false;

    // Track copies from within the pad so we can allow intra-pad paste
    innerDoc.addEventListener('copy', function () { lastCopyFromPad = true; });
    innerDoc.addEventListener('cut', function () { lastCopyFromPad = true; });

    innerDoc.addEventListener('beforeinput', function (evt) {
      if (evt.inputType !== 'insertFromPaste') return;
      if (PASTE_BLOCK) {
        if (!lastCopyFromPad) { evt.preventDefault(); return; }
        lastCopyFromPad = false; // consume — next paste must come from a fresh in-pad copy
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
    var doc = getAceInnerDoc();
    if (doc) { attachPasteListeners(doc); pasteAttached = true; return; }
    if (++pasteAttempts < 30) setTimeout(tryAttachPaste, 500);
  }

  // Manually clicking Save just confirms/flushes the indicator.
  saveBtn.addEventListener('click', function () {
    setSaving();
    // Force a brief "Saving..." then Saved to give psychological confirmation.
    setTimeout(setSaved, 800);
  });

  // ── Word count ────────────────────────────────────────────────────────────
  // Read text directly from ace_inner (the innermost editor iframe).
  function getAceInnerDocForCount() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc) return null;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return null;
      var aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
      return aceInner ? aceInner.contentDocument : aceOuter.contentDocument;
    } catch (_) { return null; }
  }

  function syncWordCount() {
    try {
      var doc = getAceInnerDocForCount();
      if (!doc) return;
      var body = doc.querySelector('#innerdocbody, .innerdocbody, [contenteditable="true"]');
      if (!body) return;
      var text = body.innerText || body.textContent || '';
      var words = text.trim() ? text.trim().split(/\s+/).filter(function(w){return w.length > 0;}).length : 0;
      var chars = text.replace(/[\s​]/g, '').length;
      wcEl.textContent = words + ' words · ' + chars + ' chars';
    } catch (_) {}
  }

  var wcInterval = setInterval(syncWordCount, 1500);

  // ── Spellcheck flag (Step 3.6) ────────────────────────────────────────────
  // The padchrome note already shows the state. Here we attempt to set the
  // spellcheck attribute on Etherpad's contenteditable surface once the iframe
  // and its inner ACE editor iframe have finished loading.
  function applySpellcheck() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc) return false;
      // Etherpad nests the editor in a second iframe (ace_outer / ace_inner)
      var innerFrame = padDoc.querySelector('iframe[name="ace_outer"], iframe.ace_outer, #editorcontainerbox iframe');
      if (!innerFrame || !innerFrame.contentDocument) return false;
      var editable = innerFrame.contentDocument.querySelector('#innerdocbody, [contenteditable="true"]');
      if (!editable) return false;
      editable.setAttribute('spellcheck', SPELLCHECK ? 'true' : 'false');
      return true;
    } catch (_) { return false; }
  }

  // Retry until the inner frame is accessible (it loads after the outer frame).
  var spellRetries = 0;
  function trySpellcheck() {
    if (applySpellcheck()) return;
    spellRetries++;
    if (spellRetries < 20) setTimeout(trySpellcheck, 500);
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────
  // Zoom only the editor content area, not Etherpad's formatting toolbar.
  var zoomSel = document.getElementById('zoom-sel');
  function applyZoom(level) {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc || !padDoc.head) return;
      var zs = padDoc.getElementById('ih-zoom');
      if (!zs) { zs = padDoc.createElement('style'); zs.id = 'ih-zoom'; padDoc.head.appendChild(zs); }
      zs.textContent = '#editorcontainerbox{zoom:' + level + '!important}';
    } catch (_) {}
  }
  zoomSel && zoomSel.addEventListener('change', function () { applyZoom(Number(zoomSel.value)); });

  // ── Pad UI cleanup + author color suppression ────────────────────────────
  function injectAuthorColorSuppression(doc) {
    if (!doc || !doc.head || doc.getElementById('ih-author-suppress')) return;
    var s = doc.createElement('style');
    s.id = 'ih-author-suppress';
    s.textContent =
      'span[class^="author-"],span[class*=" author-"]{' +
      'background:transparent!important;background-color:transparent!important;' +
      'border-left:none!important;box-shadow:none!important;}';
    doc.head.appendChild(s);
  }

  function applyPadUiCleanup() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc || !padDoc.head) return false;

      // Outer-doc cleanup: hide right-side toolbar chrome, chat, etc.
      if (!padDoc.getElementById('ih-ui-cleanup')) {
        var s = padDoc.createElement('style');
        s.id = 'ih-ui-cleanup';
        s.textContent =
          'ul.menu_right,ul.menu_right *{display:none!important}' +
          '#history-controls,.history-controls{display:none!important}' +
          '.buttonicon-clearauthorship,.buttonicon-import_export{display:none!important}' +
          '#chaticon,#chat,.chat-container,#chatbutton{display:none!important}' +
          '#online_count,#users,#userlist,.popup.users{display:none!important}' +
          // ep_colors: style the color select as a visual swatch
          '#color-selection{width:28px;height:28px;padding:0;border-radius:5px;' +
          'cursor:pointer;border:1.5px solid rgba(0,0,0,.18);font-size:0;text-indent:-9999px;' +
          'appearance:none;-webkit-appearance:none;background-color:#999;}';
        padDoc.head.appendChild(s);

        // JS: update select background to show active color as swatch
        var sc = padDoc.createElement('script');
        sc.textContent = '(function(){' +
          'var cm={"0":"#111","1":"#cc0000","2":"#009900","3":"#0000cc","4":"#e8d000","5":"#e67300"};' +
          'function refresh(sel){sel.style.backgroundColor=cm[sel.value]||"#999";}' +
          'function init(){var sel=document.getElementById("color-selection");' +
          'if(!sel){setTimeout(init,1000);return;}' +
          'sel.addEventListener("change",function(){refresh(sel);});refresh(sel);}' +
          'init();})();';
        padDoc.body.appendChild(sc);
      }

      // ace_outer iframe — must be loaded before we can suppress author colors
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return false; // not ready yet

      injectAuthorColorSuppression(aceOuter.contentDocument);

      var aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
      if (aceInner && aceInner.contentDocument) {
        injectAuthorColorSuppression(aceInner.contentDocument);
      }

      return true; // ace_outer found — stop retrying
    } catch (_) { return false; }
  }

  var cleanupDone = false;
  var cleanupAttempts = 0;
  function tryCleanup() {
    if (cleanupDone) return;
    if (applyPadUiCleanup()) { cleanupDone = true; return; }
    if (++cleanupAttempts < 30) setTimeout(tryCleanup, 400);
  }

  iframe.addEventListener('load', function () {
    setTimeout(trySpellcheck, 200);
    setTimeout(tryAttachPaste, 500);
    setTimeout(tryCleanup, 300);
    syncWordCount();
  });

  // Also clean up interval if the user navigates away.
  window.addEventListener('beforeunload', function () { clearInterval(wcInterval); });
}());
</script>

</body>
</html>`;
}
