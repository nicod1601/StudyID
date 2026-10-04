/**
 * Barre de recherche globale (bandeau du haut).
 *
 * C'est de la recherche par INDEX (aucune IA) : on réutilise le moteur partagé
 * défini dans ia.js (index de l'espace StudyIDE + classement + navigation). Les
 * résultats s'affichent dans un menu déroulant sous la barre, sans perturber la
 * mise en page des onglets.
 */

import { el } from '../core/dom.js';
import { ensureSearchIndex, runSearch, groupsToHtml, wireResultClicks } from './ia.js';

const DEBOUNCE_MS = 180;

let debounceTimer = null;

function showResults(query)
{
  const box = el('searchResults');
  const groups = runSearch(query);

  if (!groups.length)
  {
    box.innerHTML = '<div class="src-empty">Aucun résultat. Essaie un nom de fichier, de matière ou d\'exercice.</div>';
  }
  else
  {
    box.innerHTML = groupsToHtml(groups);
    wireResultClicks(box);
  }
  box.classList.remove('hidden');
}

function hideResults()
{
  el('searchResults').classList.add('hidden');
}

export function bindGlobalSearch()
{
  const input = el('globalSearchInput');
  const box = el('searchResults');
  const clearBtn = el('globalSearchClear');
  if (!input) return;

  // Construit l'index dès que l'utilisateur arrive sur la barre.
  input.addEventListener('focus', () => { ensureSearchIndex(); });

  input.addEventListener('input', () =>
  {
    const query = input.value.trim();
    clearBtn.classList.toggle('hidden', !query);
    clearTimeout(debounceTimer);

    if (!query) { hideResults(); box.innerHTML = ''; return; }

    debounceTimer = setTimeout(async () =>
    {
      await ensureSearchIndex();
      showResults(query);
    }, DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Escape') { hideResults(); input.blur(); }
  });

  clearBtn.onclick = () =>
  {
    input.value = '';
    clearBtn.classList.add('hidden');
    box.innerHTML = '';
    hideResults();
    input.focus();
  };

  // Clic sur un résultat → la navigation se fait (via wireResultClicks) et on
  // referme le menu, sauf si on a cliqué sur « Ouvrir le dossier ».
  box.addEventListener('click', (e) =>
  {
    if (e.target.closest('.ia-source-item') && !e.target.closest('.src-open')) hideResults();
  });

  // Referme le menu si on clique en dehors du bandeau.
  document.addEventListener('click', (e) =>
  {
    if (!el('topbar').contains(e.target)) hideResults();
  });
}
