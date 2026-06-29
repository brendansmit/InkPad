function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CODE_HINTS = {
  'Sp':     { label: 'Spelling mistake',              hint: 'Check this word — it is spelled incorrectly. Try sounding it out letter by letter, or look it up.' },
  '//':     { label: 'Start a new paragraph',         hint: 'A new idea begins here. Press Enter to give it its own paragraph.' },
  'Caps':   { label: 'Capital letter needed',         hint: 'This word needs to start with a capital letter. Names, places, and the first word of every sentence always do.' },
  'P':      { label: 'Punctuation problem',           hint: 'Something is missing or wrong — a full stop, comma, apostrophe, or quotation marks. Read it aloud and listen for where you naturally pause or stop.' },
  '^':      { label: 'Missing word',                  hint: 'A word has been left out. Read the sentence aloud slowly — where does it feel incomplete or rushed?' },
  'Exp':    { label: 'Awkward phrasing',              hint: 'The words are there but the sentence does not sound natural in English. Say it aloud and rearrange until it feels right.' },
  'Gra':    { label: 'Grammar mistake',               hint: 'There is an error in how the words connect. Check: does the verb match the subject? Is the word form correct?' },
  'Embed':  { label: 'Quote not introduced properly', hint: 'When you use someone\'s words, introduce them with a comma or colon, then put the words inside quotation marks.' },
  '✓':      { label: 'Strong writing',                hint: null },
  'AA/Adj': { label: 'Wrong adjective form',          hint: 'You can say "more interesting" or "the most interesting" — but not both at the same time. Choose one method to make a comparison.' },
  'STR':    { label: 'Sentence structure problem',    hint: 'This sentence is hard to follow. Try breaking it into two, or use a connecting word like "which" or "because" to link the ideas.' },
  'FOR':    { label: 'Format issue',                  hint: 'The layout or presentation does not match what is expected for this type of writing. Check the format guide again.' },
  'WO':     { label: 'Word order problem',            hint: 'In English the usual pattern is: who (subject) does what (verb) to what (object). Rearrange the words to follow this order.' },
  'WW':     { label: 'Wrong word choice',             hint: 'This word does not fit the meaning you want. Think carefully about what you are trying to say and choose a more accurate word.' },
  'V':      { label: 'Verb form wrong or missing',    hint: 'There is a problem with the verb here — it might be missing, or in the wrong form (e.g. "go" when you need "goes").' },
  'VT':     { label: 'Wrong verb tense',              hint: 'The verb tense does not match when this happened. Ask yourself: is this past, present, or future? Then use the right form.' },
  'del':    { label: 'Delete this word',              hint: 'This word is not needed. The sentence is clearer without it.' },
  'inc':    { label: 'Incomplete sentence',           hint: 'This is not a complete sentence. It needs a subject, a verb, or a conclusion to finish the thought.' },
  'RO':     { label: 'Run-on sentence',               hint: 'Two complete sentences have been joined without proper punctuation. Split them with a full stop, or join with "and", "but", or "so".' },
  'Rep':    { label: 'Repetition',                    hint: 'The same word or idea appears too close together. Try using a synonym, or restructure so it is only said once.' },
};

function codeInfo(code) {
  return CODE_HINTS[code] ?? { label: code, hint: null };
}

function cardId(code) {
  return 'cc-' + code.replace(/[^a-z0-9]/gi, '_');
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

  const isGood = (c) => c === '✓';

  let cursor = 0;
  let html = '';
  for (const code of safeCodes) {
    if (code.start_offset < cursor) continue;
    html += esc(text.slice(cursor, code.start_offset));
    const { label } = codeInfo(code.code);
    const cls = isGood(code.code) ? 'mk good' : 'mk gr';
    const onclick = isGood(code.code) ? '' : ` onclick="highlightCode('${esc(code.code)}')"`;
    html += `<span class="${cls}" title="${esc(label)}"${onclick}>${esc(text.slice(code.start_offset, code.end_offset))}<sup class="codetag">${esc(code.code)}</sup></span>`;
    cursor = code.end_offset;
  }
  html += esc(text.slice(cursor));
  return html || esc(text);
}

function renderLegend(codes) {
  const unique = new Map();
  for (const code of codes ?? []) {
    if (!unique.has(code.code)) unique.set(code.code, code);
  }
  if (!unique.size) return '<p class="empty">No literacy codes yet.</p>';

  return [...unique.values()].map(code => {
    const { label, hint } = codeInfo(code.code);
    const isGood = code.code === '✓';
    const id = cardId(code.code);
    return `
    <div class="code-card${isGood ? ' good' : ''}" id="${id}">
      <div class="card-row">
        <span class="tag${isGood ? ' good' : ''}">${esc(code.code)}</span>
        <span class="card-label">${esc(label)}</span>
        ${hint ? `<button class="hint-btn" type="button" onclick="toggleHint('${id}')">Hint</button>` : ''}
      </div>
      ${hint ? `<p class="hint-text" id="ht-${id}">${esc(hint)}</p>` : ''}
    </div>`;
  }).join('');
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

export function renderGreenPenView({ title, etherpadPadId, padId, csrfToken, text, codes, feedback }) {
  const padUrl = `/p/${encodeURIComponent(etherpadPadId)}`;
  const padIdJs = JSON.stringify(Number(padId));
  const csrfTokenJs = JSON.stringify(csrfToken ?? '');
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
    .side{padding:16px;position:sticky;top:78px;max-height:calc(100vh - 100px);overflow-y:auto;}
    h2{font-size:15px;margin:0 0 10px;}
    .block{border-top:1px solid var(--border);padding-top:14px;margin-top:14px;}
    .tag{font-family:var(--mono);color:var(--maroon-500);font-weight:700;}
    .tag.good{color:var(--green-600);}
    .codetag{font-family:var(--mono);font-size:10px;margin-left:2px;vertical-align:super;font-weight:700;}
    .coded{margin-top:18px;padding:22px 26px;}
    .paper{white-space:pre-wrap;font-family:var(--serif);font-size:18px;line-height:1.75;color:var(--ink);}
    .mk.gr{border-bottom:2px solid var(--maroon-500);background:var(--maroon-50);cursor:pointer;border-radius:2px;transition:background 0.12s;}
    .mk.gr .codetag{color:var(--maroon-500);}
    .mk.gr:hover,.mk.gr.active{background:rgba(140,47,59,0.18);}
    .mk.good{border-bottom:2px solid var(--green-600);background:var(--green-50);cursor:default;border-radius:2px;}
    .mk.good .codetag{color:var(--green-600);}
    .code-card{border:1px solid var(--border);border-radius:var(--r-sm);padding:9px 11px;margin-bottom:8px;transition:border-color 0.15s,background 0.15s;}
    .code-card.highlighted{border-color:var(--maroon-500);background:var(--maroon-50);}
    .code-card.good{border-color:var(--green-200);}
    .card-row{display:flex;align-items:center;gap:8px;}
    .card-label{font-size:13px;color:var(--text);flex:1;}
    .hint-btn{font-size:11px;font-weight:700;color:var(--blue-700);background:var(--blue-50);border:none;border-radius:4px;padding:3px 8px;cursor:pointer;flex-shrink:0;}
    .hint-btn:hover{background:var(--blue-100);}
    .hint-text{display:none;font-size:12.5px;color:var(--text-2);line-height:1.6;margin:8px 0 0;padding-top:8px;border-top:1px solid var(--border);}
    .hint-text.open{display:block;}
    .exp{width:100%;text-align:left;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px;cursor:pointer;color:var(--text);}
    .exp span{display:block;font-weight:700;}
    .exp small{display:none;color:var(--text-2);font-size:13px;margin-top:6px;}
    .exp em{display:none;margin-top:8px;color:var(--green-700);font-style:normal;font-weight:700;}
    .exp.open small,.exp.open em{display:block;}
    .exp.str{background:var(--green-50);}
    .empty{color:var(--text-3);font-size:13px;margin:0;}
    .actions{margin-top:14px;display:flex;justify-content:flex-end;}
    .btn{font-size:13.5px;font-weight:700;padding:10px 16px;border-radius:var(--r-sm);cursor:pointer;border:0;background:var(--coral-500);color:#fff;box-shadow:0 4px 14px rgba(201,106,78,0.22);}
    @media(max-width:880px){.shell{grid-template-columns:1fr;padding:18px;}.side{position:static;max-height:none;}}
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
    var PAD_ID = ${padIdJs};
    var CSRF_TOKEN = ${csrfTokenJs};

    function highlightCode(code) {
      document.querySelectorAll('.mk.gr').forEach(function(s){ s.classList.remove('active'); });
      document.querySelectorAll('.mk.gr[onclick*="' + code.replace(/'/g,"\\'") + '"]').forEach(function(s){ s.classList.add('active'); });
      var id = 'cc-' + code.replace(/[^a-z0-9]/gi,'_');
      document.querySelectorAll('.code-card').forEach(function(c){ c.classList.remove('highlighted'); });
      var card = document.getElementById(id);
      if (card) {
        card.classList.add('highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        var ht = document.getElementById('ht-' + id);
        var btn = card.querySelector('.hint-btn');
        if (ht && btn && !ht.classList.contains('open')) {
          ht.classList.add('open');
          btn.textContent = 'Hide';
        }
      }
    }

    function toggleHint(cardId) {
      var ht = document.getElementById('ht-' + cardId);
      var btn = document.querySelector('#' + cardId + ' .hint-btn');
      if (!ht || !btn) return;
      var open = ht.classList.toggle('open');
      btn.textContent = open ? 'Hide' : 'Hint';
    }

    document.querySelectorAll('.exp').forEach(function(button){
      button.addEventListener('click', function(){ button.classList.toggle('open'); });
    });

    document.getElementById('resend-btn').addEventListener('click', async function(){
      var button = this;
      button.disabled = true;
      button.textContent = 'Resending...';
      try {
        var response = await fetch('/api/pads/' + PAD_ID + '/resubmit', {
          method: 'POST',
          headers: { 'X-CSRF-Token': CSRF_TOKEN },
          credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('resubmit_failed');
        window.location.href = '/';
      } catch (_) {
        button.disabled = false;
        button.textContent = 'Resend when ready';
      }
    });
  </script>
</body>
</html>`;
}
