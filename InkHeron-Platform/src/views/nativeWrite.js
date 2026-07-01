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

function iconSvg(name) {
  const icons = {
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v5"/><path d="M4 12c2.5-3.5 5.7-5.2 9.4-4.9 3.8.3 6.6 3.2 6.6 6.9 0 3.3-2.5 6-6 6h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7h5v5"/><path d="M20 12c-2.5-3.5-5.7-5.2-9.4-4.9C6.8 7.4 4 10.3 4 14c0 3.3 2.5 6 6 6h3"/></svg>',
    bullets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>',
    numbers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="M4 5h1v4"/><path d="M3.5 9h3"/><path d="M3 12.5c.4-.7 1-1 1.8-1 .9 0 1.6.5 1.6 1.4 0 .7-.5 1.2-1.2 1.7L3 16h3.5"/><path d="M3.5 18h2a1 1 0 0 1 0 2h-1a1 1 0 0 0 0 2h2"/></svg>',
    outdent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6h8"/><path d="M12 12h8"/><path d="M12 18h8"/><path d="M4 12h5"/><path d="M7 9l-3 3 3 3"/></svg>',
    indent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6h8"/><path d="M12 12h8"/><path d="M12 18h8"/><path d="M4 12h5"/><path d="M6 9l3 3-3 3"/></svg>',
    alignLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 10h10"/><path d="M4 14h16"/><path d="M4 18h10"/></svg>',
    alignCenter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M7 10h10"/><path d="M4 14h16"/><path d="M7 18h10"/></svg>',
    alignRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M10 10h10"/><path d="M4 14h16"/><path d="M10 18h10"/></svg>',
    textColor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14"/><path d="M8 16l4-12 4 12"/><path d="M9.5 12h5"/></svg>',
    highlight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"/><path d="M8 15l8-8 3 3-8 8H8v-3z"/><path d="M14 9l3 3"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15l8-8 7 7-5 5H8l-4-4z"/><path d="M9 20h11"/></svg>',
  };
  return icons[name] ?? '';
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
    .niw-stat{font-size:13px;color:#657268;font-variant-numeric:tabular-nums;white-space:nowrap}
    .niw-stat.warn{color:#a75432;font-weight:800}
    .niw-btn{border:1px solid #b8c2b9;background:#fff;color:#17221b;border-radius:7px;min-height:34px;padding:0 10px;font-weight:800;cursor:pointer;font-family:inherit}
    .niw-icon-btn{width:36px;padding:0}
    .niw-icon{width:20px;height:20px;display:block}
    .niw-icon path,.niw-icon circle{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .niw-btn.active{background:#dfe9df;border-color:#2f6f4e;color:#183d2a}
    .niw-btn.primary{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
    .niw-btn:disabled{opacity:.5;cursor:not-allowed}
    .niw-select{border:1px solid #b8c2b9;border-radius:7px;min-height:34px;background:#fff;color:#17221b;font:inherit;font-weight:800;padding:0 8px;width:auto}
    .niw-zoom{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#657268}
    .niw-zoom input{width:116px}
    .niw-shell{--reader-width:420px;--page-width:794px;--editor-zoom:1;height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(260px,var(--reader-width)) 8px minmax(0,1fr)}
    .niw-passage{border-right:1px solid #d8d4c8;background:#f0eee7;overflow:auto;padding:18px;display:grid;gap:14px;align-content:start}
    .niw-source-card{background:#fff;border:1px solid #d8d4c8;border-radius:8px;padding:16px;box-shadow:0 5px 18px rgba(31,42,36,.06)}
    .niw-source-card.reference{background:#f8fbff;border-color:#bfd0df}
    .niw-source-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;border-bottom:1px solid #e4e0d6;padding-bottom:8px}
    .niw-source-card.reference .niw-source-head{border-color:#d5e2ec}
    .niw-source-head h2{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#657268}
    .niw-source-tools{margin-left:auto;display:flex;gap:5px}
    .niw-source-btn{min-height:28px;padding:0 8px;border-radius:6px;border:1px solid #b8c2b9;background:#fff;font-weight:800;cursor:pointer}
    .niw-source-btn svg{width:17px;height:17px;display:block}
    .niw-source-btn path,.niw-source-btn circle{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .niw-passage .niw-text{white-space:pre-wrap;font-family:var(--font);font-size:15px;line-height:1.65;outline:none}
    .niw-local-underline{text-decoration:underline;text-decoration-thickness:2px;text-decoration-color:#2f6f4e}
    .niw-local-highlight{background:#fff0a6}
    .niw-resizer{background:#e5e1d6;cursor:col-resize;position:relative}
    .niw-resizer::after{content:'';position:absolute;inset:0 3px;background:#bdb6a8;border-radius:99px;opacity:.65}
    .niw-editor-wrap{display:flex;flex-direction:column;min-width:0;min-height:0}
    .niw-tools{display:flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:8px 14px;border-bottom:1px solid #d8d4c8;background:#faf9f4;flex-wrap:wrap}
    .niw-divider{width:1px;height:28px;background:#d8d4c8;margin:0 3px}
    .niw-editor-stage{flex:1;overflow:auto;padding:36px 32px}
    .niw-page-shell{width:var(--page-width);max-width:100%;margin:0 auto;display:grid;grid-template-columns:46px minmax(0,1fr);align-items:start;zoom:var(--editor-zoom)}
    .niw-line-numbers{min-height:calc(var(--page-width) * 1.414);border:1px solid #ddd7ca;border-right:0;border-radius:8px 0 0 8px;background:#f3f1eb;color:#8a938d;font-family:var(--mono);font-size:12px;line-height:31.5px;text-align:right;padding:34px 9px 34px 0;user-select:none;white-space:pre}
    #nativeEditor{display:block;width:100%;min-height:calc(var(--page-width) * 1.414);margin:0;background:#fff;border:1px solid #ddd7ca;border-radius:0 8px 8px 0;padding:34px 38px;font-family:var(--font);font-weight:400;font-size:18px;line-height:1.75;outline:none;box-shadow:0 10px 28px rgba(31,42,36,.08)}
    #nativeEditor p,#nativeEditor div{margin:0 0 1em}
    #nativeEditor ul,#nativeEditor ol{margin:0 0 1em 1.3em;padding:0}
    #nativeEditor[contenteditable="false"]{background:#f7f7f4;color:#59635d}
    .niw-swatch{width:24px;min-height:24px;border-radius:5px;border:1px solid #9ba89f;cursor:pointer;padding:0}
    .niw-popover{position:relative}
    .niw-palette{position:absolute;top:40px;left:0;z-index:20;display:none;grid-template-columns:repeat(3,24px);gap:6px;padding:8px;background:#fff;border:1px solid #b8c2b9;border-radius:8px;box-shadow:0 12px 24px rgba(31,42,36,.16)}
    .niw-popover.open .niw-palette{display:grid}
    .niw-local-highlight-yellow{background:#fff0a6}
    .niw-local-highlight-green{background:#c7f9cc}
    .niw-local-highlight-blue{background:#bfdbfe}
    .niw-local-highlight-pink{background:#fecaca}
    .empty{color:#8a938d}
    @media(max-width:1080px){.niw-bar{gap:9px}.niw-stat{font-size:12px}.niw-btn{padding:0 10px}}
    @media(max-width:820px){body{overflow:auto;height:auto}.niw-shell{height:auto;display:block}.niw-passage{border-right:0;border-bottom:1px solid #d8d4c8}.niw-resizer{display:none}.niw-editor-stage{padding:16px}.niw-page-shell{width:100%;grid-template-columns:34px minmax(0,1fr)}.niw-line-numbers{font-size:11px;padding-right:6px}#nativeEditor{min-height:60vh;padding:22px}}
  </style>
</head>
<body>
  <header class="niw-bar">
    <div class="niw-brand">InkPad</div>
    <div class="niw-title">${escapeHtml(title)}</div>
    <div class="niw-spacer"></div>
    <div class="niw-stat" id="pastePolicy" hidden>Paste ${escapeHtml(policy?.paste_mode ?? 'log')}</div>
    <div class="niw-stat" id="saveState">Saved</div>
    <div class="niw-stat"><span id="wordCount">${pad.word_count}</span> words</div>
    <div class="niw-stat"><span id="charCount">0</span> chars</div>
    <div class="niw-stat"><span id="sentenceCount">0</span> sentences</div>
    <button class="niw-btn" id="saveBtn" type="button" ${locked ? 'disabled' : ''}>Save</button>
    <button class="niw-btn primary" id="submitBtn" type="button" ${locked ? 'disabled' : ''}>${escapeHtml(submitLabel)}</button>
  </header>
  <main class="niw-shell">
    <aside class="niw-passage">
      <section class="niw-source-card task">
        <div class="niw-source-head">
          <h2>Task</h2>
          <div class="niw-source-tools">
            <button class="niw-source-btn" type="button" data-source-mark="underline" title="Underline selected task/reference text">U</button>
            <span class="niw-popover">
              <button class="niw-source-btn" type="button" data-toggle-palette="sourceHighlightPalette" title="Highlight selected task/reference text">${iconSvg('highlight')}</button>
              <span class="niw-palette" id="sourceHighlightPalette">
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-yellow" title="Yellow highlight" style="background:#fff0a6"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-green" title="Green highlight" style="background:#c7f9cc"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-blue" title="Blue highlight" style="background:#bfdbfe"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-pink" title="Pink highlight" style="background:#fecaca"></button>
              </span>
            </span>
            <button class="niw-source-btn" type="button" data-source-mark="clear" title="Clear local marks">${iconSvg('eraser')}</button>
          </div>
        </div>
        <div class="niw-text" id="taskText">${escapeHtml(prompt || 'No prompt added.')}</div>
      </section>
      ${passageText ? `<section class="niw-source-card reference">
        <div class="niw-source-head">
          <h2>Reference</h2>
          <div class="niw-source-tools">
            <button class="niw-source-btn" type="button" data-source-mark="underline" title="Underline selected task/reference text">U</button>
            <span class="niw-popover">
              <button class="niw-source-btn" type="button" data-toggle-palette="referenceHighlightPalette" title="Highlight selected task/reference text">${iconSvg('highlight')}</button>
              <span class="niw-palette" id="referenceHighlightPalette">
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-yellow" title="Yellow highlight" style="background:#fff0a6"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-green" title="Green highlight" style="background:#c7f9cc"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-blue" title="Blue highlight" style="background:#bfdbfe"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-pink" title="Pink highlight" style="background:#fecaca"></button>
              </span>
            </span>
            <button class="niw-source-btn" type="button" data-source-mark="clear" title="Clear local marks">${iconSvg('eraser')}</button>
          </div>
        </div>
        <div class="niw-text" id="referenceText">${escapeHtml(passageText)}</div>
      </section>` : ''}
      ${passagePdf ? `<section class="niw-source-card reference"><a href="/api/assignments/${assignmentId}/passage-pdf" target="_blank" rel="noopener">Open PDF passage</a></section>` : ''}
      ${dueAt ? `<p class="niw-stat">Due ${escapeHtml(dueAt)}</p>` : ''}
    </aside>
    <div class="niw-resizer" id="readerResizer" role="separator" aria-orientation="vertical" aria-label="Resize reader"></div>
    <section class="niw-editor-wrap">
      <div class="niw-tools">
        <button class="niw-btn niw-icon-btn" type="button" data-command="undo" title="Undo">${iconSvg('undo')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="redo" title="Redo">${iconSvg('redo')}</button>
        <div class="niw-divider"></div>
        <button class="niw-btn" type="button" data-command="bold" title="Bold">B</button>
        <button class="niw-btn" type="button" data-command="italic" title="Italic">I</button>
        <button class="niw-btn" type="button" data-command="underline" title="Underline">U</button>
        <button class="niw-btn" type="button" data-command="strikeThrough" title="Strikethrough">S</button>
        <select class="niw-select" id="fontSizeSelect" title="Font size">
          ${[8,10,12,14,16,18,20,22].map((size) => `<option value="${size}" ${size === 18 ? 'selected' : ''}>${size}</option>`).join('')}
        </select>
        <div class="niw-divider"></div>
        <button class="niw-btn niw-icon-btn" type="button" data-command="insertUnorderedList" title="Bulleted list">${iconSvg('bullets')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="insertOrderedList" title="Numbered list">${iconSvg('numbers')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="outdent" title="Outdent">${iconSvg('outdent')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="indent" title="Indent">${iconSvg('indent')}</button>
        <div class="niw-divider"></div>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyLeft" title="Align left">${iconSvg('alignLeft')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyCenter" title="Align centre">${iconSvg('alignCenter')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyRight" title="Align right">${iconSvg('alignRight')}</button>
        <div class="niw-divider"></div>
        <span class="niw-popover">
          <button class="niw-btn niw-icon-btn" type="button" data-toggle-palette="textColorPalette" title="Text colour">${iconSvg('textColor')}</button>
          <span class="niw-palette" id="textColorPalette">
            ${['#1f2a24','#2f6f4e','#1d4ed8','#991b1b','#7c2d12','#6b21a8'].map((color) => `<button class="niw-swatch" type="button" data-fore-color="${color}" title="Text colour ${color}" style="background:${color}"></button>`).join('')}
          </span>
        </span>
        <span class="niw-popover">
          <button class="niw-btn niw-icon-btn" type="button" data-toggle-palette="highlightPalette" title="Highlight colour">${iconSvg('highlight')}</button>
          <span class="niw-palette" id="highlightPalette">
            ${['#fff0a6','#c7f9cc','#bfdbfe','#fecaca','#e9d5ff','#ffffff'].map((color) => `<button class="niw-swatch" type="button" data-hilite-color="${color}" title="Highlight ${color}" style="background:${color}"></button>`).join('')}
          </span>
        </span>
        <div class="niw-divider"></div>
        <label class="niw-zoom">Zoom <input id="zoomSlider" type="range" min="80" max="160" step="5" value="100"><span id="zoomLabel">100%</span></label>
      </div>
      <div class="niw-editor-stage">
        <div class="niw-page-shell">
          <div class="niw-line-numbers" id="lineNumbers"></div>
          <div id="nativeEditor" contenteditable="${locked ? 'false' : 'true'}" spellcheck="${spellcheck ? 'true' : 'false'}"></div>
        </div>
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
    const charCount = document.getElementById('charCount');
    const sentenceCount = document.getElementById('sentenceCount');
    const saveBtn = document.getElementById('saveBtn');
    const submitBtn = document.getElementById('submitBtn');
    const shell = document.querySelector('.niw-shell');
    const readerResizer = document.getElementById('readerResizer');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomLabel = document.getElementById('zoomLabel');
    const lineNumbers = document.getElementById('lineNumbers');
    let dirty = false;
    let saving = false;
    let lastSavedText = initialPad.plain_text || '';
    let lastSavedHtml = sanitizeEditorHtml(initialPad.document?.html || '');
    let currentVersion = initialPad.version || 1;
    const pageWidth = 794;
    let editorZoom = loadNumberSetting('nativePadZoom', 1);
    let readerWidth = loadNumberSetting('nativePadReaderWidth', 420);
    const localMarkKey = 'nativeSourceMarks:' + ${jsonScript(assignmentId)};

    document.execCommand('styleWithCSS', false, true);
    editor.innerHTML = sanitizeEditorHtml(initialPad.document?.html || '');
    if(!editor.innerText.trim()) editor.innerText = initialPad.plain_text || '';
    restoreLocalSourceMarks();
    applyLayoutSettings();
    applyPolicy(currentPolicy);
    updateCount();
    updateLineNumbers();
    syncToolbarState();

    function currentText(){ return editor.innerText.replace(/\\u00a0/g, ' '); }
    function currentHtml(){ return sanitizeEditorHtml(editor.innerHTML); }
    function countWords(text){
      const cleaned = text.replace(/[\\u200B\\u200C\\u200D\\u2060\\uFEFF]/g, '').trim();
      return cleaned ? cleaned.split(/\\s+/).filter(Boolean).length : 0;
    }
    function countSentences(text){
      const cleaned = text.replace(/\\s+/g, ' ').trim();
      if(!cleaned) return 0;
      const matches = cleaned.match(/[^.!?]+[.!?]+(?=\\s|$)|[^.!?]+$/g) || [];
      return matches.map(part => part.trim()).filter(Boolean).length;
    }
    function updateCount(){
      const text = currentText();
      wordCount.textContent = countWords(text);
      charCount.textContent = text.length;
      sentenceCount.textContent = countSentences(text);
    }
    function documentPayload(){ return { type:'html', html:currentHtml(), text:currentText() }; }
    function loadNumberSetting(key, fallback){
      try{
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
      }catch(_){
        return fallback;
      }
    }
    function saveNumberSetting(key, value){
      try{ localStorage.setItem(key, String(value)); }catch(_){}
    }
    function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
    function applyLayoutSettings(){
      editorZoom = clamp(editorZoom, 0.8, 1.6);
      readerWidth = clamp(readerWidth, 260, Math.min(Math.floor(window.innerWidth * 0.6), 820));
      shell.style.setProperty('--page-width', pageWidth + 'px');
      shell.style.setProperty('--editor-zoom', editorZoom.toFixed(2));
      shell.style.setProperty('--reader-width', readerWidth + 'px');
      saveNumberSetting('nativePadZoom', editorZoom);
      saveNumberSetting('nativePadReaderWidth', readerWidth);
      zoomSlider.value = String(Math.round(editorZoom * 100));
      zoomLabel.textContent = Math.round(editorZoom * 100) + '%';
    }
    function sanitizeEditorHtml(html){
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      const allowed = new Set(['B','I','U','S','STRONG','EM','UL','OL','LI','P','DIV','BR','SPAN','FONT']);
      template.content.querySelectorAll('*').forEach(node => {
        if(!allowed.has(node.tagName)){
          node.replaceWith(document.createTextNode(node.textContent || ''));
          return;
        }
        if(node.tagName === 'FONT'){
          const span = document.createElement('span');
          span.innerHTML = node.innerHTML;
          [...node.attributes].forEach(attribute => {
            if(attribute.name.toLowerCase() === 'color') span.style.color = attribute.value;
          });
          node.replaceWith(span);
          node = span;
        }
        [...node.attributes].forEach(attribute => {
          const name = attribute.name.toLowerCase();
          if(name === 'style'){
            const style = sanitizeStyle(attribute.value);
            if(style) node.setAttribute('style', style);
            else node.removeAttribute(attribute.name);
          }else{
            node.removeAttribute(attribute.name);
          }
        });
      });
      return template.innerHTML;
    }
    function sanitizeStyle(value){
      const probe = document.createElement('span');
      probe.setAttribute('style', value || '');
      const out = [];
      if(/^(left|center|right)$/.test(probe.style.textAlign)) out.push('text-align:' + probe.style.textAlign);
      if(/^rgb\\(|^#[0-9a-f]{3,6}$/i.test(probe.style.color)) out.push('color:' + probe.style.color);
      if(/^rgb\\(|^#[0-9a-f]{3,6}$/i.test(probe.style.backgroundColor)) out.push('background-color:' + probe.style.backgroundColor);
      if(/^([8-9]|1[0-9]|2[0-2])px$/.test(probe.style.fontSize)) out.push('font-size:' + probe.style.fontSize);
      if(/^\\d+px$/.test(probe.style.marginLeft)) out.push('margin-left:' + probe.style.marginLeft);
      return out.join(';');
    }
    function restoreLocalSourceMarks(){
      try{
        const saved = JSON.parse(localStorage.getItem(localMarkKey) || '{}');
        if(saved.taskText) document.getElementById('taskText').innerHTML = sanitizeSourceHtml(saved.taskText);
        if(saved.referenceText && document.getElementById('referenceText')) document.getElementById('referenceText').innerHTML = sanitizeSourceHtml(saved.referenceText);
      }catch(_){}
    }
    function saveLocalSourceMarks(){
      const payload = {};
      const task = document.getElementById('taskText');
      const reference = document.getElementById('referenceText');
      if(task) payload.taskText = sanitizeSourceHtml(task.innerHTML);
      if(reference) payload.referenceText = sanitizeSourceHtml(reference.innerHTML);
      try{ localStorage.setItem(localMarkKey, JSON.stringify(payload)); }catch(_){}
    }
    function sanitizeSourceHtml(html){
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      template.content.querySelectorAll('*').forEach(node => {
        if(node.tagName !== 'SPAN' && node.tagName !== 'BR'){
          node.replaceWith(document.createTextNode(node.textContent || ''));
          return;
        }
        if(node.tagName === 'SPAN'){
          const cls = [...node.classList].filter(name => [
            'niw-local-underline',
            'niw-local-highlight',
            'niw-local-highlight-yellow',
            'niw-local-highlight-green',
            'niw-local-highlight-blue',
            'niw-local-highlight-pink',
          ].includes(name)).join(' ');
          if(cls) node.setAttribute('class', cls);
          else node.replaceWith(document.createTextNode(node.textContent || ''));
        }
        [...node.attributes].forEach(attribute => {
          if(attribute.name !== 'class') node.removeAttribute(attribute.name);
        });
      });
      return template.innerHTML;
    }
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

    async function saveNow(force = false){
      if(saving || (!dirty && !force) || editor.getAttribute('contenteditable') === 'false') return;
      const text = currentText();
      const html = currentHtml();
      if(text === lastSavedText && html === lastSavedHtml){ dirty = false; saveState.textContent = 'Saved'; return; }
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
        lastSavedHtml = sanitizeEditorHtml(data.pad.document?.html || '');
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
      updateLineNumbers();
      syncToolbarState();
    });
    editor.addEventListener('blur', saveNow);
    editor.addEventListener('keyup', syncToolbarState);
    editor.addEventListener('mouseup', syncToolbarState);
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
        saveState.textContent = 'Unsaved';
        updateCount();
        updateLineNumbers();
        syncToolbarState();
      });
    });

    fontSizeSelect.addEventListener('change', () => {
      editor.focus();
      document.execCommand('fontSize', false, '7');
      editor.querySelectorAll('font[size="7"]').forEach(font => {
        const span = document.createElement('span');
        span.style.fontSize = fontSizeSelect.value + 'px';
        span.innerHTML = font.innerHTML;
        font.replaceWith(span);
      });
      dirty = true;
      saveState.textContent = 'Unsaved';
      syncToolbarState();
    });

    document.querySelectorAll('[data-fore-color]').forEach(button => {
      button.addEventListener('click', () => {
        editor.focus();
        document.execCommand('foreColor', false, button.dataset.foreColor);
        dirty = true;
        saveState.textContent = 'Unsaved';
        closePalettes();
        syncToolbarState();
      });
    });

    document.querySelectorAll('[data-hilite-color]').forEach(button => {
      button.addEventListener('click', () => {
        editor.focus();
        document.execCommand('hiliteColor', false, button.dataset.hiliteColor);
        dirty = true;
        saveState.textContent = 'Unsaved';
        closePalettes();
        syncToolbarState();
      });
    });

    document.querySelectorAll('[data-toggle-palette]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const popover = button.closest('.niw-popover');
        const wasOpen = popover.classList.contains('open');
        closePalettes();
        if(!wasOpen) popover.classList.add('open');
      });
    });
    document.addEventListener('click', event => {
      if(!event.target.closest('.niw-popover')) closePalettes();
    });

    zoomSlider.addEventListener('input', () => {
      editorZoom = Number(zoomSlider.value) / 100;
      applyLayoutSettings();
    });

    saveBtn.addEventListener('click', async () => {
      await saveNow(true);
    });

    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if(selection?.anchorNode && (document.activeElement === editor || editor.contains(selection.anchorNode))) syncToolbarState();
    });

    document.querySelectorAll('[data-source-mark]').forEach(button => {
      button.addEventListener('click', () => {
        applySourceMark(button.dataset.sourceMark, button.dataset.sourceClass || '');
        closePalettes();
      });
    });

    readerResizer.addEventListener('pointerdown', event => {
      event.preventDefault();
      readerResizer.setPointerCapture(event.pointerId);
      const onMove = moveEvent => {
        readerWidth = moveEvent.clientX;
        applyLayoutSettings();
      };
      const onUp = upEvent => {
        readerResizer.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    readerResizer.addEventListener('dblclick', () => {
      readerWidth = 420;
      applyLayoutSettings();
    });
    window.addEventListener('resize', applyLayoutSettings);

    submitBtn.addEventListener('click', async () => {
      await saveNow(true);
      if(!confirm(submitConfirm)) return;
      const response = await fetch('/api/native/pads/' + initialPad.id + '/submit', {
        method:'POST',
        headers:{ 'X-CSRF-Token':csrfToken }
      });
      if(response.ok){
        editor.setAttribute('contenteditable', 'false');
        submitBtn.disabled = true;
        saveBtn.disabled = true;
        saveState.textContent = submitDoneLabel;
      }else{
        saveState.textContent = 'Submit failed';
      }
    });

    function updateLineNumbers(){
      const lines = Math.max(30, currentText().split('\\n').length);
      lineNumbers.textContent = Array.from({length:lines}, (_, index) => String(index + 1)).join('\\n');
    }
    function closePalettes(){
      document.querySelectorAll('.niw-popover.open').forEach(popover => popover.classList.remove('open'));
    }
    function syncToolbarState(){
      ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'].forEach(command => {
        const button = document.querySelector('[data-command="' + command + '"]');
        if(button) {
          try {
            button.classList.toggle('active', document.queryCommandState(command));
          } catch (_) {}
        }
      });
      let value = '';
      try {
        value = document.queryCommandValue('fontSize');
      } catch (_) {}
      const sized = closestStyledNode('fontSize');
      if(sized){
        const px = parseInt(sized.style.fontSize, 10);
        if(px) fontSizeSelect.value = String(Math.max(8, Math.min(22, Math.round(px / 2) * 2)));
      }else if(value && /^\\d+$/.test(String(value))){
        fontSizeSelect.value = '18';
      }
    }
    function closestStyledNode(styleName){
      const selection = window.getSelection();
      if(!selection || !selection.anchorNode) return null;
      let node = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
      while(node && node !== editor){
        if(node.style && node.style[styleName]) return node;
        node = node.parentElement;
      }
      return null;
    }
    function applySourceMark(kind, sourceClass = ''){
      const selection = window.getSelection();
      const sourceRoot = selection && selection.rangeCount ? sourceRootFor(selection.getRangeAt(0)) : null;
      if(!sourceRoot) return;
      if(kind === 'clear'){
        sourceRoot.querySelectorAll('.niw-local-underline,.niw-local-highlight,.niw-local-highlight-yellow,.niw-local-highlight-green,.niw-local-highlight-blue,.niw-local-highlight-pink').forEach(node => node.replaceWith(document.createTextNode(node.textContent || '')));
        sourceRoot.normalize();
        saveLocalSourceMarks();
        return;
      }
      if(selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.className = kind === 'underline' ? 'niw-local-underline' : 'niw-local-highlight ' + (sourceClass || 'niw-local-highlight-yellow');
      try{
        span.appendChild(range.extractContents());
        range.insertNode(span);
        selection.removeAllRanges();
        saveLocalSourceMarks();
      }catch(_){}
    }
    function sourceRootFor(range){
      const roots = [document.getElementById('taskText'), document.getElementById('referenceText')].filter(Boolean);
      return roots.find(root => root.contains(range.commonAncestorContainer) || root === range.commonAncestorContainer);
    }
  </script>
</body>
</html>`;
}
