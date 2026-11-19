// Mode Cours : liaisons des boutons et du visionneur.

function bindCoursEvents() {
  el('modeCodeBtn').onclick = () => switchMode('code');
  el('modeCoursBtn').onclick = () => switchMode('cours');
  el('modeProjetBtn').onclick = () => switchMode('projet');
  el('modeVirtBtn').onclick = () => switchMode('virt');
  el('modeEdtBtn').onclick = () => switchMode('edt');
  el('modeWebBtn').onclick = () => switchMode('web');

  el('importPdfBtn').onclick = async () => {
    if (!currentCourse) { alert('Choisis d’abord une matière à gauche.'); return; }
    const doc = await window.studyide.importPdfDialog(currentCourse);
    if (doc) { window.SearchBar?.invalidate(); renderDocList(); openDocument(doc); }
  };

  el('zoomInBtn').onclick = () => { pdfScale = Math.min(pdfScale + 0.15, 2.5); el('zoomLabel').textContent = Math.round(pdfScale / 1.1 * 100) + '%'; relayoutPdf(); };
  el('zoomOutBtn').onclick = () => { pdfScale = Math.max(pdfScale - 0.15, 0.5); el('zoomLabel').textContent = Math.round(pdfScale / 1.1 * 100) + '%'; relayoutPdf(); };

  el('closePdfExModalBtn').onclick = () => {
    el('pdfExModalOverlay').classList.remove('open');
    activePdfExId = null;
    updateIaContextChip();
  };

  el('pdfExStatusSelect').onchange = async (e) => {
    if (!activePdfExId) return;
    await window.studyide.updatePdfExerciseStatus({ id: activePdfExId, status: e.target.value });
    currentPdfExercises = await window.studyide.listPdfExercises(currentDoc.id);
    renderPdfExerciseList();
  };

  el('saveNotesBtn').onclick = async () => {
    if (!activePdfExId) return;
    await window.studyide.updatePdfExerciseNotes({ id: activePdfExId, userNotes: el('pdfExUserNotes').value });
    currentPdfExercises = await window.studyide.listPdfExercises(currentDoc.id);
    el('pdfExModalOverlay').classList.remove('open');
    renderPdfExerciseList();
  };
}
