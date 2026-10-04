/**
 * Redimensionnement des tiroirs de droite (IA, Notes, Chat) par glissement de
 * la poignée sur leur bord gauche. Largeur limitée à la moitié de la fenêtre,
 * et mémorisée d'une session à l'autre.
 */

const MIN_WIDTH = 320;
const STORAGE_KEY = 'studyide_drawer_width';

function maxWidth()
{
  return Math.round(window.innerWidth * 0.5);
}

function clampWidth(w)
{
  return Math.max(MIN_WIDTH, Math.min(w, maxWidth()));
}

function makeResizable(drawer)
{
  const handle = drawer.querySelector('.drawer-resize');
  if (!handle) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) =>
  {
    dragging = true;
    startX = e.clientX;
    startWidth = drawer.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) =>
  {
    if (!dragging) return;
    // Le tiroir est à droite : glisser vers la gauche (clientX diminue) l'élargit.
    const width = clampWidth(startWidth + (startX - e.clientX));
    setWidthOnAll(width);
  });

  window.addEventListener('mouseup', () =>
  {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    try { localStorage.setItem(STORAGE_KEY, String(parseInt(drawer.style.width, 10))); } catch (e) {}
  });
}

// Applique la même largeur à tous les tiroirs (comportement cohérent).
function setWidthOnAll(width)
{
  document.querySelectorAll('.ia-drawer').forEach((d) => { d.style.width = width + 'px'; });
}

export function bindDrawerResize()
{
  const drawers = document.querySelectorAll('.ia-drawer');

  // Restaure la largeur mémorisée (en la re-bornant à la fenêtre actuelle).
  let saved = 0;
  try { saved = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (e) {}
  if (saved) setWidthOnAll(clampWidth(saved));

  drawers.forEach(makeResizable);
}
