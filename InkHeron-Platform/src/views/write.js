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

export function renderWriteView({ title, dueAt, spellcheck, pasteBlock, etherpadPadId, padId, csrfToken }) {
  const dueLabel = formatDue(dueAt);
  const spellLabel = spellcheck ? 'Spellcheck on for this draft' : 'Spellcheck off for this draft';
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;
  // Emit a safe JS boolean literal for inline scripts
  const spellcheckJs = spellcheck ? 'true' : 'false';
  const pasteBlockJs = pasteBlock ? 'true' : 'false';
  // Safe injection: padId is a positive integer from the DB; csrfToken is a 64-char hex string
  const padIdJs = JSON.stringify(Number(padId) || 0);
  const csrfTokenJs = JSON.stringify(String(csrfToken ?? ''));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — InkHeron</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    /* write-view layout — matches inkheron_student_v2.html */
    body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh;}
    *{box-sizing:border-box;}
    .writetop{position:sticky;top:0;z-index:50;background:rgba(247,246,242,0.9);backdrop-filter:blur(10px);
      border-bottom:1px solid var(--border);padding:12px 26px;display:flex;align-items:center;gap:14px;}
    .backbtn{background:none;border:none;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--text-2);
      font-size:13.5px;font-weight:500;transition:background .2s;}
    .backbtn:hover{background:var(--surface-3);}
    .writetop .ttl{font-weight:600;font-size:14.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50vw;}
    .writetop .sp{flex:1;}
    .savestate{font-size:12.5px;color:var(--text-3);white-space:nowrap;display:flex;align-items:center;gap:5px;}
    .savestate .tick{color:var(--sage-500);}
    .savestate.saving{color:var(--amber-700);}
    .savestate.saving .tick{color:var(--amber-700);}
    .duebar{padding:10px 20px 0;}
    .duenote{background:var(--surface);border:1px solid var(--border);
      border-radius:var(--r-sm);padding:11px 15px;font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:8px;}
    .duenote .ic{font-size:14px;}
    .padwrap{margin:0;padding:0;flex:1;display:flex;flex-direction:column;}
    .padframe{background:var(--surface);border-top:1px solid var(--border);
      overflow:hidden;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padchrome{display:flex;align-items:center;gap:6px;padding:9px 14px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;}
    .pdot{width:9px;height:9px;border-radius:50%;}
    .scnote{font-size:11.5px;color:var(--text-3);}
    .zoom-wrap{margin-left:auto;display:flex;align-items:center;gap:6px;}
    .zoom-wrap label{font-size:11.5px;color:var(--text-3);}
    .zoom-select{font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;}
    .padiframe{flex:1;width:100%;border:none;min-height:0;display:block;}
    .writeactions{padding:12px 20px;display:flex;align-items:center;gap:12px;}
    .writeactions .sp{flex:1;}
    .wordcount{font-size:13px;color:var(--text-3);}
    .btn{font-size:13.5px;font-weight:600;padding:9px 18px;border-radius:var(--r-sm);cursor:pointer;
      transition:transform .12s var(--ease),box-shadow .2s;}
    .btn:hover{transform:translateY(-1px);}
    .btn:active{transform:translateY(0);}
    .btn.ghost{background:var(--surface);border:1.5px solid var(--border-2);color:var(--text);}
    .btn.p{background:var(--primary);color:#fff;border:none;box-shadow:0 4px 14px rgba(36,99,67,0.22);}
    .btn.p:hover{box-shadow:0 7px 20px rgba(36,99,67,0.30);}
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

<div class="padwrap">
  <div class="padframe">
    <div class="padchrome">
      <span class="pdot" style="background:#E2685C"></span>
      <span class="pdot" style="background:#E8B14C"></span>
      <span class="pdot" style="background:var(--green-500)"></span>
      <span class="scnote">${spellcheck ? '&#10003; ' : ''}${esc(spellLabel)}</span>
      <div class="zoom-wrap">
        <label for="zoom-sel">Zoom</label>
        <select id="zoom-sel" class="zoom-select">
          <option value="0.75">75%</option>
          <option value="0.9">90%</option>
          <option value="1" selected>100%</option>
          <option value="1.1">110%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
        </select>
      </div>
    </div>
    <iframe
      class="padiframe"
      id="padiframe"
      src="${padUrl}"
      title="Writing pad"
    ></iframe>
  </div>
</div>

<div class="writeactions">
  <span class="wordcount" id="wc"></span>
  <span class="sp"></span>
  <button class="btn ghost" id="save-btn">Save</button>
  <button class="btn p" id="submit-btn">Submit for grading</button>
</div>

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

  // ── Word count (Step 3.7 / ep_countable) ─────────────────────────────────
  // ep_countable renders a count element inside the Etherpad iframe.
  // Since we are same-origin, poll for it after the iframe loads.
  function syncWordCount() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc) return;
      var el = padDoc.querySelector('.ep_countable_words, .word-count, [data-word-count]');
      if (el) {
        var txt = el.textContent.trim();
        if (txt) wcEl.textContent = txt + (txt.match(/word/i) ? '' : ' words');
      }
    } catch (_) { /* cross-origin guard */ }
  }

  var wcInterval = setInterval(syncWordCount, 2000);

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
  var zoomSel = document.getElementById('zoom-sel');
  function applyZoom(level) {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc || !padDoc.head) return;
      var zs = padDoc.getElementById('ih-zoom');
      if (!zs) { zs = padDoc.createElement('style'); zs.id = 'ih-zoom'; padDoc.head.appendChild(zs); }
      zs.textContent = 'body{zoom:' + level + '!important}';
    } catch (_) {}
  }
  zoomSel.addEventListener('change', function () { applyZoom(Number(zoomSel.value)); });

  // ── Pad UI cleanup ───────────────────────────────────────────────────────
  // Inject CSS into the Etherpad outer document to hide non-essential chrome:
  // bottom toolbar icons, chat, user count, settings, share, timeslider.
  function applyPadUiCleanup() {
    try {
      var padDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!padDoc || !padDoc.head) return false;
      if (padDoc.getElementById('ih-ui-cleanup')) return true;
      var s = padDoc.createElement('style');
      s.id = 'ih-ui-cleanup';
      s.textContent =
        'ul.menu_right,ul.menu_right *{display:none!important}' +
        '#history-controls,.history-controls{display:none!important}' +
        '.buttonicon-clearauthorship,.buttonicon-import_export{display:none!important}' +
        '#chaticon,#chat,.chat-container,#chatbutton{display:none!important}' +
        '#online_count,#users,#userlist,.popup.users{display:none!important}';
      padDoc.head.appendChild(s);

      // Suppress author highlight colours in the inner editor iframe.
      try {
        var inner = padDoc.getElementById('editorcontainerIframe') ||
                    padDoc.querySelector('#editorcontainer iframe') ||
                    padDoc.querySelector('iframe.inner');
        if (inner && inner.contentDocument && inner.contentDocument.head) {
          var si = inner.contentDocument.createElement('style');
          si.textContent = 'span[class^="author-"],span[class*=" author-"]{background:transparent!important;border-left:none!important;}';
          inner.contentDocument.head.appendChild(si);
        }
      } catch (_) {}

      return true;
    } catch (_) { return false; }
  }

  var cleanupDone = false;
  var cleanupAttempts = 0;
  function tryCleanup() {
    if (cleanupDone) return;
    if (applyPadUiCleanup()) { cleanupDone = true; return; }
    if (++cleanupAttempts < 20) setTimeout(tryCleanup, 400);
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
