function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonScript(value) {
  return JSON.stringify(value).replaceAll('</', '<\\/');
}

export function renderNativeWriteView({
  title,
  assignmentId,
  pad,
  policy,
  csrfToken,
  dueAt,
  spellcheck,
  prompt,
  passageText,
  passagePdf,
}) {
  const locked = pad.state !== 'writing' && pad.state !== 'green_pen_open';
  const submitLabel = pad.state === 'green_pen_open' ? 'Resubmit' : 'Submit';
  const submitConfirm = pad.state === 'green_pen_open' ? 'Resubmit this rewrite?' : 'Submit this writing?';
  const submitDoneLabel = pad.state === 'green_pen_open' ? 'Resubmitted' : 'Submitted';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Native InkPad</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:var(--font);background:#f6f5f0;color:#1f2a24;height:100vh;overflow:hidden}
    .niw-bar{height:58px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #d8d4c8;background:#fff}
    .niw-brand{font-weight:800}
    .niw-title{font-family:var(--serif);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .niw-spacer{flex:1}
    .niw-stat{font-size:13px;color:#657268;font-variant-numeric:tabular-nums}
    .niw-stat.warn{color:#a75432;font-weight:800}
    .niw-btn{border:1px solid #b8c2b9;background:#fff;color:#17221b;border-radius:7px;min-height:34px;padding:0 12px;font-weight:800;cursor:pointer;font-family:inherit}
    .niw-btn.primary{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
    .niw-btn:disabled{opacity:.5;cursor:not-allowed}
    .niw-shell{height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(300px,420px) minmax(0,1fr)}
    .niw-passage{border-right:1px solid #d8d4c8;background:#fbfaf6;overflow:auto;padding:22px}
    .niw-passage h2{margin:0 0 10px;font-size:14px}
    .niw-passage .niw-text{white-space:pre-wrap;font-family:var(--serif);font-size:16px;line-height:1.7}
    .niw-editor-wrap{display:flex;flex-direction:column;min-width:0;min-height:0}
    .niw-tools{display:flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:8px 14px;border-bottom:1px solid #d8d4c8;background:#faf9f4}
    .niw-editor-stage{flex:1;overflow:auto;padding:36px 32px}
    #nativeEditor{display:block;width:min(100%,860px);min-height:calc(100vh - 190px);margin:0 auto;background:#fff;border:1px solid #ddd7ca;border-radius:8px;padding:34px 38px;font-family:var(--serif);font-size:18px;line-height:1.75;outline:none;box-shadow:0 10px 28px rgba(31,42,36,.08)}
    #nativeEditor[contenteditable="false"]{background:#f7f7f4;color:#59635d}
    .empty{color:#8a938d}
    @media(max-width:820px){body{overflow:auto;height:auto}.niw-shell{height:auto;display:block}.niw-passage{border-right:0;border-bottom:1px solid #d8d4c8}.niw-editor-stage{padding:16px}#nativeEditor{min-height:60vh;padding:22px}}
  </style>
</head>
<body>
  <header class="niw-bar">
    <div class="niw-brand">InkPad</div>
    <div class="niw-title">${escapeHtml(title)}</div>
    <div class="niw-spacer"></div>
    <div class="niw-stat" id="pastePolicy">Paste ${escapeHtml(policy?.paste_mode ?? 'log')}</div>
    <div class="niw-stat" id="saveState">Saved</div>
    <div class="niw-stat"><span id="wordCount">${pad.word_count}</span> words</div>
    <button class="niw-btn primary" id="submitBtn" type="button" ${locked ? 'disabled' : ''}>${escapeHtml(submitLabel)}</button>
  </header>
  <main class="niw-shell">
    <aside class="niw-passage">
      <h2>Task</h2>
      <div class="niw-text">${escapeHtml(prompt || 'No prompt added.')}</div>
      ${passageText ? `<h2 style="margin-top:22px">Reference</h2><div class="niw-text">${escapeHtml(passageText)}</div>` : ''}
      ${passagePdf ? `<p><a href="/api/assignments/${assignmentId}/passage-pdf" target="_blank" rel="noopener">Open PDF passage</a></p>` : ''}
      ${dueAt ? `<p class="niw-stat">Due ${escapeHtml(dueAt)}</p>` : ''}
    </aside>
    <section class="niw-editor-wrap">
      <div class="niw-tools">
        <button class="niw-btn" type="button" data-command="bold">B</button>
        <button class="niw-btn" type="button" data-command="italic">I</button>
        <button class="niw-btn" type="button" data-command="underline">U</button>
        <button class="niw-btn" type="button" data-command="insertUnorderedList">List</button>
      </div>
      <div class="niw-editor-stage">
        <div id="nativeEditor" contenteditable="${locked ? 'false' : 'true'}" spellcheck="${spellcheck ? 'true' : 'false'}"></div>
      </div>
    </section>
  </main>
  <script>
    const initialPad = ${jsonScript(pad)};
    let currentPolicy = ${jsonScript(policy ?? { paste_mode: 'log', spellcheck_enabled: spellcheck !== false })};
    const csrfToken = ${jsonScript(csrfToken)};
    const submitConfirm = ${jsonScript(submitConfirm)};
    const submitDoneLabel = ${jsonScript(submitDoneLabel)};
    const editor = document.getElementById('nativeEditor');
    const pastePolicy = document.getElementById('pastePolicy');
    const saveState = document.getElementById('saveState');
    const wordCount = document.getElementById('wordCount');
    const submitBtn = document.getElementById('submitBtn');
    let dirty = false;
    let saving = false;
    let lastSavedText = initialPad.plain_text || '';
    let currentVersion = initialPad.version || 1;

    editor.innerText = initialPad.plain_text || '';
    applyPolicy(currentPolicy);
    updateCount();

    function currentText(){ return editor.innerText.replace(/\\u00a0/g, ' '); }
    function countWords(text){
      const cleaned = text.replace(/[\\u200B\\u200C\\u200D\\u2060\\uFEFF]/g, '').trim();
      return cleaned ? cleaned.split(/\\s+/).filter(Boolean).length : 0;
    }
    function updateCount(){ wordCount.textContent = countWords(currentText()); }
    function documentPayload(){ return { type:'doc', content:[{ type:'text', text:currentText() }] }; }
    function applyPolicy(policy){
      currentPolicy = policy || currentPolicy;
      editor.spellcheck = currentPolicy.spellcheck_enabled !== false;
      pastePolicy.textContent = 'Paste ' + currentPolicy.paste_mode;
      pastePolicy.classList.toggle('warn', currentPolicy.paste_mode === 'block');
    }

    async function refreshPolicy(){
      try{
        const response = await fetch('/api/native/pads/' + initialPad.id + '/policy');
        if(!response.ok) return;
        const data = await response.json();
        applyPolicy(data.policy);
      }catch(_){}
    }

    async function recordPaste(length, inputType){
      try{
        await fetch('/api/native/pads/' + initialPad.id + '/paste-event', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
          body:JSON.stringify({ length, input_type:inputType || 'paste' })
        });
      }catch(_){}
    }

    async function saveNow(){
      if(saving || !dirty || editor.getAttribute('contenteditable') === 'false') return;
      const text = currentText();
      if(text === lastSavedText){ dirty = false; saveState.textContent = 'Saved'; return; }
      saving = true;
      saveState.textContent = 'Saving';
      try{
        const response = await fetch('/api/native/pads/' + initialPad.id + '/save', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
          body:JSON.stringify({ document:documentPayload(), plain_text:text, expected_version:currentVersion })
        });
        if(response.status === 409){
          const data = await response.json().catch(() => ({}));
          if(data.error === 'version_conflict'){
            saveState.textContent = 'Newer version open';
            return;
          }
        }
        if(!response.ok) throw new Error('save_failed');
        const data = await response.json();
        lastSavedText = data.pad.plain_text || '';
        currentVersion = data.pad.version || currentVersion;
        dirty = false;
        saveState.textContent = 'Saved';
      }catch(_){
        saveState.textContent = 'Save failed';
      }finally{
        saving = false;
      }
    }

    editor.addEventListener('input', () => {
      dirty = true;
      saveState.textContent = 'Unsaved';
      updateCount();
    });
    editor.addEventListener('blur', saveNow);
    setInterval(saveNow, 5000);
    setInterval(refreshPolicy, 5000);

    editor.addEventListener('paste', event => {
      const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      if(currentPolicy.paste_mode === 'allow') return;
      recordPaste(text.length || 1, 'paste');
      if(currentPolicy.paste_mode === 'block'){
        event.preventDefault();
        saveState.textContent = 'Paste blocked';
      }
    });

    document.querySelectorAll('[data-command]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        editor.focus();
        document.execCommand(button.dataset.command, false, null);
        dirty = true;
        updateCount();
      });
    });

    submitBtn.addEventListener('click', async () => {
      await saveNow();
      if(!confirm(submitConfirm)) return;
      const response = await fetch('/api/native/pads/' + initialPad.id + '/submit', {
        method:'POST',
        headers:{ 'X-CSRF-Token':csrfToken }
      });
      if(response.ok){
        editor.setAttribute('contenteditable', 'false');
        submitBtn.disabled = true;
        saveState.textContent = submitDoneLabel;
      }else{
        saveState.textContent = 'Submit failed';
      }
    });
  </script>
</body>
</html>`;
}
