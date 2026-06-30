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

  // Prompt: thin full-width task bar above the split columns.
  // Passage: left panel at ~42% width alongside the writing pad.
  const taskBar = hasPrompt ? `
    <div class="task-bar">
      <span class="task-bar-label">Task</span>
      <div class="task-bar-text">${esc(prompt)}</div>
    </div>` : '';

  const passagePanel = hasPassage ? `
    <div class="split-left">
      <div class="passage-head">
        <span>Reference passage</span>
        ${passagePdf ? `<div class="pdf-zoom-ctrl">
          <input type="range" id="pdf-zoom-range" class="pdf-zoom-range" min="50" max="200" step="5" value="100" aria-label="PDF zoom">
          <span class="pdf-zoom-pct" id="pdf-zoom-pct">100%</span>
          <span class="pdf-hl-sep"></span>
          <span class="pdf-hl-label">Highlight:</span>
          <button class="pdf-hl-btn" data-phlcolor="rgba(255,220,0,0.4)" style="background:#ffdc00" onmousedown="return false" title="Yellow"></button>
          <button class="pdf-hl-btn" data-phlcolor="rgba(100,220,100,0.4)" style="background:#64dc64" onmousedown="return false" title="Green"></button>
          <button class="pdf-hl-btn" data-phlcolor="rgba(100,160,255,0.4)" style="background:#64a0ff" onmousedown="return false" title="Blue"></button>
          <button class="pdf-hl-btn" data-phlcolor="rgba(255,100,160,0.4)" style="background:#ff64a0" onmousedown="return false" title="Pink"></button>
        </div>` : ''}
      </div>
      ${passagePdf
        ? `<div class="passage-pdf-outer"><div class="passage-pdf-pages" id="passagePdfPages"></div></div>`
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
    <div class="clr-group">
      <div class="clr-picker" id="clrPicker">
        <button class="fmt-btn clr-trigger" id="clrTrigger" onmousedown="return false" title="Text color">
          <span class="clr-trigger-ic">A<span class="clr-bar" id="clrBar" style="background:#111111"></span></span>
        </button>
        <div class="clr-popup" id="clrPopup">
          <button class="clr-swatch" data-epcolor="0" style="background:#111111" onmousedown="return false" title="Black"></button>
          <button class="clr-swatch" data-epcolor="1" style="background:#cc0000" onmousedown="return false" title="Red"></button>
          <button class="clr-swatch" data-epcolor="2" style="background:#009900" onmousedown="return false" title="Green"></button>
          <button class="clr-swatch" data-epcolor="3" style="background:#0000cc" onmousedown="return false" title="Blue"></button>
          <button class="clr-swatch" data-epcolor="5" style="background:#e67300" onmousedown="return false" title="Orange"></button>
          <button class="clr-swatch" data-epcolor="4" style="background:#660066" onmousedown="return false" title="Purple"></button>
        </div>
      </div>
      <div class="clr-picker" id="hlPicker">
        <button class="fmt-btn clr-trigger" id="hlTrigger" onmousedown="return false" title="Highlight">
          <span class="clr-trigger-ic">H<span class="clr-bar" id="hlBar" style="background:#ffff00"></span></span>
        </button>
        <div class="clr-popup" id="hlPopup">
          <button class="clr-swatch hl-none" data-hlcolor="transparent" onmousedown="return false" title="Remove highlight">&#10005;</button>
          <button class="clr-swatch" data-hlcolor="#ffff00" style="background:#ffff00" onmousedown="return false" title="Yellow"></button>
          <button class="clr-swatch" data-hlcolor="#b3ffb3" style="background:#b3ffb3" onmousedown="return false" title="Green"></button>
          <button class="clr-swatch" data-hlcolor="#b3d9ff" style="background:#b3d9ff" onmousedown="return false" title="Blue"></button>
          <button class="clr-swatch" data-hlcolor="#ffb3d9" style="background:#ffb3d9" onmousedown="return false" title="Pink"></button>
          <button class="clr-swatch" data-hlcolor="#ffd9b3" style="background:#ffd9b3" onmousedown="return false" title="Orange"></button>
        </div>
      </div>
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
      <span class="wordcount" id="wc"><span class="wc-num" id="wc-w">0</span><span class="wc-lbl">w</span><span class="wc-dot">·</span><span class="wc-num" id="wc-c">0</span><span class="wc-lbl">c</span><span class="wc-dot">·</span><span class="wc-num" id="wc-l">0</span><span class="wc-lbl">l</span><span class="wc-dot">·</span><span class="wc-num" id="wc-s">0</span><span class="wc-lbl">s</span></span>
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

  const padContent = `
<div class="padwrap">
  ${taskBar}
  ${hasPassage ? `<div class="padcols" id="padcols">
    ${passagePanel}
    <div class="split-divider" id="splitDivider"></div>
    <div class="split-right">
      <div class="padframe">
        ${padchrome}
        <iframe class="padiframe" id="padiframe" src="${padUrl}" title="Writing pad"></iframe>
      </div>
      ${writeActions}
    </div>
  </div>` : `<div class="padframe">
    ${padchrome}
    <iframe class="padiframe" id="padiframe" src="${padUrl}" title="Writing pad"></iframe>
  </div>
  ${writeActions}`}
</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — InkHeron</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;height:100vh;overflow:hidden;}
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
    /* Task bar: full-width thin strip showing the writing prompt */
    .task-bar{display:flex;gap:14px;align-items:flex-start;padding:10px 20px;background:var(--surface-2,#f1efe9);border-bottom:1px solid var(--border);flex-shrink:0;max-height:130px;overflow-y:auto;}
    .task-bar-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);white-space:nowrap;padding-top:3px;flex-shrink:0;}
    .task-bar-text{font-size:13px;line-height:1.6;color:var(--text);white-space:pre-wrap;}
    /* Two-column split: passage left, pad right */
    .padcols{flex:1;display:flex;flex-direction:row;min-height:0;}
    .split-left{width:42%;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);min-height:0;overflow:hidden;}
    .split-divider{width:5px;flex-shrink:0;cursor:col-resize;background:var(--border);position:relative;transition:background .15s;user-select:none;}
    .split-divider:hover,.split-divider.dragging{background:var(--primary,#246343);}
    .split-right{flex:1;min-width:0;display:flex;flex-direction:column;}
    .passage-head{padding:7px 14px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .pdf-zoom-ctrl{display:flex;align-items:center;gap:6px;flex-shrink:0;}
    .pdf-zoom-range{width:72px;cursor:pointer;accent-color:var(--primary,#246343);}
    .pdf-zoom-pct{font-size:10px;color:var(--text-3);font-weight:600;min-width:30px;text-align:right;}
    .passage-text-content{flex:1;overflow-y:auto;min-height:0;padding:16px 18px;white-space:pre-wrap;font-family:var(--serif,Georgia,serif);font-size:14.5px;line-height:1.75;color:var(--text);}
    .passage-pdf-outer{flex:1;overflow:auto;min-height:0;}
    .passage-pdf-pages{padding:8px;display:flex;flex-direction:column;gap:8px;align-items:center;}
    .pdf-page{position:relative;box-shadow:0 1px 4px rgba(0,0,0,.18);background:#fff;line-height:1;flex-shrink:0;}
    .pdf-page-canvas{display:block;}
    .pdf-hl-canvas{position:absolute;top:0;left:0;pointer-events:none;mix-blend-mode:multiply;}
    .textLayer{position:absolute;top:0;left:0;overflow:hidden;opacity:1;line-height:1;text-size-adjust:none;user-select:text;pointer-events:auto;}
    .textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;}
    .textLayer span::selection,.textLayer br::selection{background:rgba(0,100,255,.25);}
    .pdf-hl-sep{width:1px;height:14px;background:var(--border);flex-shrink:0;margin:0 4px;}
    .pdf-hl-label{font-size:10px;color:var(--text-3);white-space:nowrap;flex-shrink:0;}
    .pdf-hl-btn{width:16px;height:16px;border-radius:50%;border:1.5px solid rgba(0,0,0,.15);cursor:pointer;padding:0;flex-shrink:0;transition:transform .12s;}
    .pdf-hl-btn:hover{transform:scale(1.25);}
    /* ── Padframe + chrome ─────────────────────────── */
    .padframe{background:var(--surface);border-top:1px solid var(--border);overflow:hidden;flex:1;display:flex;flex-direction:column;min-height:0;}
    .padchrome{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;min-height:54px;overflow-x:auto;}
    .fmt-sep{width:1px;height:24px;background:var(--border);flex-shrink:0;margin:0 3px;}
    /* ── Toolbar buttons ────────────────────────────── */
    .fmt-group{display:flex;align-items:center;gap:2px;flex-shrink:0;}
    .fmt-btn{display:flex;align-items:center;justify-content:center;width:39px;height:39px;padding:0;border:1px solid transparent;border-radius:7px;background:none;cursor:pointer;color:var(--text-2);transition:background .15s,color .15s;font-size:19px;line-height:1;flex-shrink:0;}
    .fmt-btn b,.fmt-btn i,.fmt-btn u,.fmt-btn s{font-size:19px;pointer-events:none;}
    .fmt-btn:hover{background:var(--surface-3);color:var(--text);}
    .fmt-btn.active{background:var(--surface-3);color:var(--primary);border-color:var(--border);}
    /* ── Word count fixed-width ─────────────────────── */
    .wordcount{display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-3);white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums;}
    .wc-num{display:inline-block;min-width:2.8ch;text-align:right;}
    .wc-lbl{font-size:10px;margin-right:2px;}
    .wc-dot{margin:0 3px;opacity:.5;}
    /* ── Color + highlight picker ───────────────────── */
    .clr-group{display:flex;align-items:center;gap:2px;flex-shrink:0;}
    .clr-picker{position:relative;display:flex;align-items:center;}
    .clr-trigger-ic{display:flex;flex-direction:column;align-items:center;line-height:1;font-weight:700;font-size:13px;gap:1px;pointer-events:none;}
    .clr-bar{display:block;width:16px;height:3px;border-radius:2px;}
    .clr-popup{display:none;position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:9999;gap:4px;flex-wrap:wrap;width:116px;}
    .clr-popup.open{display:flex;}
    .clr-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;outline:none;transition:transform .12s,border-color .12s;flex-shrink:0;}
    .clr-swatch:hover{transform:scale(1.2);}
    .clr-swatch.active{border-color:var(--text);}
    .hl-none{background:var(--surface-2)!important;border:1px solid var(--border)!important;font-size:11px;color:var(--text-3);display:flex;align-items:center;justify-content:center;}
    /* ── Font size + Zoom ──────────────────────────── */
    .fsize-select{font-size:11.5px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;max-width:58px;flex-shrink:0;}
    .zoom-wrap{margin-left:auto;display:flex;align-items:center;gap:5px;flex-shrink:0;}
    .zoom-wrap label{font-size:11px;color:var(--text-3);}
    .zoom-select{font-size:11.5px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;}
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
    @media(max-width:700px){.task-bar{max-height:80px;padding:8px 14px;}.padcols{flex-direction:column;}.split-left{width:100%!important;height:40vh;border-bottom:1px solid var(--border);}.split-divider{width:100%;height:5px;cursor:row-resize;}}
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
    var submitPending = false;
    var submitPendingTimer = null;
    submitBtn.addEventListener('click', function () {
      if (!submitPending) {
        submitPending = true;
        submitBtn.textContent = 'Tap again to confirm';
        submitBtn.style.background = 'var(--amber-700,#b45309)';
        submitPendingTimer = setTimeout(function () {
          submitPending = false;
          submitBtn.textContent = 'Submit for grading';
          submitBtn.style.background = '';
        }, 3000);
        return;
      }
      clearTimeout(submitPendingTimer);
      submitPending = false;
      submitBtn.disabled = true;
      submitBtn.style.background = '';
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
        submitBtn.style.background = '';
        // surface the error without relying on alert()
        var msg = document.createElement('div');
        msg.textContent = 'Submit failed: ' + e.message;
        msg.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:13px;';
        document.body.appendChild(msg);
        setTimeout(function () { msg.remove(); }, 4000);
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
      return aceInner ? aceInner.contentDocument : null;
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
  // MutationObserver runs in the parent frame, observing aceInner's innerdocbody
  // directly via cross-frame DOM access (same-origin). No script injection needed.
  // Each Etherpad line is a separate <div class="ace-line"> — joining them with a
  // space prevents "endofline1startofline2" from being counted as one word.
  var wcObserver = null;

  function countFromBody(body) {
    try {
      var raw = body.textContent || '';
      // EP injects ​/  between tokens: strip zero-width chars,
      // normalise nbsp to space, so word-splitting works correctly.
      var text = raw.replace(/\u00a0/g, ' ')
                    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '');
      var trimmed = text.trim();
      var words = trimmed ? trimmed.split(/\s+/).filter(function (w) { return w.length > 0; }).length : 0;
      var chars = trimmed.replace(/\s/g, '').length;
      var lineEls = body.querySelectorAll('.ace-line');
      var lines = lineEls.length || (trimmed ? trimmed.split(/\n+/).filter(function (l) { return l.trim(); }).length : 0);
      var sentences = trimmed ? (trimmed.match(/[.!?]+(?=\s|$)/g) || []).length : 0;
      var wW = document.getElementById('wc-w');
      if (wW) {
        wW.textContent = words;
        document.getElementById('wc-c').textContent = chars;
        document.getElementById('wc-l').textContent = lines;
        document.getElementById('wc-s').textContent = sentences;
      }
    } catch (_) {}
  }

  
  function attachWordCountObserver() {
    try {
      var doc = getAceInner();
      if (!doc) return false;
      var body = doc.getElementById('innerdocbody');
      if (!body) return false;
      if (wcObserver) wcObserver.disconnect();
      wcObserver = new MutationObserver(function () { countFromBody(body); });
      wcObserver.observe(body, { childList: true, subtree: true, characterData: true });
      countFromBody(body);
      return true;
    } catch (_) { return false; }
  }

  // Fallback poll — catches cases where observer attachment was delayed.
  function syncWordCount() {
    try {
      var doc = getAceInner();
      if (!doc) return;
      var body = doc.getElementById('innerdocbody');
      if (!body) return;
      countFromBody(body);
    } catch (_) {}
  }
  var wcInterval = setInterval(syncWordCount, 500);

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
  // Apply zoom to both the outer pad iframe body and the ace_outer body so the
  // gutter, toolbar, and editor all scale together.
  var currentZoom = 1;
  var zoomSel = document.getElementById('zoom-sel');
  function applyZoom(level) {
    currentZoom = level;
    try {
      var padDoc = getPadDoc();
      if (!padDoc || !padDoc.body) return;
      var z = level !== 1 ? String(level) : '';
      padDoc.body.style.zoom = z;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (aceOuter && aceOuter.contentDocument && aceOuter.contentDocument.body) {
        aceOuter.contentDocument.body.style.zoom = z;
      }
    } catch (_) {}
  }
  zoomSel && zoomSel.addEventListener('change', function () { applyZoom(Number(zoomSel.value)); });

  // ── Pad UI cleanup + author color suppression ─────────────────────────────

  var EP_HIDE_CSS =
    ':root,html,body{color-scheme:light!important;background:#fff!important;color:#000!important;}' +
    '#editbar{display:none!important}' +
    '#chaticon,#chat,#chatbutton,#chatAndUsers,.chat-container,.buttonicon-chat,' +
    '.chatbuttons,#chatcounter,.chat,.stick-to-bottom{display:none!important}' +
    'ul.menu_right,ul.menu_right *{display:none!important}' +
    '#history-controls,.history-controls{display:none!important}' +
    '#online_count,#users,#userlist,.popup.users{display:none!important}' +
    '#color,#color-selection{display:none!important}' +
    '.ep_align_left,.ep_align_center,.ep_align_right,.ep_align_justify{display:none!important}' +
    '#font-size,li#font-size{display:none!important}';

  var EP_INNER_CSS =
    ':root,html,body{color-scheme:light!important;background:#fff!important;color:#000!important;}' +
    '#innerdocbody,#outerdocbody{background:#fff!important;color:#000!important;}' +
    '#editorcontainerbox{background:#fff!important;}' +
    '#innerdocbody span{background:none!important;background-color:transparent!important;' +
    'border-left:none!important;box-shadow:none!important;}';

  function injectStyle(doc, id, css) {
    if (!doc || !doc.head) return false;
    if (!doc.getElementById(id)) {
      var s = doc.createElement('style');
      s.id = id;
      s.textContent = css;
      doc.head.appendChild(s);
    }
    return true;
  }

  // Watch padDoc for EP chrome elements appearing and nuke them immediately.
  var epChromeObserver = null;
  var EP_CHROME_SEL = '#editbar,#chaticon,#chat,#chatbutton,#chatAndUsers,.chat-container,' +
    '#online_count,#users,#userlist,ul.menu_right,#history-controls';
  function startEpChromeObserver(padDoc) {
    if (epChromeObserver) epChromeObserver.disconnect();
    try {
      epChromeObserver = new MutationObserver(function () {
        try {
          padDoc.querySelectorAll(EP_CHROME_SEL).forEach(function (el) {
            el.style.setProperty('display', 'none', 'important');
          });
        } catch (_) {}
      });
      epChromeObserver.observe(padDoc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_) {}
  }

  function applyOuterCleanup() {
    try {
      var padDoc = getPadDoc();
      if (!padDoc || !padDoc.head) return false;
      injectStyle(padDoc, 'ih-ui-cleanup', EP_HIDE_CSS);
      // Also force-hide anything already in the DOM right now.
      padDoc.querySelectorAll(EP_CHROME_SEL).forEach(function (el) {
        el.style.setProperty('display', 'none', 'important');
      });
      startEpChromeObserver(padDoc);
      return true;
    } catch (_) { return false; }
  }

  function applyInnerCleanup() {
    try {
      var padDoc = getPadDoc();
      if (!padDoc) return false;
      var aceOuter = padDoc.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return false;
      var aoDoc = aceOuter.contentDocument;
      injectStyle(aoDoc, 'ih-author-suppress', EP_INNER_CSS);

      // Watch aceOuter reloads — they wipe injected styles.
      try {
        aceOuter.removeEventListener('load', aceOuter._ihLoad);
      } catch (_) {}
      aceOuter._ihLoad = function () {
        setTimeout(applyInnerCleanup, 50);
      };
      aceOuter.addEventListener('load', aceOuter._ihLoad);

      var aceInner = aoDoc.querySelector('iframe[name="ace_inner"]');
      if (!aceInner || !aceInner.contentDocument) return false;
      injectStyle(aceInner.contentDocument, 'ih-author-suppress', EP_INNER_CSS);
      attachWordCountObserver();
      return true;
    } catch (_) { return false; }
  }

  var cleanupDone = false;
  var cleanupAttempts = 0;
  function tryCleanup() {
    if (cleanupDone) return;
    applyOuterCleanup(); // always run immediately — hides EP chrome with no delay
    if (applyInnerCleanup()) {
      cleanupDone = true;
      if (currentZoom !== 1) applyZoom(currentZoom);
      setTimeout(function () {
        try {
          var padDoc = getPadDoc();
          var ao = padDoc && padDoc.querySelector('iframe[name="ace_outer"]');
          if (ao && ao.contentWindow) ao.contentWindow.dispatchEvent(new Event('resize'));
        } catch (_) {}
      }, 200);
      return;
    }
    if (++cleanupAttempts < 40) setTimeout(tryCleanup, 300);
  }

  iframe.addEventListener('load', function () {
    cleanupDone = false;
    cleanupAttempts = 0;
    pasteAttached = false;
    pasteAttempts = 0;
    spellRetries = 0;
    if (wcObserver) { wcObserver.disconnect(); wcObserver = null; }
    if (epChromeObserver) { epChromeObserver.disconnect(); epChromeObserver = null; }
    // Inject outer hide CSS immediately — no delay — so EP toolbar never flashes.
    applyOuterCleanup();
    setTimeout(trySpellcheck, 200);
    setTimeout(tryAttachPaste, 500);
    setTimeout(tryCleanup, 100);
    syncWordCount();
  });

  // ── Split-panel resize ─────────────────────────────────────────────────────
  var splitDivider = document.getElementById('splitDivider');
  var splitLeft = splitDivider && splitDivider.previousElementSibling;
  var padColsEl = document.getElementById('padcols');
  if (splitDivider && splitLeft && padColsEl) {
    splitDivider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      splitDivider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) iframes[i].style.pointerEvents = 'none';
      function onMove(ev) {
        var rect = padColsEl.getBoundingClientRect();
        var pct = (ev.clientX - rect.left) / rect.width * 100;
        pct = Math.max(35, Math.min(65, pct));
        splitLeft.style.width = pct + '%';
      }
      function onUp() {
        splitDivider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        for (var i = 0; i < iframes.length; i++) iframes[i].style.pointerEvents = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  window.addEventListener('beforeunload', function () { clearInterval(wcInterval); });

  // ── Color + highlight pickers (after critical setup so errors here are safe) ──
  try {
    var clrTrigger = document.getElementById('clrTrigger');
    var clrPopup   = document.getElementById('clrPopup');
    var hlTrigger  = document.getElementById('hlTrigger');
    var hlPopup    = document.getElementById('hlPopup');

    function closeAllPickers() {
      if (clrPopup) clrPopup.classList.remove('open');
      if (hlPopup)  hlPopup.classList.remove('open');
    }
    document.addEventListener('click', closeAllPickers);

    if (clrTrigger && clrPopup) {
      clrTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var was = clrPopup.classList.contains('open');
        closeAllPickers();
        if (!was) {
          var r = clrTrigger.getBoundingClientRect();
          clrPopup.style.left = r.left + 'px';
          clrPopup.style.top  = (r.bottom + 4) + 'px';
          clrPopup.classList.add('open');
        }
      });
    }
    document.querySelectorAll('.clr-swatch[data-epcolor]').forEach(function (sw) {
      sw.addEventListener('click', function (e) {
        e.stopPropagation();
        applyEpColor(sw.dataset.epcolor);
        var bar = document.getElementById('clrBar');
        if (bar) bar.style.background = sw.style.background;
        document.querySelectorAll('.clr-swatch[data-epcolor]').forEach(function (s) { s.classList.remove('active'); });
        sw.classList.add('active');
        closeAllPickers();
      });
    });

    if (hlTrigger && hlPopup) {
      hlTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var was = hlPopup.classList.contains('open');
        closeAllPickers();
        if (!was) {
          var r = hlTrigger.getBoundingClientRect();
          hlPopup.style.left = r.left + 'px';
          hlPopup.style.top  = (r.bottom + 4) + 'px';
          hlPopup.classList.add('open');
        }
      });
    }
    document.querySelectorAll('.clr-swatch[data-hlcolor]').forEach(function (sw) {
      sw.addEventListener('click', function (e) {
        e.stopPropagation();
        var color = sw.dataset.hlcolor;
        try {
          var iDoc = getAceInner();
          if (iDoc) iDoc.execCommand('hiliteColor', false, color === 'transparent' ? 'transparent' : color);
        } catch (_) {}
        var bar = document.getElementById('hlBar');
        if (bar) bar.style.background = color === 'transparent' ? '' : color;
        closeAllPickers();
      });
    });
  } catch (_) {}

}());
</script>

${passagePdf ? `<script type="module">
import { getDocument, GlobalWorkerOptions, TextLayer } from '/assets/static/pdfjs/pdf.min.mjs';
GlobalWorkerOptions.workerSrc = '/assets/static/pdfjs/pdf.worker.min.mjs';

var pdfContainer = document.getElementById('passagePdfPages');
var pdfSlider    = document.getElementById('pdf-zoom-range');
var pdfPctEl     = document.getElementById('pdf-zoom-pct');

if (pdfContainer) {
  var pdfDoc    = null;
  var fitScale  = 1;
  var rendering = false;

  function getScale() {
    return fitScale * ((pdfSlider ? Number(pdfSlider.value) : 100) / 100);
  }

  async function renderPage(pageNum, scale) {
    var page = await pdfDoc.getPage(pageNum);
    var vp   = page.getViewport({ scale });

    // Wrapper keeps canvas, highlight canvas, and text layer aligned
    var wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.style.width  = vp.width  + 'px';
    wrap.style.height = vp.height + 'px';
    pdfContainer.appendChild(wrap);

    // PDF render canvas
    var canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width  = vp.width;
    canvas.height = vp.height;
    wrap.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    // Highlight canvas (drawn over PDF, under text layer)
    var hlCanvas = document.createElement('canvas');
    hlCanvas.className = 'pdf-hl-canvas';
    hlCanvas.width  = vp.width;
    hlCanvas.height = vp.height;
    wrap.appendChild(hlCanvas);

    // Selectable text layer
    var textDiv = document.createElement('div');
    textDiv.className = 'textLayer';
    textDiv.style.width  = vp.width  + 'px';
    textDiv.style.height = vp.height + 'px';
    wrap.appendChild(textDiv);

    var tl = new TextLayer({ textContentSource: await page.getTextContent(), container: textDiv, viewport: vp });
    await tl.render();
  }

  async function renderAll(scale) {
    if (rendering) return;
    rendering = true;
    pdfContainer.innerHTML = '';
    for (var i = 1; i <= pdfDoc.numPages; i++) {
      await renderPage(i, scale);
    }
    rendering = false;
  }

  // Paint current selection onto each page's highlight canvas
  function applyPdfHighlight(color) {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    var rects = Array.from(sel.getRangeAt(0).getClientRects());
    pdfContainer.querySelectorAll('.pdf-page').forEach(function(pg) {
      var pr  = pg.getBoundingClientRect();
      var ctx = pg.querySelector('.pdf-hl-canvas').getContext('2d');
      ctx.fillStyle = color;
      rects.forEach(function(r) {
        if (r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom) {
          ctx.fillRect(r.left - pr.left, r.top - pr.top, r.width, r.height);
        }
      });
    });
    sel.removeAllRanges();
  }

  // Highlight buttons in passage header
  document.querySelectorAll('.pdf-hl-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { applyPdfHighlight(btn.dataset.phlcolor); });
  });

  getDocument('/api/assignments/${assignmentIdSafe}/passage-pdf').promise.then(async function(doc) {
    pdfDoc = doc;
    var firstPage = await doc.getPage(1);
    var baseVp    = firstPage.getViewport({ scale: 1 });
    fitScale = (pdfContainer.offsetWidth - 16) / baseVp.width;
    await renderAll(getScale());
  }).catch(function() {
    pdfContainer.innerHTML = '<p style="padding:16px;color:var(--text-3)">Could not load PDF.</p>';
  });

  if (pdfSlider) {
    pdfSlider.addEventListener('input', function() {
      if (pdfPctEl) pdfPctEl.textContent = this.value + '%';
    });
    var renderTimer;
    pdfSlider.addEventListener('change', function() {
      if (pdfPctEl) pdfPctEl.textContent = this.value + '%';
      clearTimeout(renderTimer);
      renderTimer = setTimeout(function() { if (pdfDoc) renderAll(getScale()); }, 80);
    });
  }
}
</script>` : ''}

</body>
</html>`;
}
