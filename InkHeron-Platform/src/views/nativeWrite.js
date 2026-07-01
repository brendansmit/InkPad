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

function toolIcon(name) {
  const icons = {
    undo: '<span class="niw-glyph">↺</span>',
    redo: '<span class="niw-glyph">↻</span>',
    bullets: '<svg class="niw-doc-icon" viewBox="0 0 34 24" aria-hidden="true"><circle cx="6" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="6" cy="19" r="2.4"/><rect x="12" y="3" width="18" height="4" rx="1.3"/><rect x="12" y="10" width="18" height="4" rx="1.3"/><rect x="12" y="17" width="18" height="4" rx="1.3"/></svg>',
    numbers: '<svg class="niw-doc-icon" viewBox="0 0 34 24" aria-hidden="true"><text x="3" y="7.5">1</text><text x="3" y="14.5">2</text><text x="3" y="21.5">3</text><rect x="13" y="3" width="17" height="4" rx="1.3"/><rect x="13" y="10" width="17" height="4" rx="1.3"/><rect x="13" y="17" width="17" height="4" rx="1.3"/></svg>',
    outdent: '<svg class="niw-doc-icon" viewBox="0 0 34 24" aria-hidden="true"><path d="M12 4 L4 12 L12 20 Z"/><rect x="15" y="3" width="15" height="4" rx="1.3"/><rect x="15" y="10" width="15" height="4" rx="1.3"/><rect x="15" y="17" width="15" height="4" rx="1.3"/></svg>',
    indent: '<svg class="niw-doc-icon" viewBox="0 0 34 24" aria-hidden="true"><path d="M4 4 L12 12 L4 20 Z"/><rect x="15" y="3" width="15" height="4" rx="1.3"/><rect x="15" y="10" width="15" height="4" rx="1.3"/><rect x="15" y="17" width="15" height="4" rx="1.3"/></svg>',
    alignLeft: '<span class="niw-align-icon left"><i></i><i></i><i></i><i></i></span>',
    alignCenter: '<span class="niw-align-icon center"><i></i><i></i><i></i><i></i></span>',
    alignRight: '<span class="niw-align-icon right"><i></i><i></i><i></i><i></i></span>',
    textColor: '<span class="niw-color-icon">A</span>',
    highlight: '<span class="niw-highlight-icon">H</span>',
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
    .niw-back{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 10px;border:1px solid #c8d0c9;border-radius:7px;background:#fff;color:#334239;text-decoration:none;font-size:14px;font-weight:800;white-space:nowrap}
    .niw-back:hover{border-color:#2f6f4e;color:#183d2a}
    .niw-icon-btn{width:34px;padding:0}
    .niw-glyph{display:block;font-size:22px;line-height:1;font-weight:700}
    .niw-doc-icon{display:block;width:28px;height:22px;margin:auto;color:#566170;fill:currentColor}
    .niw-doc-icon text{fill:currentColor;font:800 8px Arial,sans-serif}
    .niw-align-icon{width:22px;display:grid;gap:4px;margin:auto}
    .niw-align-icon i{display:block;height:2px;background:currentColor;border-radius:99px}
    .niw-align-icon.left i:nth-child(odd),.niw-align-icon.right i:nth-child(odd){width:100%}
    .niw-align-icon.left i:nth-child(even),.niw-align-icon.center i:nth-child(even),.niw-align-icon.right i:nth-child(even){width:62%}
    .niw-align-icon.left i{justify-self:start}
    .niw-align-icon.center i{justify-self:center}
    .niw-align-icon.right i{justify-self:end}
    .niw-align-icon.center i:nth-child(odd){width:100%}
    .niw-color-icon,.niw-highlight-icon{display:grid;place-items:center;width:20px;height:22px;margin:auto;font-weight:900;font-size:16px;line-height:1;position:relative}
    .niw-color-icon::after{content:'';position:absolute;left:2px;right:2px;bottom:1px;height:3px;background:#1f2a24;border-radius:99px}
    .niw-highlight-icon{background:linear-gradient(transparent 58%,#fff0a6 58%);border-radius:3px}
    .niw-btn.active{background:#dfe9df;border-color:#2f6f4e;color:#183d2a}
    .niw-btn.primary{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
    .niw-btn:disabled{opacity:.5;cursor:not-allowed}
    .niw-select{border:1px solid #b8c2b9;border-radius:7px;min-height:34px;background:#fff;color:#17221b;font:inherit;font-weight:800;padding:0 8px;width:auto}
    .niw-zoom{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#657268}
    .niw-zoom input{width:116px}
    .niw-shell{--reader-width:420px;--page-width:794px;--editor-zoom:1;height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(260px,var(--reader-width)) 10px minmax(0,1fr)}
    .niw-passage{border-right:1px solid #d8d4c8;background:#f0eee7;overflow:auto;padding:18px;display:grid;gap:14px;align-content:start}
    .niw-source-card{background:#fff;border:1px solid #d8d4c8;border-radius:8px;padding:16px;box-shadow:0 5px 18px rgba(31,42,36,.06)}
    .niw-source-card.reference{background:#f8fbff;border-color:#bfd0df}
    .niw-source-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;border-bottom:1px solid #e4e0d6;padding-bottom:8px}
    .niw-source-card.reference .niw-source-head{border-color:#d5e2ec}
    .niw-source-head h2{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#657268}
    .niw-source-tools{margin-left:auto;display:flex;gap:5px}
    .niw-source-btn{min-height:28px;padding:0 8px;border-radius:6px;border:1px solid #b8c2b9;background:#fff;font-weight:800;cursor:pointer}
    .niw-passage .niw-text{white-space:pre-wrap;font-family:var(--font);font-size:15px;line-height:1.65;outline:none}
    .niw-local-underline{text-decoration:underline;text-decoration-thickness:2px;text-decoration-color:#2f6f4e}
    .niw-local-highlight{background:#fff0a6}
    .niw-resizer{background:#e5e1d6;cursor:col-resize;position:relative}
    .niw-resizer::before{content:'';position:absolute;inset:0 -7px}
    .niw-resizer::after{content:'';position:absolute;top:50%;left:50%;width:4px;height:44px;transform:translate(-50%,-50%);border-left:2px solid #8f9a92;border-right:2px solid #8f9a92;border-radius:2px;opacity:.78}
    .niw-resizer:hover,.niw-resizer:focus{background:#d7ded4}
    .niw-resizer:hover::after,.niw-resizer:focus::after{border-color:#2f6f4e;opacity:1}
    .niw-editor-wrap{display:flex;flex-direction:column;min-width:0;min-height:0}
    .niw-tools{display:flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:8px 14px;border-bottom:1px solid #d8d4c8;background:#faf9f4;flex-wrap:wrap}
    .niw-divider{width:1px;height:28px;background:#d8d4c8;margin:0 3px}
    .niw-editor-stage{flex:1;overflow:auto;padding:36px 32px}
    .niw-page-zoom-frame{width:var(--page-width);max-width:max-content;margin:0 auto;position:relative;display:flex;justify-content:center}
    .niw-page-shell{width:var(--page-width);max-width:100%;display:grid;grid-template-columns:26px minmax(0,1fr);align-items:start;transform:scale(var(--editor-zoom));transform-origin:top center}
    .niw-line-numbers{border:0;background:transparent;color:#9aa39d;font-family:var(--mono);font-size:10.5px;line-height:31.5px;text-align:right;padding:35px 7px 34px 0;user-select:none;white-space:pre;min-height:0}
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
    @media(max-width:820px){body{overflow:auto;height:auto}.niw-shell{height:auto;display:block}.niw-passage{border-right:0;border-bottom:1px solid #d8d4c8}.niw-resizer{display:none}.niw-editor-stage{padding:16px}.niw-page-zoom-frame,.niw-page-shell{width:100%;max-width:100%}.niw-page-shell{grid-template-columns:22px minmax(0,1fr)}.niw-line-numbers{font-size:10px;padding:23px 5px 22px 0}#nativeEditor{min-height:60vh;padding:22px}}
  </style>
</head>
<body>
  <header class="niw-bar">
    <a class="niw-back" href="/student">← Assignments</a>
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
              <button class="niw-source-btn" type="button" data-toggle-palette="sourceHighlightPalette" title="Highlight selected task/reference text">${toolIcon('highlight')}</button>
              <span class="niw-palette" id="sourceHighlightPalette">
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-yellow" title="Yellow highlight" style="background:#fff0a6"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-green" title="Green highlight" style="background:#c7f9cc"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-blue" title="Blue highlight" style="background:#bfdbfe"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-pink" title="Pink highlight" style="background:#fecaca"></button>
              </span>
            </span>
            <button class="niw-source-btn" type="button" data-source-mark="clear" title="Clear local marks">Clear</button>
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
              <button class="niw-source-btn" type="button" data-toggle-palette="referenceHighlightPalette" title="Highlight selected task/reference text">${toolIcon('highlight')}</button>
              <span class="niw-palette" id="referenceHighlightPalette">
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-yellow" title="Yellow highlight" style="background:#fff0a6"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-green" title="Green highlight" style="background:#c7f9cc"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-blue" title="Blue highlight" style="background:#bfdbfe"></button>
                <button class="niw-swatch" type="button" data-source-mark="highlight" data-source-class="niw-local-highlight-pink" title="Pink highlight" style="background:#fecaca"></button>
              </span>
            </span>
            <button class="niw-source-btn" type="button" data-source-mark="clear" title="Clear local marks">Clear</button>
          </div>
        </div>
        <div class="niw-text" id="referenceText">${escapeHtml(passageText)}</div>
      </section>` : ''}
      ${passagePdf ? `<section class="niw-source-card reference"><a href="/api/assignments/${assignmentId}/passage-pdf" target="_blank" rel="noopener">Open PDF passage</a></section>` : ''}
      ${dueAt ? `<p class="niw-stat">Due ${escapeHtml(dueAt)}</p>` : ''}
    </aside>
    <div class="niw-resizer" id="readerResizer" role="separator" aria-orientation="vertical" aria-label="Drag to resize panels" title="Drag to resize panels"></div>
    <section class="niw-editor-wrap">
      <div class="niw-tools">
        <button class="niw-btn niw-icon-btn" type="button" data-command="undo" title="Undo">${toolIcon('undo')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="redo" title="Redo">${toolIcon('redo')}</button>
        <div class="niw-divider"></div>
        <button class="niw-btn" type="button" data-command="bold" title="Bold">B</button>
        <button class="niw-btn" type="button" data-command="italic" title="Italic">I</button>
        <button class="niw-btn" type="button" data-command="underline" title="Underline">U</button>
        <button class="niw-btn" type="button" data-command="strikeThrough" title="Strikethrough">S</button>
        <select class="niw-select" id="fontSizeSelect" title="Font size">
          ${[8,10,12,14,16,18,20,22].map((size) => `<option value="${size}" ${size === 18 ? 'selected' : ''}>${size}</option>`).join('')}
        </select>
        <div class="niw-divider"></div>
        <button class="niw-btn niw-icon-btn" type="button" data-command="insertUnorderedList" title="Bulleted list">${toolIcon('bullets')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="insertOrderedList" title="Numbered list">${toolIcon('numbers')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="outdent" title="Outdent">${toolIcon('outdent')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="indent" title="Indent">${toolIcon('indent')}</button>
        <div class="niw-divider"></div>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyLeft" title="Align left">${toolIcon('alignLeft')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyCenter" title="Align centre">${toolIcon('alignCenter')}</button>
        <button class="niw-btn niw-icon-btn" type="button" data-command="justifyRight" title="Align right">${toolIcon('alignRight')}</button>
        <div class="niw-divider"></div>
        <span class="niw-popover">
          <button class="niw-btn niw-icon-btn" type="button" data-toggle-palette="textColorPalette" title="Text colour">${toolIcon('textColor')}</button>
          <span class="niw-palette" id="textColorPalette">
            ${['#1f2a24','#2f6f4e','#1d4ed8','#991b1b','#7c2d12','#6b21a8'].map((color) => `<button class="niw-swatch" type="button" data-fore-color="${color}" title="Text colour ${color}" style="background:${color}"></button>`).join('')}
          </span>
        </span>
        <span class="niw-popover">
          <button class="niw-btn niw-icon-btn" type="button" data-toggle-palette="highlightPalette" title="Highlight colour">${toolIcon('highlight')}</button>
          <span class="niw-palette" id="highlightPalette">
            ${['#fff0a6','#c7f9cc','#bfdbfe','#fecaca','#e9d5ff','#ffffff'].map((color) => `<button class="niw-swatch" type="button" data-hilite-color="${color}" title="Highlight ${color}" style="background:${color}"></button>`).join('')}
          </span>
        </span>
        <div class="niw-divider"></div>
        <label class="niw-zoom">Zoom <input id="zoomSlider" type="range" min="70" max="150" step="5" value="100"><span id="zoomLabel">100%</span></label>
      </div>
      <div class="niw-editor-stage">
        <div class="niw-page-zoom-frame" id="pageZoomFrame">
          <div class="niw-page-shell" id="pageShell">
            <div class="niw-line-numbers" id="lineNumbers"></div>
            <div id="nativeEditor" contenteditable="${locked ? 'false' : 'true'}" spellcheck="${spellcheck ? 'true' : 'false'}"></div>
          </div>
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
    const pageZoomFrame = document.getElementById('pageZoomFrame');
    const pageShell = document.getElementById('pageShell');
    const lineNumbers = document.getElementById('lineNumbers');
    let dirty = false;
    let saving = false;
    let lastSavedText = initialPad.plain_text || '';
    let lastSavedHtml = sanitizeEditorHtml(initialPad.document?.html || '');
    let currentVersion = initialPad.version || 1;
    let savedEditorRange = null;
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
      editorZoom = clamp(editorZoom, 0.7, 1.5);
      readerWidth = clamp(readerWidth, 260, Math.min(Math.floor(window.innerWidth * 0.6), 820));
      shell.style.setProperty('--page-width', pageWidth + 'px');
      shell.style.setProperty('--editor-zoom', editorZoom.toFixed(2));
      shell.style.setProperty('--reader-width', readerWidth + 'px');
      syncZoomFrame();
      saveNumberSetting('nativePadZoom', editorZoom);
      saveNumberSetting('nativePadReaderWidth', readerWidth);
      zoomSlider.value = String(Math.round(editorZoom * 100));
      zoomLabel.textContent = Math.round(editorZoom * 100) + '%';
    }
    function syncZoomFrame(){
      requestAnimationFrame(() => {
        pageZoomFrame.style.width = Math.ceil(pageShell.offsetWidth * editorZoom) + 'px';
        pageZoomFrame.style.height = Math.ceil(pageShell.offsetHeight * editorZoom) + 'px';
      });
    }
    function editorOwnsNode(node){
      return !!node && (node === editor || editor.contains(node));
    }
    function rememberEditorSelection(){
      const selection = window.getSelection();
      if(!selection || !selection.rangeCount || !editorOwnsNode(selection.anchorNode)) return;
      savedEditorRange = selection.getRangeAt(0).cloneRange();
    }
    function restoreEditorSelection(){
      if(!savedEditorRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedEditorRange);
      return true;
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
    editor.addEventListener('keyup', () => { rememberEditorSelection(); syncToolbarState(); });
    editor.addEventListener('mouseup', () => { rememberEditorSelection(); syncToolbarState(); });
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

    fontSizeSelect.addEventListener('mousedown', rememberEditorSelection);
    fontSizeSelect.addEventListener('focus', rememberEditorSelection);
    fontSizeSelect.addEventListener('change', () => {
      editor.focus();
      restoreEditorSelection();
      applyFontSize(fontSizeSelect.value);
      dirty = true;
      saveState.textContent = 'Unsaved';
      updateLineNumbers();
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
      if(selection?.anchorNode && (document.activeElement === editor || editor.contains(selection.anchorNode))) {
        rememberEditorSelection();
        syncToolbarState();
      }
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
      const text = currentText();
      const lines = text.trim() ? text.split('\\n').length : 0;
      lineNumbers.textContent = Array.from({length:lines}, (_, index) => String(index + 1)).join('\\n');
      syncZoomFrame();
    }
    function closePalettes(){
      document.querySelectorAll('.niw-popover.open').forEach(popover => popover.classList.remove('open'));
    }
    function applyFontSize(size){
      const px = clamp(Number(size), 8, 22);
      const selection = window.getSelection();
      if(!selection || !selection.rangeCount || !editorOwnsNode(selection.anchorNode)) return;
      const range = selection.getRangeAt(0);
      if(range.collapsed){
        document.execCommand('fontSize', false, '7');
        convertFontSizeTags(px);
        return;
      }
      const span = document.createElement('span');
      span.style.fontSize = px + 'px';
      try{
        span.appendChild(range.extractContents());
        range.insertNode(span);
        selection.removeAllRanges();
        const nextRange = document.createRange();
        nextRange.selectNodeContents(span);
        selection.addRange(nextRange);
        savedEditorRange = nextRange.cloneRange();
      }catch(_){
        document.execCommand('fontSize', false, '7');
        convertFontSizeTags(px);
      }
    }
    function convertFontSizeTags(px){
      editor.querySelectorAll('font[size="7"]').forEach(font => {
        const span = document.createElement('span');
        span.style.fontSize = px + 'px';
        span.innerHTML = font.innerHTML;
        font.replaceWith(span);
      });
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
