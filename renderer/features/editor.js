/**
 * Mode Code : éditeur CodeMirror, liste des exercices d'une matière,
 * exécution, enregistrement, création d'exercice.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { updateIaContextChip } from './ia.js';
import { updateNoteBtnState } from './notes.js';

let dirty = false;

const PLACEHOLDER = '// Sélectionne ou crée un exercice pour commencer';

// Libellé lisible d'un statut d'exercice (partagé avec le mode Cours).
export function statusLabel(status)
{
  return { todo: 'À faire', 'in-progress': 'En cours', done: 'Terminé' }[status] || status;
}

export function initCodeEditor()
{
  state.cm = CodeMirror(el('editorHost'),
  {
    value: PLACEHOLDER,
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    autoCloseBrackets: true,
    matchBrackets: true,
    mode: 'python',
    readOnly: true
  });

  state.cm.on('change', () =>
  {
    if (state.currentExercise) { dirty = true; updateSaveState(); }
  });
  state.cm.on('cursorActivity', updateNoteBtnState);
}

export function renderExerciseList()
{
  const listEl = el('exerciseList');
  listEl.innerHTML = '';

  const exs = Object.values(state.db.exercises).filter((e) => e.courseCode === state.currentCourse);
  if (!exs.length)
  {
    listEl.innerHTML = '<div class="empty-hint">Aucun exercice pour cette matière.<br>Clique sur "+ Nouvel exercice".</div>';
    return;
  }

  exs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const ex of exs)
  {
    const card = document.createElement('div');
    card.className = 'exercise-card' + (state.currentExercise?.id === ex.id ? ' selected' : '');
    card.dataset.status = ex.status;
    const icon = ex.language === 'java' ? '☕' : '🐍';
    card.innerHTML = `
      <div class="name">${icon} <span class="ex-name-text" title="Clique pour renommer">${escapeHtml(ex.name)}</span></div>
      <div class="meta">
        <span class="badge ${ex.status}">${statusLabel(ex.status)}</span>
        <button class="ren-ex" title="Renommer">✎</button>
        <button class="del-ex" title="Supprimer">✕</button>
      </div>`;

    card.onclick = (e) =>
    {
      if (e.target.closest('.del-ex') || e.target.closest('.ren-ex') || e.target.closest('.ex-name-input')) return;

      // Exercice déjà sélectionné + clic sur son nom → renommage en ligne.
      if (state.currentExercise?.id === ex.id && e.target.closest('.ex-name-text'))
      {
        startRename(ex, card);
        return;
      }
      state.currentExercise = ex;
      renderExerciseList();
      loadExerciseIntoEditor(ex);
    };

    card.querySelector('.ren-ex').onclick = (e) => { e.stopPropagation(); startRename(ex, card); };

    card.querySelector('.del-ex').onclick = async (e) =>
    {
      e.stopPropagation();
      if (!confirm(`Supprimer "${ex.name}" (et son fichier) ?`)) return;
      state.db = await window.studyide.deleteExercise({ id: ex.id, deleteFile: true });
      if (state.currentExercise?.id === ex.id) { state.currentExercise = null; loadExerciseIntoEditor(null); }
      renderExerciseList();
    };

    listEl.appendChild(card);
  }
}

// Édition en ligne du nom d'un exercice (remplace le nom par un champ de saisie).
function startRename(ex, card)
{
  const nameDiv = card.querySelector('.name');
  const input = document.createElement('input');
  input.className = 'ex-name-input';
  input.value = ex.name;
  nameDiv.innerHTML = '';
  nameDiv.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async () =>
  {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (!newName || newName === ex.name) { renderExerciseList(); return; }

    const res = await window.studyide.renameExercise({ id: ex.id, name: newName });
    if (!res.ok) { alert(res.error); renderExerciseList(); return; }

    state.db = await window.studyide.getDB();
    if (state.currentExercise?.id === ex.id)
    {
      state.currentExercise = state.db.exercises[ex.id];
      el('tabInfo').textContent = state.currentExercise.filePath;
    }
    renderExerciseList();
  };

  input.onclick = (e) => e.stopPropagation();
  input.onblur = commit;
  input.onkeydown = (e) =>
  {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { done = true; renderExerciseList(); }
  };
}

export async function loadExerciseIntoEditor(ex)
{
  dirty = false;

  if (!ex)
  {
    state.cm.setValue(PLACEHOLDER);
    state.cm.setOption('readOnly', true);
    el('tabInfo').textContent = 'Aucun fichier ouvert';
    el('runBtn').disabled = true;
    el('saveBtn').disabled = true;
    el('statusSelect').disabled = true;
    updateIaContextChip();
    return;
  }

  const res = await window.studyide.readFile(ex.filePath);
  state.cm.setOption('mode', ex.language === 'java' ? 'text/x-java' : 'python');
  state.cm.setValue(res.ok ? res.content : `// Impossible de lire le fichier : ${res.error}`);
  state.cm.setOption('readOnly', false);
  state.cm.refresh(); // réaligne l'éditeur après changement de layout (sécurité)
  el('tabInfo').textContent = ex.filePath;
  el('runBtn').disabled = false;
  el('saveBtn').disabled = false;
  el('statusSelect').disabled = false;
  el('statusSelect').value = ex.status;
  updateSaveState();
  updateIaContextChip();
}

function updateSaveState()
{
  el('saveBtn').textContent = dirty ? '💾 Enregistrer *' : '💾 Enregistrer';
}

async function saveCurrent()
{
  if (!state.currentExercise) return;
  const res = await window.studyide.writeFile({ filePath: state.currentExercise.filePath, content: state.cm.getValue() });
  if (res.ok) { dirty = false; updateSaveState(); }
  else alert('Erreur en enregistrant : ' + res.error);
}

async function runCurrent()
{
  if (!state.currentExercise) return;
  if (dirty) await saveCurrent();

  const outEl = el('outputContent');
  outEl.classList.remove('error');
  outEl.textContent = '⏳ Exécution en cours...';

  const result = await window.studyide.executeCode(
  {
    filePath: state.currentExercise.filePath,
    language: state.currentExercise.language
  });

  if (result.ok)
  {
    outEl.classList.remove('error');
    outEl.textContent = result.output || '(aucune sortie)';
  }
  else
  {
    outEl.classList.add('error');
    outEl.textContent = (result.output ? result.output + '\n' : '') + '--- Erreur ---\n' + (result.error || 'Erreur inconnue.');
  }
}

// Insère un bloc de code (venant de l'IA) dans l'éditeur du mode Code.
export function insertCodeIntoEditor(code)
{
  if (!state.currentExercise || !state.cm)
  {
    alert('Ouvre d\'abord un exercice de code (mode Code) pour pouvoir y insérer ce code.');
    return;
  }
  if (state.cm.getValue().trim() && !confirm('Remplacer le contenu actuel de l\'éditeur par ce code ?')) return;
  state.cm.setValue(code);
  dirty = true;
  updateSaveState();
}

export function bindEditorEvents()
{
  el('saveBtn').onclick = saveCurrent;
  el('runBtn').onclick = runCurrent;
  el('clearOutputBtn').onclick = () =>
  {
    el('outputContent').textContent = '';
    el('outputContent').classList.remove('error');
  };

  el('statusSelect').onchange = async (e) =>
  {
    if (!state.currentExercise) return;
    state.db = await window.studyide.updateExerciseStatus({ id: state.currentExercise.id, status: e.target.value });
    state.currentExercise = state.db.exercises[state.currentExercise.id];
    renderExerciseList();
  };

  el('openWorkspaceBtn').onclick = async () =>
  {
    const dir = await window.studyide.getWorkspaceDir();
    window.studyide.openExternal(dir);
  };

  bindNewExerciseModal();
  bindOutputResize();

  // Ctrl+S pour enregistrer l'exercice courant.
  window.addEventListener('keydown', (e) =>
  {
    if ((e.ctrlKey || e.metaKey) && e.key === 's')
    {
      e.preventDefault();
      saveCurrent();
    }
  });
}

// Modale « nouvel exercice » : nom + choix du langage.
function bindNewExerciseModal()
{
  let chosenLang = 'python';

  el('newExerciseBtn').onclick = () =>
  {
    if (!state.currentCourse) { alert('Choisis d\'abord une matière à gauche.'); return; }
    el('newExName').value = '';
    chosenLang = 'python';
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === 'python'));
    el('modalOverlay').classList.add('open');
    el('newExName').focus();
  };

  el('cancelNewExBtn').onclick = () => el('modalOverlay').classList.remove('open');

  document.querySelectorAll('.lang-btn').forEach((btn) =>
  {
    btn.onclick = () =>
    {
      chosenLang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
    };
  });

  el('confirmNewExBtn').onclick = async () =>
  {
    const name = el('newExName').value.trim();
    if (!name) { alert('Donne un nom à l\'exercice.'); return; }
    const ex = await window.studyide.createExercise({ courseCode: state.currentCourse, name, language: chosenLang });
    state.db = await window.studyide.getDB();
    state.currentExercise = ex;
    el('modalOverlay').classList.remove('open');
    renderExerciseList();
    loadExerciseIntoEditor(ex);
  };

  el('newExName').addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter') el('confirmNewExBtn').click();
  });
}

// Ajuste la hauteur de la console en glissant sa poignée du haut.
function bindOutputResize()
{
  const panel = document.querySelector('.output-panel');
  const handle = el('outputResize');
  if (!panel || !handle) return;

  const clampHeight = (h) => Math.max(90, Math.min(h, Math.round(window.innerHeight * 0.6)));

  let saved = 0;
  try { saved = Number(localStorage.getItem('studyide_output_height')) || 0; } catch (e) {}
  if (saved) panel.style.height = clampHeight(saved) + 'px';

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', (e) =>
  {
    dragging = true;
    startY = e.clientY;
    startHeight = panel.getBoundingClientRect().height;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) =>
  {
    if (!dragging) return;
    // Glisser vers le haut (clientY diminue) agrandit la console.
    panel.style.height = clampHeight(startHeight + (startY - e.clientY)) + 'px';
    if (state.cm) state.cm.refresh();
  });

  window.addEventListener('mouseup', () =>
  {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    try { localStorage.setItem('studyide_output_height', String(parseInt(panel.style.height, 10))); } catch (e) {}
  });
}
