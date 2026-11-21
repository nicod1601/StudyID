// Petits utilitaires communs : échappement HTML, extension de fichier, taille, messages, mini-Markdown.

function simpleMarkdown(text) {
  // Conversion markdown minimale : ```code```, `inline`, **gras**, tableaux, listes, sauts de ligne.
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let src = text;
  const codeBlocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(`<pre><code>${escape(code.trim())}</code></pre>`);
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
  });

  const lines = src.split('\n');
  const htmlLines = [];
  let inTable = false;
  for (let raw of lines) {
    let line = raw;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:-]+$/.test(line)) continue; // ligne de séparation ---|---
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!inTable) { htmlLines.push('<table>'); inTable = true; }
      htmlLines.push('<tr>' + cells.map((c) => `<td>${escape(c)}</td>`).join('') + '</tr>');
      continue;
    } else if (inTable) {
      htmlLines.push('</table>');
      inTable = false;
    }
    line = escape(line);
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/`(.+?)`/g, '<code>$1</code>');
    if (/^-\s+/.test(line)) line = '• ' + line.replace(/^-\s+/, '');
    htmlLines.push(line);
  }
  if (inTable) htmlLines.push('</table>');
  let html = htmlLines.join('<br>');
  html = html.replace(/@@CODEBLOCK(\d+)@@/g, (m, i) => codeBlocks[Number(i)]);
  return html;
}
function extOf(name) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}
// Petit message temporaire en bas de l'écran
function notify(msg) {
  const t = document.createElement('div');
  t.className = 'cp-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Remplace window.prompt() qui n'est pas disponible dans Electron. Renvoie la saisie, ou null si annulé.
function askText(message, def = '') {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100000';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-2,#1d222b);color:var(--text-hi,#e8ecf3);border:1px solid #3a4252;border-radius:8px;padding:16px;width:min(420px,90vw);box-shadow:0 10px 40px rgba(0,0,0,.5)';
    const lab = document.createElement('div'); lab.textContent = message; lab.style.cssText = 'margin-bottom:10px;font-size:13px';
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = def; inp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 9px;margin-bottom:12px';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const no = document.createElement('button'); no.textContent = 'Annuler'; no.className = 'btn-ghost';
    const ok = document.createElement('button'); ok.textContent = 'OK'; ok.className = 'btn-run';
    row.append(no, ok); box.append(lab, inp, row); ov.append(box); document.body.append(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    ok.onclick = () => done(inp.value);
    no.onclick = () => done(null);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value); else if (e.key === 'Escape') done(null); });
    inp.focus(); inp.select();
  });
}
