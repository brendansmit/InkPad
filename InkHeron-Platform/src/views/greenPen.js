function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCodedText(text, codes) {
  const safeCodes = [...(codes ?? [])]
    .map(code => ({
      ...code,
      start_offset: Math.max(0, Math.min(text.length, Number(code.start_offset))),
      end_offset: Math.max(0, Math.min(text.length, Number(code.end_offset))),
    }))
    .filter(code => Number.isFinite(code.start_offset) && Number.isFinite(code.end_offset) && code.end_offset > code.start_offset)
    .sort((a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset);

  let cursor = 0;
  let html = '';
  for (const code of safeCodes) {
    if (code.start_offset < cursor) continue;
    html += esc(text.slice(cursor, code.start_offset));
    html += `<span class="mk gr" title="${esc(code.category)}">${esc(text.slice(code.start_offset, code.end_offset))}<sup class="codetag">${esc(code.code)}</sup></span>`;
    cursor = code.end_offset;
  }
  html += esc(text.slice(cursor));
  return html || esc(text);
}

function renderLegend(codes) {
  const unique = new Map();
  for (const code of codes ?? []) {
    const key = `${code.code}|${code.category}`;
    if (!unique.has(key)) unique.set(key, code);
  }
  if (!unique.size) return '<p class="empty">No literacy codes yet.</p>';
  return [...unique.values()].map(code => `
    <div class="legend-row"><span class="tag">${esc(code.code)}</span><span>${esc(code.category)}</span></div>
  `).join('');
}

function renderExpander(item, kind) {
  return `
    <button class="exp ${kind === 'strength' ? 'str' : ''}" type="button">
      <span>${esc(item.title)}</span>
      <small>${esc(item.explanation)}</small>
      ${kind === 'target' ? '<em>Try now</em>' : ''}
    </button>
  `;
}

function renderFeedback(feedback, kind) {
  const rows = (feedback ?? []).filter(item => item.kind === kind);
  if (!rows.length) return '<p class="empty">Nothing selected yet.</p>';
  return rows.map(item => renderExpander(item, kind)).join('');
}

export function renderGreenPenView({ title, etherpadPadId, text, codes, feedback }) {
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} feedback - InkHeron</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;min-height:100vh;}
    *{box-sizing:border-box;}
    .top{position:sticky;top:0;z-index:50;background:rgba(247,246,242,0.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:12px 26px;display:flex;align-items:center;gap:14px;}
    .back{background:none;border:none;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--text-2);font-size:13.5px;font-weight:500;}
    .ttl{font-weight:700;color:var(--text);}
    .pill{margin-left:auto;background:var(--coral-50);color:var(--coral-600);border:1px solid var(--coral-100);border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;}
    .shell{max-width:1180px;margin:0 auto;padding:24px 26px 82px;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start;}
    .padframe,.side,.coded{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-card);}
    .padframe{overflow:hidden;min-height:560px;display:flex;flex-direction:column;}
    .chrome{display:flex;gap:6px;padding:9px 14px;border-bottom:1px solid var(--border);}
    .dot{width:9px;height:9px;border-radius:50%;}
    iframe{border:0;width:100%;min-height:520px;flex:1;}
    .side{padding:16px;position:sticky;top:78px;}
    h2{font-size:15px;margin:0 0 10px;}
    .block{border-top:1px solid var(--border);padding-top:14px;margin-top:14px;}
    .legend-row{display:flex;gap:8px;align-items:center;background:var(--surface-2);border-radius:8px;padding:8px;margin-bottom:8px;color:var(--text-2);font-size:13px;}
    .tag,.codetag{font-family:var(--mono);color:var(--maroon-500);font-weight:700;}
    .coded{margin-top:18px;padding:22px 26px;}
    .paper{white-space:pre-wrap;font-family:var(--serif);font-size:18px;line-height:1.75;color:var(--ink);}
    .mk.gr{border-bottom:2px solid var(--maroon-500);background:var(--maroon-50);cursor:help;}
    .codetag{font-size:10px;margin-left:2px;vertical-align:super;}
    .exp{width:100%;text-align:left;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px;cursor:pointer;color:var(--text);}
    .exp span{display:block;font-weight:700;}
    .exp small{display:none;color:var(--text-2);font-size:13px;margin-top:6px;}
    .exp em{display:none;margin-top:8px;color:var(--green-700);font-style:normal;font-weight:700;}
    .exp.open small,.exp.open em{display:block;}
    .exp.str{background:var(--green-50);}
    .empty{color:var(--text-3);font-size:13px;margin:0;}
    .actions{margin-top:14px;display:flex;justify-content:flex-end;}
    .btn{font-size:13.5px;font-weight:700;padding:10px 16px;border-radius:var(--r-sm);cursor:pointer;border:0;background:var(--coral-500);color:#fff;box-shadow:0 4px 14px rgba(201,106,78,0.22);}
    @media(max-width:880px){.shell{grid-template-columns:1fr;padding:18px;}.side{position:static;}}
  </style>
</head>
<body>
  <div class="top">
    <button class="back" onclick="history.back()">&#8592; Back</button>
    <span class="ttl">${esc(title)}</span>
    <span class="pill">Feedback ready</span>
  </div>
  <main class="shell">
    <section>
      <div class="padframe">
        <div class="chrome">
          <span class="dot" style="background:#E2685C"></span>
          <span class="dot" style="background:#E8B14C"></span>
          <span class="dot" style="background:var(--green-500)"></span>
        </div>
        <iframe src="${padUrl}" title="Writing pad"></iframe>
      </div>
      <article class="coded">
        <h2>Coded version</h2>
        <div class="paper">${renderCodedText(String(text ?? ''), codes)}</div>
      </article>
    </section>
    <aside class="side">
      <h2>Literacy codes</h2>
      ${renderLegend(codes)}
      <p class="empty">Use your literacy guide. The marks do not show the answer.</p>
      <div class="block">
        <h2>Targets</h2>
        ${renderFeedback(feedback, 'target')}
      </div>
      <div class="block">
        <h2>Strengths</h2>
        ${renderFeedback(feedback, 'strength')}
      </div>
      <div class="actions"><button class="btn" id="resend-btn" type="button">Resend when ready</button></div>
    </aside>
  </main>
  <script>
    document.querySelectorAll('.exp').forEach(function(button){
      button.addEventListener('click', function(){ button.classList.toggle('open'); });
    });
  </script>
</body>
</html>`;
}
