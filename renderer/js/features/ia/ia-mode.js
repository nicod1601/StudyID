// Mode IA : état et initialisation.

// =====================================================================
// MODE IA : recherche locale dans les documents + mini IA locale (hors ligne)
// =====================================================================

let iaSettings = null;
let iaIndexed = false;
let iaCorpus = []; // { type, courseCode, source, page, exerciseNumber?, text }

function updateIaCourseIndicator() {
  const label = el('iaCurrentCourse');
  if (!label) return;
  if (currentCourse) {
    const course = db.courses.find((c) => c.code === currentCourse);
    label.textContent = `📘 Matière sélectionnée : ${course.code} — ${course.name}`;
  } else {
    label.textContent = '👈 Choisis une matière dans la liste à gauche';
  }
}
async function initIaMode() {
  el('iaScopeSelect').value = currentCourse ? 'current' : 'all';
  updateIaCourseIndicator();
  iaSettings = await window.studyide.getSettings();
  el('iaEngineSelect').value = iaSettings.iaEngine || 'auto';
  await refreshLocalAiStatus();
  await updateIaReadiness();
  await buildSearchIndex();
}
