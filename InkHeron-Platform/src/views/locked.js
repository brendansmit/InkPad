function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLockedView({ title, reason }) {
  const messages = {
    exam: 'This assignment has been submitted and is now locked.',
    due: 'The due date has passed. This assignment is now closed.',
    marked: 'This assignment has been marked and is no longer editable.',
    default: 'This assignment is closed.',
  };
  const message = messages[reason] ?? messages.default;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — InkHeron</title>
  <link rel="icon" href="/assets/InkHeron%20Logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh;}
    *{box-sizing:border-box;}
    .writetop{position:sticky;top:0;z-index:50;background:rgba(247,246,242,0.9);backdrop-filter:blur(10px);
      border-bottom:1px solid var(--border);padding:12px 26px;display:flex;align-items:center;gap:14px;}
    .backbtn{background:none;border:none;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--text-2);
      font-size:13.5px;font-weight:500;transition:background .2s;}
    .backbtn:hover{background:var(--surface-3);}
    .ttl{font-weight:600;font-size:14.5px;color:var(--text);}
    .sp{flex:1;}
    .lockedmsg{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px;padding:40px 24px;text-align:center;}
    .lockicon{font-size:36px;opacity:0.35;}
    .lockedmsg h2{font-size:17px;font-weight:600;color:var(--text);margin:0;}
    .lockedmsg p{font-size:14px;color:var(--text-2);margin:0;max-width:38ch;}
  </style>
</head>
<body>
<div class="writetop">
  <button class="backbtn" onclick="history.back()">&#8592; Back</button>
  <span class="ttl">${esc(title)}</span>
  <span class="sp"></span>
</div>
<div class="lockedmsg">
  <span class="lockicon">&#128274;</span>
  <h2>Assignment closed</h2>
  <p>${esc(message)}</p>
</div>
</body>
</html>`;
}
