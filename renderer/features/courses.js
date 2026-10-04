/**
 * Liste des matières (sidebar) et sélection d'une matière, qui met à jour tous
 * les modes dépendants (Code, Cours, Assistant IA).
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { renderExerciseList, loadExerciseIntoEditor } from './editor.js';
import { renderDocList } from './pdf.js';
import { updateIaCourseIndicator } from './ia.js';

export function renderCourseList()
{
  const list = el('courseList');
  list.innerHTML = '';
  for (const course of state.db.courses)
  {
    const div = document.createElement('div');
    div.className = 'course-item' + (state.currentCourse === course.code ? ' active' : '');
    div.innerHTML = `<span class="code">${escapeHtml(course.code)}</span>${escapeHtml(course.name)}`;
    div.onclick = () => selectCourse(course.code);
    list.appendChild(div);
  }
}

export function selectCourse(code)
{
  state.currentCourse = code;
  state.currentExercise = null;
  state.currentDoc = null;
  renderCourseList();

  const course = state.db.courses.find((c) => c.code === code);
  el('courseTitle').textContent = `${course.code} — ${course.name}`;
  el('coursTitle').textContent = `${course.code} — ${course.name}`;

  renderExerciseList();
  loadExerciseIntoEditor(null);
  if (state.currentMode === 'cours') renderDocList();
  updateIaCourseIndicator();
}
