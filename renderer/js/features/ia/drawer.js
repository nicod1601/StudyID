// Bulle IA flottante, tiroir et contexte actif.

// =====================================================================
// Bulle IA flottante + tiroir + contexte actif (fichier/exercice ouvert)
// =====================================================================

let iaDrawerOpen = false;
let iaDrawerInitialized = false;
function getActiveContext() {
  // Priorité : exercice PDF précis ouvert > document PDF ouvert > exercice de code ouvert
  if (activePdfExId) {
    const ex = currentPdfExercises.find((e) => e.id === activePdfExId);
    if (ex) {
      const parts = [`Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''} (${currentDoc?.fileName || ''})`];
      if (ex.statement) parts.push('Énoncé : ' + ex.statement.slice(0, 1500));
      if (ex.solution) parts.push('Solution connue : ' + ex.solution.slice(0, 1500));
      return { label: `📄 Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''}`, text: parts.join('\n') };
    }
  }
  if (currentMode === 'cours' && currentDoc) {
    return { label: `📄 Document ouvert : ${currentDoc.fileName}`, text: `Document actuellement consulté : ${currentDoc.fileName}` };
  }
  if (currentExercise && cm) {
    const code = cm.getValue();
    return {
      label: `💻 Code ouvert : ${currentExercise.name} (${currentExercise.language})`,
      text: `Fichier actuellement ouvert dans l'éditeur (${currentExercise.language}), nommé ${currentExercise.name} :\n\`\`\`${currentExercise.language}\n${code.slice(0, 3000)}\n\`\`\``
    };
  }
  return null;
}
function updateIaContextChip() {
  const chip = el('iaContextChip');
  if (!chip) return;
  const ctx = getActiveContext();
  if (ctx) {
    chip.textContent = ctx.label;
    chip.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
  }
}
function openIaDrawer() {
  iaDrawerOpen = true;
  el('iaDrawer').classList.add('open');
  el('iaDrawerOverlay').classList.add('open');
  el('iaBubbleBtn').classList.add('active');
  updateIaContextChip();
  if (!iaDrawerInitialized) {
    iaDrawerInitialized = true;
    initIaMode();
  } else {
    updateIaReadiness();
  }
}
function closeIaDrawer() {
  iaDrawerOpen = false;
  el('iaDrawer').classList.remove('open');
  el('iaDrawerOverlay').classList.remove('open');
  el('iaBubbleBtn').classList.remove('active');
}
function insertCodeIntoEditor(code) {
  if (!currentExercise || !cm) {
    alert("Ouvre d'abord un exercice de code (mode Code) pour pouvoir y insérer ce code.");
    return;
  }
  if (cm.getValue().trim() && !confirm('Remplacer le contenu actuel de l\'éditeur par ce code ?')) {
    return;
  }
  cm.setValue(code);
  dirty = true;
  updateSaveState();
}
function bindIaBubbleEvents() {
  el('iaBubbleBtn').onclick = () => { iaDrawerOpen ? closeIaDrawer() : openIaDrawer(); };
  el('iaCloseDrawerBtn').onclick = closeIaDrawer;
  el('iaDrawerOverlay').onclick = closeIaDrawer;
  el('iaToggleOptionsBtn').onclick = () => el('iaOptionsPanel').classList.toggle('hidden');
}
