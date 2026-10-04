/**
 * Conversion Markdown minimale → HTML (réponses IA, énoncés, solutions).
 * Volontairement limitée : blocs ```code```, `inline`, **gras**, tableaux,
 * listes à puces, sauts de ligne. Tout le texte est échappé avant traitement.
 */

import { escapeHtml } from './dom.js';

export function simpleMarkdown(text)
{
  let src = text;

  // 1) On isole d'abord les blocs de code pour ne pas les reformater.
  const codeBlocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (m, code) =>
  {
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
  });

  const htmlLines = [];
  let inTable = false;

  for (const raw of src.split('\n'))
  {
    let line = raw;

    // Tableaux Markdown : lignes entourées de « | ».
    if (/^\s*\|.*\|\s*$/.test(line))
    {
      if (/^[\s|:-]+$/.test(line)) continue; // ligne de séparation ---|---
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!inTable) { htmlLines.push('<table>'); inTable = true; }
      htmlLines.push('<tr>' + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>');
      continue;
    }
    else if (inTable)
    {
      htmlLines.push('</table>');
      inTable = false;
    }

    line = escapeHtml(line);
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
