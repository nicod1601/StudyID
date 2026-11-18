// Mode plein écran de l'éditeur.

// =====================================================================
// MODE PLEIN ÉCRAN — masque la sidebar et le panneau latéral
// =====================================================================

let editorFullscreen = false;
function toggleFullscreen() {
  editorFullscreen = !editorFullscreen;
  document.body.classList.toggle('editor-fullscreen', editorFullscreen);
  const label = editorFullscreen ? '✕ Quitter' : '⛶';
  const title = editorFullscreen
    ? 'Quitter le plein écran (Échap)'
    : 'Plein écran (masque la sidebar et les panneaux)';
  ['fullscreenBtn', 'fullscreenBtnProjet'].forEach((id) => {
    const btn = el(id);
    if (!btn) return;
    btn.textContent = label;
    btn.title = title;
    btn.classList.toggle('active', editorFullscreen);
  });

  // CodeMirror ne redessine pas tout seul quand la largeur disponible
  // change via CSS (display:none sur un panneau voisin) : on le force.
  requestAnimationFrame(() => {
    if (cm) cm.refresh();
    if (pcm) pcm.refresh();
  });
}
function bindFullscreenEvents() {
  el('fullscreenBtn').onclick = toggleFullscreen;
  el('fullscreenBtnProjet').onclick = toggleFullscreen;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorFullscreen) toggleFullscreen();
  });
}
