// Mode Code : liste des exercices, chargement dans l'éditeur, enregistrement, exécution.

function renderExerciseList() {
  const listEl = el('exerciseList');
  listEl.innerHTML = '';
  const exs = Object.values(db.exercises).filter((e) => e.courseCode === currentCourse);
  if (!exs.length) {
    listEl.innerHTML = '<div class="empty-hint">Aucun exercice pour cette matière.<br>Clique sur "+ Nouvel exercice".</div>';
    return;
  }
  exs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const ex of exs) {
    const card = document.createElement('div');
    card.className = 'exercise-card' + (currentExercise?.id === ex.id ? ' selected' : '');
    card.dataset.status = ex.status;
    const icon = ex.language === 'java' ? '☕' : '🐍';
    card.innerHTML = `
      <div class="name">${icon} ${escapeHtml(ex.name)}</div>
      <div class="meta">
        <span class="badge ${ex.status}">${statusLabel(ex.status)}</span>
        <button class="del-ex" title="Supprimer">✕</button>
      </div>`;
    card.dataset.id = ex.id;
    card.onclick = async (e) => {
      if (e.target.classList.contains('del-ex')) return;
      if (currentExercise?.id === ex.id) return;
      await flushDirty();
      currentExercise = ex;
      markSelectedExercise();
      loadExerciseIntoEditor(ex);
    };
    card.querySelector('.del-ex').onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${ex.name}" (et son fichier) ?`)) {
        db = await window.studyide.deleteExercise({ id: ex.id, deleteFile: true });
        if (currentExercise?.id === ex.id) { currentExercise = null; loadExerciseIntoEditor(null); }
        renderExerciseList();
      }
    };
    listEl.appendChild(card);
  }
}
function markSelectedExercise() {
  el('exerciseList').querySelectorAll('.exercise-card').forEach((c) => c.classList.toggle('selected', c.dataset.id === currentExercise?.id));
}
// Ouvre un exercice depuis n'importe où (recherche globale…)
async function openExercise(ex) {
  if (currentMode !== 'code') switchMode('code');
  if (currentCourse !== ex.courseCode) await selectCourse(ex.courseCode);
  else await flushDirty();
  currentExercise = ex;
  renderExerciseList();
  loadExerciseIntoEditor(ex);
  document.querySelector(`#exerciseList .exercise-card[data-id="${ex.id}"]`)?.scrollIntoView({ block: 'nearest' });
}
function statusLabel(s) {
  return { todo: 'À faire', 'in-progress': 'En cours', done: 'Terminé' }[s] || s;
}
async function loadExerciseIntoEditor(ex) {
  dirty = false;
  if (!ex) {
    cm.setValue('// Sélectionne ou crée un exercice pour commencer');
    cm.setOption('readOnly', true);
    el('tabInfo').textContent = 'Aucun fichier ouvert';
    el('runBtn').disabled = true;
    el('saveBtn').disabled = true;
    el('statusSelect').disabled = true;
    updateIaContextChip();
    return;
  }
  const res = await window.studyide.readFile(ex.filePath);
  cm.setOption('mode', ex.language === 'java' ? 'text/x-java' : 'python');
  cm.setValue(res.ok ? res.content : `// Impossible de lire le fichier : ${res.error}`);
  cm.setOption('readOnly', false);
  el('tabInfo').textContent = ex.filePath;
  el('runBtn').disabled = false;
  el('saveBtn').disabled = false;
  el('statusSelect').disabled = false;
  el('statusSelect').value = ex.status;
  updateSaveState();
  updateIaContextChip();
}
function updateSaveState() {
  el('saveBtn').textContent = dirty ? '💾 Enregistrer *' : '💾 Enregistrer';
}
async function saveCurrent() {
  if (!currentExercise) return;
  const res = await window.studyide.writeFile({ filePath: currentExercise.filePath, content: cm.getValue() });
  if (res.ok) { dirty = false; updateSaveState(); }
  else { alert('Erreur en enregistrant : ' + res.error); }
}
async function runCurrent() {
  if (!currentExercise) return;
  if (dirty) await saveCurrent();
  const outEl = el('outputContent');
  outEl.classList.remove('error');
  outEl.textContent = '⏳ Exécution en cours...';
  const result = await window.studyide.executeCode({
    filePath: currentExercise.filePath,
    language: currentExercise.language
  });
  if (result.ok) {
    outEl.classList.remove('error');
    outEl.textContent = result.output || '(aucune sortie)';
  } else {
    outEl.classList.add('error');
    outEl.textContent = (result.output ? result.output + '\n' : '') + '--- Erreur ---\n' + (result.error || 'Erreur inconnue.');
  }
}
