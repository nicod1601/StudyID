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
