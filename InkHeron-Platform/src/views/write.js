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

export function renderWriteView({ title, dueAt, spellcheck, etherpadPadId, padId, csrfToken }) {
  const dueLabel = formatDue(dueAt);
  const spellLabel = spellcheck ? 'Spellcheck on for this draft' : 'Spellcheck off for this draft';
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;
  // Emit a safe JS boolean literal for inline scripts
  const spellcheckJs = spellcheck ? 'true' : 'false';
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
    .duebar{max-width:880px;margin:18px auto 0;padding:0 26px;}
    .duenote{background:var(--surface);border:1px solid var(--border);
      border-radius:var(--r-sm);padding:11px 15px;font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:8px;}
    .duenote .ic{font-size:14px;}
    .padwrap{max-width:880px;margin:18px auto 0;padding:0 26px;flex:1;display:flex;flex-direction:column;}
    .padframe{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);
      overflow:hidden;flex:1;display:flex;flex-direction:column;min-height:500px;}
    .padchrome{display:flex;align-items:center;gap:6px;padding:9px 14px;border-bottom:1px solid var(--border);background:var(--surface);}
    .pdot{width:9px;height:9px;border-radius:50%;}
    .scnote{margin-left:auto;font-size:11.5px;color:var(--text-3);}
    .padiframe{flex:1;width:100%;border:none;min-height:480px;display:block;}
    .writeactions{max-width:880px;margin:20px auto;padding:0 26px;display:flex;align-items:center;gap:12px;width:100%;}
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

    // Save-state messages from Etherpad
    if (event.source === iframe.contentWindow) {
      var action = typeof data === 'object' ? data.action : '';
      if (action === 'change' || action === 'commit') setSaving();
    }

    // Paste events from ep_inkheron_paste (come from inside Etherpad's nested iframes)
    if (typeof data === 'object' && data.type === 'ih_paste_event' && PAD_ID) {
      fetch('/api/pads/' + PAD_ID + '/paste-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN },
        body: JSON.stringify({ length: data.length, input_type: data.inputType }),
        credentials: 'same-origin',
      }).catch(function () {}); // fire-and-forget; never interrupt the student
    }
  });

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

  iframe.addEventListener('load', function () {
    setTimeout(trySpellcheck, 200);
    syncWordCount();
  });

  // Also clean up interval if the user navigates away.
  window.addEventListener('beforeunload', function () { clearInterval(wcInterval); });
}());
</script>

</body>
</html>`;
}
