/**
 * Mode plein écran de l'éditeur : masque la sidebar et les panneaux latéraux
 * (via une classe sur <body>), pour se concentrer sur le code.
 */

import { el } from '../core/dom.js';
import { state } from '../core/state.js';

let editorFullscreen = false;

function toggleFullscreen()
{
  editorFullscreen = !editorFullscreen;
  document.body.classList.toggle('editor-fullscreen', editorFullscreen);

  const label = editorFullscreen ? '✕ Quitter' : '⛶';
  const title = editorFullscreen
    ? 'Quitter le plein écran (Échap)'
    : 'Plein écran (masque la sidebar et les panneaux)';

  for (const id of ['fullscreenBtn', 'fullscreenBtnProjet'])
  {
    const btn = el(id);
    if (!btn) continue;
    btn.textContent = label;
    btn.title = title;
    btn.classList.toggle('active', editorFullscreen);
  }

  // CodeMirror ne se redessine pas tout seul quand la largeur change via CSS :
  // on le force après le reflow.
  requestAnimationFrame(() =>
  {
    if (state.cm) state.cm.refresh();
    if (state.pcm) state.pcm.refresh();
  });
}

export function bindFullscreenEvents()
{
  el('fullscreenBtn').onclick = toggleFullscreen;
  el('fullscreenBtnProjet').onclick = toggleFullscreen;
  document.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Escape' && editorFullscreen) toggleFullscreen();
  });
}
