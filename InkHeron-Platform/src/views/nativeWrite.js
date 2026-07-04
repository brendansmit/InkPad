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
  greenpen = false,
}) {
  const locked = pad.state !== 'writing' && pad.state !== 'green_pen_open';
  const submitLabel = pad.state === 'green_pen_open' ? 'Resubmit' : 'Submit';
  const submitConfirm = pad.state === 'green_pen_open' ? 'Resubmit this rewrite?' : 'Submit this writing?';
  const submitDoneLabel = pad.state === 'green_pen_open' ? 'Resubmitted' : 'Submitted';
  // Once already submitted (locked), the button shows the done label and is greyed out.
  const submitButtonLabel = locked ? (pad.state === 'resubmitted' ? 'Resubmitted' : 'Submitted') : submitLabel;
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
    .niw-shell{--reader-width:420px;--page-width:794px;--editor-zoom:1;--task-height:220px;height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(260px,var(--reader-width)) 10px minmax(0,1fr)}
    .niw-passage{border-right:1px solid #d8d4c8;background:#f0eee7;overflow:hidden;padding:12px;display:grid;grid-template-rows:minmax(120px,var(--task-height)) 8px minmax(220px,1fr);gap:0;min-height:0}
    .niw-source-card{background:#fff;border:1px solid #d8d4c8;border-radius:8px;padding:16px;box-shadow:0 5px 18px rgba(31,42,36,.06)}
    .niw-source-card.task{min-height:0;overflow:auto}
    .niw-source-card.reference{background:#f8fbff;border-color:#bfd0df}
    .niw-source-card.reference{min-height:0;overflow:hidden;display:flex;flex-direction:column}
    .niw-source-card.pdf{padding:8px}
    .niw-source-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;border-bottom:1px solid #e4e0d6;padding-bottom:8px}
    .niw-source-card.reference .niw-source-head{border-color:#d5e2ec}
    .niw-source-head h2{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#657268}
    .niw-source-tools{margin-left:auto;display:flex;gap:5px}
    .niw-source-btn{min-height:28px;padding:0 8px;border-radius:6px;border:1px solid #b8c2b9;background:#fff;font-weight:800;cursor:pointer}
    .niw-passage .niw-text{white-space:pre-wrap;font-family:var(--font);font-size:15px;line-height:1.65;outline:none}
    .niw-panel-resizer{height:8px;cursor:row-resize;position:relative}
    .niw-panel-resizer::before{content:'';position:absolute;left:34%;right:34%;top:3px;height:2px;background:#9aa39d;border-radius:99px}
    .niw-panel-resizer:hover::before{background:#2f6f4e}
    .niw-pdf-tools{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:12px;font-weight:800;color:#657268}
    .niw-pdf-tools input{width:92px}
    .niw-pdf-frame{flex:1;min-height:0;overflow:auto;border:1px solid #d5e2ec;border-radius:6px;background:#eef3f8}
    .niw-pdf-pages{display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px}
    .niw-pdf-page{position:relative;background:#fff;box-shadow:0 2px 10px rgba(31,42,36,.14);flex:none}
    .niw-pdf-page canvas{display:block}
    .niw-pdf-page .textLayer{position:absolute;inset:0;overflow:clip;opacity:1;line-height:1;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}
    .niw-pdf-page .textLayer span{position:absolute;white-space:pre;cursor:text;transform-origin:0 0;color:transparent}
    .niw-pdf-page .textLayer ::selection{background:rgba(120,170,255,.4)}
    .niw-pdf-mark{border-radius:2px}
    /* Green pen: panel docks RIGHT, editor takes the left panel's room. */
    .niw-shell.gp-shell{grid-template-columns:minmax(0,1fr) 10px minmax(280px,380px)}
    .gp-shell > .niw-passage:not(.gp-side),.gp-shell > #readerResizer{display:none}
    .niw-passage.gp-side{border-right:0;border-left:1px solid #d8d4c8;display:flex;flex-direction:column;min-height:0}
    .niw-source-card.gp{flex:1;min-height:0;display:flex;flex-direction:column}
    .niw-source-card.gp #gpBody{flex:1;overflow:auto;min-height:0}
    .gp-source-link{display:flex;justify-content:center;text-decoration:none;font-size:12px;margin:8px 0 10px;text-align:center}
    /* Marks: underline plus a light wash, one colour per code. The heavy
       hitters (Sp, Gra, VT, P, WW, RO, Caps) are deliberately far apart. */
    .gp-mark{border-bottom:2px solid var(--gpc,#657268);background:var(--gpb,rgba(101,114,104,.12));padding:0 1px 1px;border-radius:2px 2px 0 0;cursor:help}
    .gp-c-sp{--gpc:#b45309;--gpb:rgba(180,83,9,.14)}
    .gp-c-gra{--gpc:#8c2f3b;--gpb:rgba(140,47,59,.13)}
    .gp-c-vt{--gpc:#6d28d9;--gpb:rgba(109,40,217,.12)}
    .gp-c-p{--gpc:#1d4ed8;--gpb:rgba(29,78,216,.12)}
    .gp-c-ww{--gpc:#0f766e;--gpb:rgba(15,118,110,.14)}
    .gp-c-ro{--gpc:#c2410c;--gpb:rgba(194,65,12,.15)}
    .gp-c-caps{--gpc:#be185d;--gpb:rgba(190,24,93,.12)}
    .gp-c-exp{--gpc:#475569;--gpb:rgba(71,85,105,.13)}
    .gp-c-v{--gpc:#7c2d12;--gpb:rgba(124,45,18,.13)}
    .gp-c-wo{--gpc:#0369a1;--gpb:rgba(3,105,161,.12)}
    .gp-c-str{--gpc:#a21caf;--gpb:rgba(162,28,175,.11)}
    .gp-c-inc{--gpc:#b91c1c;--gpb:rgba(185,28,28,.12)}
    .gp-c-rep{--gpc:#4d7c0f;--gpb:rgba(77,124,15,.13)}
    .gp-c-del{--gpc:#78716c;--gpb:rgba(120,113,108,.15)}
    .gp-c-embed{--gpc:#1e40af;--gpb:rgba(30,64,175,.11)}
    .gp-c-aaadj{--gpc:#9a3412;--gpb:rgba(154,52,29,.13)}
    .gp-mark.gp-dim{--gpc:#dfdcd2;--gpb:transparent}
    .gp-swatch{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:baseline}
    .gp-head{display:flex;align-items:center;gap:8px}
    .gp-progress{font-size:12px;font-weight:800;color:#2f6f4e;white-space:nowrap}
    .gp-chips{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
    .gp-chip{border:1px solid #b8c2b9;background:#fff;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:800;cursor:pointer;color:#334239;font-family:inherit}
    .gp-chip.on{background:#17221b;color:#fff;border-color:#17221b}
    .gp-chip .n{font-variant-numeric:tabular-nums;opacity:.75}
    .gp-item{border:1px solid #d8d4c8;border-left:4px solid #1f5076;border-radius:8px;padding:8px 10px;margin-bottom:7px;background:#fff;font-size:12.5px}
    .gp-item.strength{border-left-color:#2f6f4e}
    .gp-item.done .gp-title{text-decoration:line-through;color:#8b948c}
    .gp-item .gp-title{font-weight:800;display:block}
    .gp-item p{margin:3px 0 0;color:#59635d;font-size:12px;line-height:1.45}
    .gp-item label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
    .gp-item input[type=checkbox]{width:16px;height:16px;accent-color:#2f6f4e;margin-top:1px}
    .gp-trynow{display:inline-block;margin-top:5px;font-size:11px;font-weight:800;color:#1f5076;background:#e8f0f7;border-radius:6px;padding:3px 8px}
    .gp-note{font-size:11px;color:#8b948c;margin-top:6px;line-height:1.4}
    .gp-comment{font-size:12px;background:#f1efe9;border-radius:7px;padding:7px 9px;margin-bottom:6px;color:#334239}
    .gp-comment .q{font-style:italic;color:#657268;display:block;margin-bottom:2px}
    .niw-pdf-highlight{mix-blend-mode:multiply}
    .niw-pdf-underline{border-bottom:2px solid #2f6f4e}
    .niw-pdf-loading{padding:24px;text-align:center;color:#657268;font-size:13px}
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
    .niw-editor-stage{flex:1;overflow:auto;padding:24px 12px}
    .niw-page-zoom-frame{width:max-content;margin:0 auto;position:relative}
    .niw-page-shell{display:grid;grid-template-columns:26px var(--page-width);align-items:start;zoom:var(--editor-zoom)}
    .niw-line-numbers{position:relative;border:0;background:transparent;color:#9aa39d;font-family:var(--mono);font-size:10.5px;user-select:none;min-height:0}
    .niw-lnum{position:absolute;right:7px;height:31.5px;line-height:31.5px;text-align:right}
    #nativeEditor{display:block;width:100%;min-height:calc(var(--page-width) * 1.414);margin:0;background-color:#fff;background-image:repeating-linear-gradient(to right,#fff 0 7px,rgba(255,255,255,0) 7px 13px),repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,0) calc(var(--page-width) * 1.414 - 1px),#cbc4b2 calc(var(--page-width) * 1.414 - 1px),#cbc4b2 calc(var(--page-width) * 1.414));border:1px solid #ddd7ca;border-radius:0 8px 8px 0;padding:34px 38px;font-family:var(--font);font-weight:400;font-size:18px;line-height:1.75;outline:none;box-shadow:0 10px 28px rgba(31,42,36,.08)}
    #nativeEditor p,#nativeEditor div{margin:0}
    #nativeEditor ul,#nativeEditor ol{margin:0 0 0 1.3em;padding:0}
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
    @media(max-width:820px){body{overflow:auto;height:auto}.niw-shell{height:auto;display:block}.niw-passage{height:70vh;border-right:0;border-bottom:1px solid #d8d4c8}.niw-resizer{display:none}.niw-editor-stage{padding:16px}.niw-page-zoom-frame,.niw-page-shell{width:100%;max-width:100%}.niw-page-shell{grid-template-columns:22px minmax(0,1fr)}.niw-line-numbers{font-size:10px;padding:23px 5px 22px 0}#nativeEditor{min-height:60vh;padding:22px}}
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
    <button class="niw-btn primary" id="submitBtn" type="button" ${locked ? 'disabled' : ''}>${escapeHtml(submitButtonLabel)}</button>
  </header>
  <main class="niw-shell${greenpen ? ' gp-shell' : ''}">
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
      <div class="niw-panel-resizer" id="sourcePanelResizer" role="separator" aria-orientation="horizontal" aria-label="Resize task and reference panels" title="Drag to resize task/reference panels"></div>
      ${passageText || passagePdf ? `<section class="niw-source-card reference${passagePdf ? ' pdf' : ''}">
        <div class="niw-source-head">
          <h2>${passagePdf ? 'PDF reference' : 'Reference'}</h2>
          ${passagePdf ? `<div class="niw-pdf-tools">
            <label>Zoom <input id="pdfZoomSlider" type="range" min="75" max="175" step="5" value="100"></label><span id="pdfZoomLabel">100%</span>
            <button class="niw-source-btn" type="button" data-pdf-mark="underline" title="Underline selected PDF text">U</button>
            <span class="niw-popover">
              <button class="niw-source-btn" type="button" data-toggle-palette="pdfHighlightPalette" title="Highlight selected PDF text">${toolIcon('highlight')}</button>
              <span class="niw-palette" id="pdfHighlightPalette">
                <button class="niw-swatch" type="button" data-pdf-mark="highlight" data-pdf-color="#fff0a6" title="Yellow highlight" style="background:#fff0a6"></button>
                <button class="niw-swatch" type="button" data-pdf-mark="highlight" data-pdf-color="#c7f9cc" title="Green highlight" style="background:#c7f9cc"></button>
                <button class="niw-swatch" type="button" data-pdf-mark="highlight" data-pdf-color="#bfdbfe" title="Blue highlight" style="background:#bfdbfe"></button>
                <button class="niw-swatch" type="button" data-pdf-mark="highlight" data-pdf-color="#fecaca" title="Pink highlight" style="background:#fecaca"></button>
              </span>
            </span>
            <button class="niw-source-btn" type="button" data-pdf-mark="clear" title="Clear PDF marks">Clear</button>
          </div>` : ''}
          ${passageText ? `<div class="niw-source-tools">
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
          </div>` : ''}
        </div>
        ${passagePdf ? `<div class="niw-pdf-frame" id="pdfFrame"><div class="niw-pdf-pages" id="pdfPages"><div class="niw-pdf-loading">Loading PDF…</div></div></div>` : `<div class="niw-text" id="referenceText">${escapeHtml(passageText)}</div>`}
      </section>` : '<section class="niw-source-card reference"><div class="empty">No reference added.</div></section>'}
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
    ${greenpen ? `<div class="niw-resizer" role="separator" aria-hidden="true"></div>
    <aside class="niw-passage gp-side">
      <section class="niw-source-card gp" id="gpCard">
        <div class="niw-source-head gp-head">
          <h2>Your feedback</h2>
          <span class="niw-spacer"></span>
          <span class="gp-progress" id="gpProgress">Loading...</span>
        </div>
        <a class="niw-btn gp-source-link" href="/native/greenpen-source/${pad.id}" target="_blank" rel="noopener">View original instructions and reference</a>
        <div class="niw-text" id="gpBody"><p class="gp-note">Loading your marks and targets...</p></div>
      </section>
    </aside>` : ''}
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
    const sourcePanelResizer = document.getElementById('sourcePanelResizer');
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
    let savedSourceRange = null;
    const pageWidth = 794;
    let editorZoom = loadNumberSetting('nativePadZoom', 1);
    let readerWidth = loadNumberSetting('nativePadReaderWidth', 420);
    let taskHeight = loadNumberSetting('nativePadTaskHeight', 220);
    let internalClipboard = { text:'', at:0 };
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
      readerWidth = clamp(readerWidth, 260, Math.min(Math.floor(window.innerWidth * 0.78), 1100));
      taskHeight = clamp(taskHeight, 130, Math.max(130, Math.floor(window.innerHeight - 260)));
      shell.style.setProperty('--page-width', pageWidth + 'px');
      shell.style.setProperty('--editor-zoom', String(editorZoom));
      shell.style.setProperty('--reader-width', readerWidth + 'px');
      shell.style.setProperty('--task-height', taskHeight + 'px');
      syncZoomFrame();
      saveNumberSetting('nativePadZoom', editorZoom);
      saveNumberSetting('nativePadReaderWidth', readerWidth);
      saveNumberSetting('nativePadTaskHeight', taskHeight);
      zoomSlider.value = String(Math.round(editorZoom * 100));
      zoomLabel.textContent = Math.round(editorZoom * 100) + '%';
    }
    function syncZoomFrame(){
      // The page shell is scaled with the CSS zoom property, which reserves its
      // own layout space, so the frame no longer needs manual sizing.
      pageZoomFrame.style.width = '';
      pageZoomFrame.style.height = '';
    }
    function editorOwnsNode(node){
      return !!node && (node === editor || editor.contains(node));
    }
    function rememberEditorSelection(){
      const selection = window.getSelection();
      if(!selection || !selection.rangeCount || !editorOwnsNode(selection.anchorNode)) return;
      savedEditorRange = selection.getRangeAt(0).cloneRange();
    }
    function rememberSourceSelection(){
      const selection = window.getSelection();
      if(!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if(sourceRootFor(range)) savedSourceRange = range.cloneRange();
    }
    function restoreEditorSelection(){
      if(!savedEditorRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedEditorRange);
      return true;
    }
    function restoreSourceSelection(){
      if(!savedSourceRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSourceRange);
      return true;
    }
    function sanitizeEditorHtml(html){
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      // Green-pen decorations are view-only: never let them into a saved doc.
      template.content.querySelectorAll('[data-gp]').forEach(node => node.replaceWith(...node.childNodes));
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
    function nodeInsideInkPad(node){
      return !!node && (
        editor.contains(node) ||
        document.getElementById('taskText')?.contains(node) ||
        document.getElementById('referenceText')?.contains(node) ||
        document.getElementById('pdfFrame')?.contains(node)
      );
    }
    function rememberInternalClipboard(){
      const selection = window.getSelection();
      const text = selection ? selection.toString() : '';
      if(!text || !selection?.anchorNode || !nodeInsideInkPad(selection.anchorNode)) return;
      internalClipboard = { text, at:Date.now() };
    }
    function isInternalPaste(text){
      return !!text && text === internalClipboard.text && Date.now() - internalClipboard.at < 120000;
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

    document.addEventListener('copy', rememberInternalClipboard);
    document.addEventListener('cut', rememberInternalClipboard);

    editor.addEventListener('paste', event => {
      const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      const internalPaste = isInternalPaste(text);
      if(currentPolicy.paste_mode === 'allow') return;
      if(internalPaste) return;
      recordPaste(text.length || 1, 'outside_paste');
      if(currentPolicy.paste_mode === 'block'){
        event.preventDefault();
        saveState.textContent = 'Outside paste blocked';
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
      button.addEventListener('mousedown', event => {
        rememberSourceSelection();
        event.preventDefault();
      });
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
      }else if(selection?.rangeCount && sourceRootFor(selection.getRangeAt(0))){
        rememberSourceSelection();
      }
    });

    document.querySelectorAll('[data-source-mark]').forEach(button => {
      button.addEventListener('mousedown', event => {
        rememberSourceSelection();
        event.preventDefault();
      });
      button.addEventListener('click', () => {
        applySourceMark(button.dataset.sourceMark, button.dataset.sourceClass || '');
        closePalettes();
      });
    });

    if(sourcePanelResizer){
      sourcePanelResizer.addEventListener('pointerdown', event => {
        event.preventDefault();
        sourcePanelResizer.setPointerCapture(event.pointerId);
        const startY = event.clientY;
        const startHeight = taskHeight;
        const onMove = moveEvent => {
          taskHeight = startHeight + (moveEvent.clientY - startY);
          applyLayoutSettings();
        };
        const onUp = upEvent => {
          sourcePanelResizer.releasePointerCapture(upEvent.pointerId);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }

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
        submitBtn.textContent = submitDoneLabel;
        saveBtn.disabled = true;
        saveState.textContent = submitDoneLabel;
      }else{
        saveState.textContent = 'Submit failed';
      }
    });

    function updateLineNumbers(){
      // Place a number at each VISUAL line, measured from the rendered text, so
      // wrapped lines and paragraph spacing stay aligned with the gutter.
      lineNumbers.innerHTML = '';
      if(!currentText().trim()){ syncZoomFrame(); return; }
      const editorTop = editor.getBoundingClientRect().top;
      const z = editorZoom || 1;
      const range = document.createRange();
      range.selectNodeContents(editor);
      const rects = Array.from(range.getClientRects()).filter(r => r.height > 0);
      const tops = [];
      rects.forEach(r => {
        const top = r.top;
        if(!tops.length || Math.abs(tops[tops.length - 1] - top) > 4) tops.push(top);
      });
      const frag = document.createDocumentFragment();
      tops.forEach((top, index) => {
        const span = document.createElement('span');
        span.className = 'niw-lnum';
        span.textContent = String(index + 1);
        span.style.top = ((top - editorTop) / z) + 'px';
        frag.appendChild(span);
      });
      lineNumbers.appendChild(frag);
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
      let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
      let sourceRoot = range ? sourceRootFor(range) : null;
      if(!sourceRoot && restoreSourceSelection()){
        range = window.getSelection().getRangeAt(0);
        sourceRoot = sourceRootFor(range);
      }
      if(!sourceRoot) return;
      if(kind === 'clear'){
        sourceRoot.querySelectorAll('.niw-local-underline,.niw-local-highlight,.niw-local-highlight-yellow,.niw-local-highlight-green,.niw-local-highlight-blue,.niw-local-highlight-pink').forEach(node => node.replaceWith(document.createTextNode(node.textContent || '')));
        sourceRoot.normalize();
        saveLocalSourceMarks();
        return;
      }
      if(range.collapsed) return;
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

    // ===================== Green pen (rewrite pads only) =====================
    // The original essay's marks are located in the CURRENT editable text and
    // decorated in place. Fix the flagged text and the mark disappears on the
    // next re-check. Decorations never survive into a saved document (the
    // sanitizer unwraps [data-gp]).
    const GREENPEN = ${jsonScript(Boolean(greenpen))};
    if (GREENPEN) (function(){
      const gpBody = document.getElementById('gpBody');
      const gpProgress = document.getElementById('gpProgress');
      let gpMarks = [];
      let gpFeedback = { strengths: [], targets: [] };
      let gpComments = [];
      let gpOriginalPadId = null;
      let gpFilter = null;
      let gpTimer = null;

      function editorTextNodes(){
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while((node = walker.nextNode())) nodes.push(node);
        return nodes;
      }
      function caretPlainOffset(){
        const selection = window.getSelection();
        if(!selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        if(!editor.contains(range.startContainer)) return null;
        let offset = 0;
        for(const node of editorTextNodes()){
          if(node === range.startContainer) return offset + range.startOffset;
          offset += node.data.length;
        }
        return null;
      }
      function restoreCaret(target){
        if(target === null) return;
        const selection = window.getSelection();
        for(const node of editorTextNodes()){
          if(target <= node.data.length){
            try{ selection.collapse(node, target); }catch(_){}
            return;
          }
          target -= node.data.length;
        }
      }
      function contextScore(nodeText, index, mark){
        const preceding = nodeText.slice(Math.max(0, index - 24), index);
        const following = nodeText.slice(index + mark.quote.length, index + mark.quote.length + 24);
        let score = 0;
        const before = mark.context_before || '';
        for(let i = 1; i <= Math.min(before.length, preceding.length); i++){
          if(before[before.length - i] === preceding[preceding.length - i]) score++;
          else break;
        }
        const after = mark.context_after || '';
        for(let i = 0; i < Math.min(after.length, following.length); i++){
          if(after[i] === following[i]) score++;
          else break;
        }
        return score;
      }
      function gpRecheck(){
        const caret = document.activeElement === editor ? caretPlainOffset() : null;
        editor.querySelectorAll('span[data-gp]').forEach(node => node.replaceWith(...node.childNodes));
        editor.normalize();
        const wordish = ch => Boolean(ch) && /[\\w']/.test(ch);
        for(const mark of gpMarks){
          mark.found = false;
          if(!mark.quote || !mark.quote.trim()) continue;
          let best = null;
          for(const node of editorTextNodes()){
            let idx = 0;
            while((idx = node.data.indexOf(mark.quote, idx)) !== -1){
              const boundaryOk =
                !(wordish(node.data[idx - 1]) && /^[\\w']/.test(mark.quote)) &&
                !(wordish(node.data[idx + mark.quote.length]) && /[\\w']$/.test(mark.quote));
              if(boundaryOk){
                const score = contextScore(node.data, idx, mark);
                if(!best || score > best.score) best = { node, idx, score };
              }
              idx += 1;
            }
          }
          // A mark survives only if the text AROUND the quote is unchanged
          // too. Students often keep the flagged word but restructure the
          // sentence to make it correct; any change in the surrounding
          // context clears the mark rather than nagging a fixed sentence.
          // (The implementation scorer still judges honestly on resubmit.)
          const available = (mark.context_before || '').length + (mark.context_after || '').length;
          const needed = Math.min(6, available);
          if(best && best.score >= needed){
            try{
              const range = document.createRange();
              range.setStart(best.node, best.idx);
              range.setEnd(best.node, best.idx + mark.quote.length);
              const span = document.createElement('span');
              span.setAttribute('data-gp', String(mark.id));
              span.className = 'gp-mark gp-c-' + gpCodeKey(mark.code) + (gpFilter && gpCodeKey(mark.code) !== gpFilter ? ' gp-dim' : '');
              span.title = (mark.label || mark.category || '') + ' (' + (mark.code || '') + ')';
              range.surroundContents(span);
              mark.found = true;
            }catch(_){ mark.found = true; }
          }
        }
        restoreCaret(caret);
        gpRenderPanel();
      }
      function gpScheduleRecheck(){
        clearTimeout(gpTimer);
        gpTimer = setTimeout(gpRecheck, 1500);
      }
      function gpCodeKey(code){
        return String(code || 'other').toLowerCase().replace(/[^a-z]/g, '') || 'other';
      }
      function gpSwatchColor(key){
        const probe = document.createElement('span');
        probe.className = 'gp-mark gp-c-' + key;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).borderBottomColor;
        probe.remove();
        return color;
      }
      function gpCodeCounts(){
        const counts = {};
        for(const mark of gpMarks){
          const key = gpCodeKey(mark.code);
          counts[key] = counts[key] || { code: mark.code, label: mark.label || mark.code, total: 0, left: 0 };
          counts[key].total++;
          if(mark.found) counts[key].left++;
        }
        return counts;
      }
      function gpRenderPanel(){
        const fixed = gpMarks.filter(m => !m.found).length;
        gpProgress.textContent = gpMarks.length ? (fixed + ' / ' + gpMarks.length + ' cleared') : 'No marks';
        const counts = gpCodeCounts();
        let html = '';
        html += '<div class="gp-chips">';
        html += '<button class="gp-chip' + (gpFilter === null ? ' on' : '') + '" data-gp-filter="">All <span class="n">' + gpMarks.filter(m=>m.found).length + '</span></button>';
        for(const key of Object.keys(counts).sort((a,b)=>counts[b].left-counts[a].left)){
          html += '<button class="gp-chip' + (gpFilter === key ? ' on' : '') + '" data-gp-filter="' + key + '">'
            + '<span class="gp-swatch" style="background:' + gpSwatchColor(key) + '"></span>'
            + escapeGp(counts[key].code) + ' <span class="n">' + counts[key].left + '</span></button>';
        }
        html += '</div>';
        html += '<p class="gp-note">Highlighted text still has its error. Fix the word, or rewrite the sentence around it, and the mark disappears. Hover a mark to see what KIND of error it is; working out the fix is your job.</p>';
        if(gpFeedback.targets.length){
          html += '<h3 style="font-size:12px;margin:10px 0 6px">Targets: tick each one you have done</h3>';
          for(const t of gpFeedback.targets){
            html += '<div class="gp-item' + (t.student_checked ? ' done' : '') + '"><label><input type="checkbox" data-gp-target="' + t.id + '"' + (t.student_checked ? ' checked' : '') + '><span><span class="gp-title">' + escapeGp(t.title) + '</span>' + (t.explanation ? '<p>' + escapeGp(t.explanation) + '</p>' : '') + (t.try_now_prompt ? '<span class="gp-trynow">Try now: ' + escapeGp(t.try_now_prompt) + '</span>' : '') + '</span></label></div>';
          }
        }
        if(gpFeedback.strengths.length){
          html += '<h3 style="font-size:12px;margin:10px 0 6px">Keep doing this</h3>';
          for(const s of gpFeedback.strengths){
            html += '<div class="gp-item strength"><span class="gp-title">' + escapeGp(s.title) + '</span>' + (s.explanation ? '<p>' + escapeGp(s.explanation) + '</p>' : '') + '</div>';
          }
        }
        if(gpComments.length){
          html += '<h3 style="font-size:12px;margin:10px 0 6px">Teacher comments</h3>';
          for(const c of gpComments){
            html += '<div class="gp-comment">' + (c.quote ? '<span class="q">"' + escapeGp(c.quote) + '"</span>' : '') + escapeGp(c.body) + '</div>';
          }
        }
        gpBody.innerHTML = html;
        gpBody.querySelectorAll('[data-gp-filter]').forEach(button => {
          button.addEventListener('click', () => {
            gpFilter = button.getAttribute('data-gp-filter') || null;
            editor.querySelectorAll('span[data-gp]').forEach(span => {
              const isMatch = !gpFilter || [...span.classList].includes('gp-c-' + gpFilter);
              span.classList.toggle('gp-dim', !isMatch);
            });
            gpRenderPanel();
          });
        });
        gpBody.querySelectorAll('[data-gp-target]').forEach(box => {
          box.addEventListener('change', async () => {
            const itemId = box.getAttribute('data-gp-target');
            try{
              const response = await fetch('/api/native/pads/' + gpOriginalPadId + '/feedback-items/' + itemId + '/toggle-check', {
                method: 'POST', headers: { 'X-CSRF-Token': csrfToken },
              });
              if(response.ok){
                const target = gpFeedback.targets.find(t => String(t.id) === String(itemId));
                if(target) target.student_checked = !target.student_checked;
              }
            }catch(_){}
            gpRenderPanel();
          });
        });
      }
      function escapeGp(value){
        return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      fetch('/api/native/pads/' + initialPad.id + '/greenpen-context')
        .then(response => response.ok ? response.json() : null)
        .then(context => {
          if(!context){ gpProgress.textContent = ''; gpBody.innerHTML = '<p class="gp-note">Could not load feedback.</p>'; return; }
          gpOriginalPadId = context.original_pad_id;
          gpMarks = (context.marks || []).map(mark => ({ ...mark, found: false }));
          gpFeedback = context.feedback || { strengths: [], targets: [] };
          gpComments = context.comments || [];
          gpRecheck();
        })
        .catch(() => { gpProgress.textContent = ''; gpBody.innerHTML = '<p class="gp-note">Could not load feedback.</p>'; });
      editor.addEventListener('input', gpScheduleRecheck);
    })();
  </script>
  ${passagePdf ? `<script type="module">
    import * as pdfjsLib from '/assets/static/pdfjs/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/static/pdfjs/pdf.worker.min.mjs';

    const pdfSlider = document.getElementById('pdfZoomSlider');
    const pdfLabel = document.getElementById('pdfZoomLabel');
    const pdfFrame = document.getElementById('pdfFrame');
    const pdfPages = document.getElementById('pdfPages');
    const pdfZoomKey = 'nativePadPdfZoom:${assignmentId}';
    const pdfMarksKey = 'nativePdfMarks:${assignmentId}';
    const pdfBaseUrl = '/api/assignments/${assignmentId}/passage-pdf';
    const UNDERLINE_COLOR = '#2f6f4e';

    let pdfDoc = null;
    let fitScale = 1;
    let rendering = false;
    let marks = [];
    try {
      const raw = localStorage.getItem(pdfMarksKey);
      if(raw) marks = JSON.parse(raw) || [];
    } catch(_) { marks = []; }

    function saveMarks(){
      try{ localStorage.setItem(pdfMarksKey, JSON.stringify(marks)); }catch(_){}
    }
    function currentZoomPct(){
      return Math.max(75, Math.min(175, Number(pdfSlider && pdfSlider.value) || 100));
    }
    function scaleFor(){
      return fitScale * (currentZoomPct() / 100);
    }

    // ── Offset helpers (page-relative character offsets, stable across zoom) ──
    function textNodesIn(pageEl){
      const layer = pageEl.querySelector('.textLayer');
      if(!layer) return [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT, null);
      const out = []; let n;
      while((n = walker.nextNode())) out.push(n);
      return out;
    }
    function resolveTextNode(container, offset){
      if(container.nodeType === 3) return { node: container, offset };
      // element container: map child index to a text node
      const child = container.childNodes[offset] || container.childNodes[container.childNodes.length - 1];
      if(!child) return null;
      if(child.nodeType === 3) return { node: child, offset: 0 };
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
      const first = walker.nextNode();
      return first ? { node: first, offset: 0 } : null;
    }
    function offsetInPage(pageEl, container, offset){
      const resolved = resolveTextNode(container, offset);
      if(!resolved) return null;
      let acc = 0;
      for(const node of textNodesIn(pageEl)){
        if(node === resolved.node) return acc + resolved.offset;
        acc += node.textContent.length;
      }
      return null;
    }
    function pageOf(node){
      const el = node.nodeType === 3 ? node.parentElement : node;
      return el ? el.closest('.niw-pdf-page') : null;
    }

    // ── Apply one stored mark to its page by wrapping the text runs ──
    function applyMarkToPage(pageEl, mark){
      const nodes = textNodesIn(pageEl);
      let acc = 0;
      const slices = [];
      for(const node of nodes){
        const len = node.textContent.length;
        const nStart = acc, nEnd = acc + len; acc = nEnd;
        const s = Math.max(mark.start, nStart);
        const e = Math.min(mark.end, nEnd);
        if(s < e) slices.push({ node, s: s - nStart, e: e - nStart });
      }
      for(let i = slices.length - 1; i >= 0; i--){
        const { node, s, e } = slices[i];
        const range = document.createRange();
        try{
          range.setStart(node, s);
          range.setEnd(node, e);
          const span = document.createElement('span');
          span.className = 'niw-pdf-mark ' + (mark.kind === 'underline' ? 'niw-pdf-underline' : 'niw-pdf-highlight');
          if(mark.kind === 'underline') span.style.borderBottomColor = mark.color || UNDERLINE_COLOR;
          else span.style.background = mark.color || '#fff0a6';
          span.dataset.markId = mark.id;
          range.surroundContents(span);
        }catch(_){}
      }
    }

    // ── Create a mark from the current selection ──
    function markSelection(kind, color){
      const sel = window.getSelection();
      if(!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const pageEl = pageOf(range.startContainer);
      if(!pageEl || pageEl !== pageOf(range.endContainer)) return; // single page per mark
      const start = offsetInPage(pageEl, range.startContainer, range.startOffset);
      const end = offsetInPage(pageEl, range.endContainer, range.endOffset);
      if(start == null || end == null || start >= end) return;
      const mark = {
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        page: Number(pageEl.dataset.page),
        start, end, kind,
        color: kind === 'underline' ? UNDERLINE_COLOR : color
      };
      marks.push(mark);
      applyMarkToPage(pageEl, mark);
      saveMarks();
      sel.removeAllRanges();
    }
    function clearMarks(){
      marks = [];
      saveMarks();
      pdfPages.querySelectorAll('.niw-pdf-mark').forEach(span => {
        const parent = span.parentNode;
        while(span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
      });
    }

    // ── Render ──
    async function renderPage(page, scale){
      const viewport = page.getViewport({ scale });
      const pageEl = document.createElement('div');
      pageEl.className = 'niw-pdf-page';
      pageEl.dataset.page = String(page.pageNumber);
      pageEl.style.width = viewport.width + 'px';
      pageEl.style.height = viewport.height + 'px';

      const canvas = document.createElement('canvas');
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      pageEl.appendChild(canvas);

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.setProperty('--scale-factor', String(scale));
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      pageEl.appendChild(textLayerDiv);

      pdfPages.appendChild(pageEl);

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined
      }).promise;

      const textContent = await page.getTextContent();
      const textLayer = new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport });
      await textLayer.render();

      marks.filter(m => m.page === page.pageNumber).forEach(m => applyMarkToPage(pageEl, m));
    }

    async function renderAll(){
      if(rendering || !pdfDoc) return;
      rendering = true;
      const scale = scaleFor();
      pdfPages.innerHTML = '';
      try{
        for(let i = 1; i <= pdfDoc.numPages; i++){
          const page = await pdfDoc.getPage(i);
          await renderPage(page, scale);
        }
      } finally {
        rendering = false;
      }
    }

    // Restore saved zoom
    try {
      const savedZoom = Number(localStorage.getItem(pdfZoomKey));
      if(Number.isFinite(savedZoom) && pdfSlider){
        pdfSlider.value = String(Math.max(75, Math.min(175, Math.round(savedZoom))));
      }
    } catch(_) {}
    if(pdfLabel && pdfSlider) pdfLabel.textContent = pdfSlider.value + '%';

    // Load the document
    pdfjsLib.getDocument(pdfBaseUrl).promise.then(async doc => {
      pdfDoc = doc;
      const firstPage = await doc.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const avail = (pdfFrame ? pdfFrame.clientWidth : 400) - 24;
      fitScale = Math.max(0.2, avail / baseViewport.width);
      await renderAll();
    }).catch(err => {
      pdfPages.innerHTML = '<div class="niw-pdf-loading">Could not load PDF.</div>';
      console.error('PDF load error', err);
    });

    // Zoom controls
    if(pdfSlider){
      let zoomTimer = null;
      pdfSlider.addEventListener('input', () => {
        if(pdfLabel) pdfLabel.textContent = pdfSlider.value + '%';
      });
      pdfSlider.addEventListener('change', () => {
        if(pdfLabel) pdfLabel.textContent = pdfSlider.value + '%';
        try{ localStorage.setItem(pdfZoomKey, String(currentZoomPct())); }catch(_){}
        clearTimeout(zoomTimer);
        zoomTimer = setTimeout(renderAll, 30);
      });
    }

    // Mark buttons (keep selection alive by preventing default on mousedown)
    document.querySelectorAll('[data-pdf-mark]').forEach(button => {
      button.addEventListener('mousedown', event => { event.preventDefault(); });
      button.addEventListener('click', () => {
        const kind = button.dataset.pdfMark;
        if(kind === 'clear') clearMarks();
        else markSelection(kind, button.dataset.pdfColor || '#fff0a6');
        document.querySelectorAll('.niw-popover.open').forEach(p => p.classList.remove('open'));
      });
    });
  </script>` : ''}
</body>
</html>`;
}
