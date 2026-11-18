// Mode Code : liaisons des boutons et de l'éditeur.

function bindEvents() {
  el('saveBtn').onclick = saveCurrent;
  el('runBtn').onclick = runCurrent;
  el('clearOutputBtn').onclick = () => { el('outputContent').textContent = ''; el('outputContent').classList.remove('error'); };

  el('statusSelect').onchange = async (e) => {
    if (!currentExercise) return;
    db = await window.studyide.updateExerciseStatus({ id: currentExercise.id, status: e.target.value });
    currentExercise = db.exercises[currentExercise.id];
    renderExerciseList();
  };

  el('openWorkspaceBtn').onclick = async () => {
    const dir = await window.studyide.getWorkspaceDir();
    window.studyide.openExternal(dir);
  };

  // Modale nouvel exercice
  let chosenLang = 'python';
  el('newExerciseBtn').onclick = () => {
    if (!currentCourse) { alert('Choisis d’abord une matière à gauche.'); return; }
    el('newExName').value = '';
    chosenLang = 'python';
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === 'python'));
    el('modalOverlay').classList.add('open');
    el('newExName').focus();
  };
  el('cancelNewExBtn').onclick = () => el('modalOverlay').classList.remove('open');
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.onclick = () => {
      chosenLang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
    };
  });
  el('confirmNewExBtn').onclick = async () => {
    const name = el('newExName').value.trim();
    if (!name) { alert('Donne un nom à l’exercice.'); return; }
    const ex = await window.studyide.createExercise({ courseCode: currentCourse, name, language: chosenLang });
    db = await window.studyide.getDB();
    currentExercise = ex;
    el('modalOverlay').classList.remove('open');
    renderExerciseList();
    loadExerciseIntoEditor(ex);
  };
  el('newExName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('confirmNewExBtn').click();
  });

  // Ctrl+S pour sauvegarder
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrent();
    }
  });
}
