// Mode Code : liste des matières et sélection.

function renderCourseList() {
  const list = el('courseList');
  list.innerHTML = '';
  for (const course of db.courses) {
    const div = document.createElement('div');
    div.className = 'course-item' + (currentCourse === course.code ? ' active' : '');
    div.dataset.code = course.code;
    div.innerHTML = `<span class="code">${escapeHtml(course.code)}</span>${escapeHtml(course.name)}`;
    list.appendChild(div);
  }
}
// Un seul écouteur pour toute la liste (au lieu d'un par matière)
function bindCourseListEvents() {
  el('courseList').addEventListener('click', (e) => {
    const item = e.target.closest('.course-item');
    if (item) selectCourse(item.dataset.code);
  });
}
// Change juste la classe "active" : pas de reconstruction de la liste à chaque clic
function markActiveCourse() {
  el('courseList').querySelectorAll('.course-item').forEach((n) => n.classList.toggle('active', n.dataset.code === currentCourse));
}
// Enregistre en silence l'exercice modifié avant d'en changer (évite de perdre du code)
async function flushDirty() {
  if (dirty && currentExercise && cm) await saveCurrent();
}
function rememberState() {
  try { localStorage.setItem('studyide.last', JSON.stringify({ course: currentCourse, mode: currentMode })); } catch (e) { /* ignoré */ }
}
async function selectCourse(code) {
  await flushDirty();
  currentCourse = code;
  currentExercise = null;
  currentDoc = null;
  markActiveCourse();
  rememberState();
  const course = db.courses.find((c) => c.code === code);
  el('courseTitle').textContent = `${course.code} — ${course.name}`;
  el('coursTitle').textContent = `${course.code} — ${course.name}`;
  renderExerciseList();
  loadExerciseIntoEditor(null);
  if (currentMode === 'cours') renderDocList();
  updateIaCourseIndicator();
}
