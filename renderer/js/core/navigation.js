// Navigation entre les sections, raccourcis clavier globaux, restauration du dernier état.

// Raccourcis : Ctrl+1…7 pour changer de section (Ctrl+K = recherche, voir search.js)
function bindGlobalShortcuts() {
  const modes = ['code', 'cours', 'projet', 'web', 'edt', 'virt', 'simplex'];
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= modes.length) { e.preventDefault(); switchMode(modes[n - 1]); }
  });
}
// Retrouve la dernière matière et la dernière section utilisées
function restoreLastState() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem('studyide.last') || 'null'); } catch (e) { /* ignoré */ }
  if (!last) return;
  if (last.course && db.courses.some((c) => c.code === last.course)) selectCourse(last.course);
  if (last.mode && ['cours', 'projet', 'web', 'edt', 'virt', 'simplex'].includes(last.mode)) switchMode(last.mode);
}
// =====================================================================
// MODE COURS : documents PDF + détection automatique des exercices
// =====================================================================

function switchMode(mode) {
  currentMode = mode;
  el('modeCodeBtn').classList.toggle('active', mode === 'code');
  el('modeCoursBtn').classList.toggle('active', mode === 'cours');
  el('modeProjetBtn').classList.toggle('active', mode === 'projet');
  el('modeEdtBtn').classList.toggle('active', mode === 'edt');
  el('modeVirtBtn').classList.toggle('active', mode === 'virt');
  el('modeSimplexBtn').classList.toggle('active', mode === 'simplex');
  el('modeWebBtn').classList.toggle('active', mode === 'web');
  el('codeContent').classList.toggle('hidden', mode !== 'code');
  el('coursContent').classList.toggle('hidden', mode !== 'cours');
  el('projetContent').classList.toggle('hidden', mode !== 'projet');
  el('edtContent').classList.toggle('hidden', mode !== 'edt');
  el('virtContent').classList.toggle('hidden', mode !== 'virt');
  el('simplexContent').classList.toggle('hidden', mode !== 'simplex');
  el('webContent').classList.toggle('hidden', mode !== 'web');
  if (mode === 'cours' && currentCourse) renderDocList();
  rememberState();
  if (mode === 'projet') initProjectMode();
  if (mode === 'edt') initEdtMode();
  if (mode === 'web') WebDev.onShow();
  if (mode === 'virt') initVirtMode();
  if (mode === 'simplex') initSimplexMode();
  updateIaContextChip();
}
