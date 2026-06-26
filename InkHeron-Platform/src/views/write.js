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

export function renderWriteView({ title, dueAt, spellcheck, etherpadPadId }) {
  const dueLabel = formatDue(dueAt);
  const spellLabel = spellcheck ? 'Spellcheck on for this draft' : 'Spellcheck off for this draft';
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;

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

</body>
</html>`;
}
