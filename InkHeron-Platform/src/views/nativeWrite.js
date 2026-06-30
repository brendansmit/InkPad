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
    .bar{height:58px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #d8d4c8;background:#fff}
    .brand{font-weight:800}
    .title{font-family:var(--serif);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .spacer{flex:1}
    .stat{font-size:13px;color:#657268;font-variant-numeric:tabular-nums}
    .stat.warn{color:#a75432;font-weight:800}
    .btn{border:1px solid #b8c2b9;background:#fff;color:#17221b;border-radius:7px;min-height:34px;padding:0 12px;font-weight:800;cursor:pointer}
    .btn.primary{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .shell{height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(280px,36%) 1fr}
    .passage{border-right:1px solid #d8d4c8;background:#fbfaf6;overflow:auto;padding:18px}
    .passage h2{margin:0 0 10px;font-size:14px}
    .passage .text{white-space:pre-wrap;font-family:var(--serif);font-size:16px;line-height:1.7}
    .editorWrap{display:flex;flex-direction:column;min-width:0;min-height:0}
    .tools{display:flex;align-items:center;gap:8px;min-height:46px;padding:8px 14px;border-bottom:1px solid #d8d4c8;background:#faf9f4}
    .editor{flex:1;overflow:auto;padding:34px 24px}
    #nativeEditor{max-width:760px;min-height:calc(100vh - 180px);margin:0 auto;background:#fff;border:1px solid #ddd7ca;border-radius:8px;padding:32px 36px;font-family:var(--serif);font-size:18px;line-height:1.75;outline:none;box-shadow:0 10px 28px rgba(31,42,36,.08)}
    #nativeEditor[contenteditable="false"]{background:#f7f7f4;color:#59635d}
    .empty{color:#8a938d}
    @media(max-width:820px){body{overflow:auto;height:auto}.shell{height:auto;display:block}.passage{border-right:0;border-bottom:1px solid #d8d4c8}.editor{padding:16px}#nativeEditor{min-height:60vh;padding:22px}}
  </style>
</head>
<body>
  <header class="bar">
    <div class="brand">InkPad</div>
    <div class="title">${escapeHtml(title)}</div>
    <div class="spacer"></div>
    <div class="stat" id="pastePolicy">Paste ${escapeHtml(policy?.paste_mode ?? 'log')}</div>
    <div class="stat" id="saveState">Saved</div>
    <div class="stat"><span id="wordCount">${pad.word_count}</span> words</div>
    <button class="btn primary" id="submitBtn" type="button" ${locked ? 'disabled' : ''}>Submit</button>
  </header>
  <main class="shell">
    <aside class="passage">
      <h2>Task</h2>
      <div class="text">${escapeHtml(prompt || 'No prompt added.')}</div>
      ${passageText ? `<h2 style="margin-top:22px">Reference</h2><div class="text">${escapeHtml(passageText)}</div>` : ''}
      ${passagePdf ? `<p><a href="/api/assignments/${assignmentId}/passage-pdf" target="_blank" rel="noopener">Open PDF passage</a></p>` : ''}
      ${dueAt ? `<p class="stat">Due ${escapeHtml(dueAt)}</p>` : ''}
    </aside>
    <section class="editorWrap">
      <div class="tools">
        <button class="btn" type="button" data-command="bold">B</button>
        <button class="btn" type="button" data-command="italic">I</button>
        <button class="btn" type="button" data-command="underline">U</button>
        <button class="btn" type="button" data-command="insertUnorderedList">List</button>
      </div>
      <div class="editor">
        <div id="nativeEditor" contenteditable="${locked ? 'false' : 'true'}" spellcheck="${spellcheck ? 'true' : 'false'}"></div>
      </div>
    </section>
  </main>
  <script>
    const initialPad = ${jsonScript(pad)};
    let currentPolicy = ${jsonScript(policy ?? { paste_mode: 'log', spellcheck_enabled: spellcheck !== false })};
    const csrfToken = ${jsonScript(csrfToken)};
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
      if(!confirm('Submit this writing?')) return;
      const response = await fetch('/api/native/pads/' + initialPad.id + '/submit', {
        method:'POST',
        headers:{ 'X-CSRF-Token':csrfToken }
      });
      if(response.ok){
        editor.setAttribute('contenteditable', 'false');
        submitBtn.disabled = true;
        saveState.textContent = 'Submitted';
      }else{
        saveState.textContent = 'Submit failed';
      }
    });
  </script>
</body>
</html>`;
}
