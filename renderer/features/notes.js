/**
 * Mes notes : capturer une sélection de texte depuis un éditeur (Code ou Projet)
 * et la retrouver plus tard. Tout est stocké dans ~/StudyIDE/data-note.txt.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { getActiveTab, getProjectRoot } from './project.js';

let notesDrawerOpen = false;
let allNotes = [];

export function openNotesDrawer()
{
  notesDrawerOpen = true;
  el('notesDrawer').classList.add('open');
  el('notesDrawerOverlay').classList.add('open');
  el('notesBubbleBtn').classList.add('active');
  refreshNotesList();
}

export function closeNotesDrawer()
{
  notesDrawerOpen = false;
  el('notesDrawer').classList.remove('open');
  el('notesDrawerOverlay').classList.remove('open');
  el('notesBubbleBtn').classList.remove('active');
}

async function refreshNotesList()
{
  const res = await window.studyide.listNotes();
  allNotes = res.ok ? res.notes : [];
  renderNotesList(el('notesSearchInput')?.value || '');
}

function renderNotesList(filter)
{
  const listEl = el('notesList');
  const q = (filter || '').trim().toLowerCase();
  const notes = q
    ? allNotes.filter((n) => n.text.toLowerCase().includes(q) || n.header.toLowerCase().includes(q))
    : allNotes;

  if (!notes.length)
  {
    listEl.innerHTML = `<div class="empty-hint">${allNotes.length ? 'Aucune note ne correspond à ta recherche.' : 'Aucune note pour l\'instant. Sélectionne du texte dans un éditeur puis clique sur « 📌 Noter ».'}</div>`;
    return;
  }

  listEl.innerHTML = '';
  for (const note of notes)
  {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <div class="note-header">
        <span class="note-meta" title="${escapeHtml(note.header)}">${escapeHtml(note.header)}</span>
        <span class="note-actions">
          <button class="note-copy" title="Copier">📋</button>
          <button class="note-del" title="Supprimer">🗑</button>
        </span>
      </div>
      <div class="note-text">${escapeHtml(note.text)}</div>`;

    card.querySelector('.note-copy').onclick = async (e) =>
    {
      await navigator.clipboard.writeText(note.text);
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = original; }, 1000);
    };

    card.querySelector('.note-del').onclick = async () =>
    {
      if (!confirm('Supprimer cette note ?')) return;
      await window.studyide.deleteNote(note.id);
      refreshNotesList();
    };

    listEl.appendChild(card);
  }
}

async function saveSelectionAsNote(text, courseCode, source, triggerBtn)
{
  if (!text || !text.trim()) return;
  const res = await window.studyide.appendNote({ text, courseCode, source });
  if (!res.ok) { alert(res.error || 'Erreur lors de l\'enregistrement de la note.'); return; }

  if (triggerBtn)
  {
    const original = triggerBtn.textContent;
    triggerBtn.textContent = '✅ Noté !';
    setTimeout(() => { triggerBtn.textContent = original; }, 1200);
  }
  if (notesDrawerOpen) refreshNotesList();
}

// Active/désactive les boutons « Noter » selon qu'il y a une sélection ou non.
export function updateNoteBtnState()
{
  const btn = el('noteSelectionBtn');
  if (!btn || !state.cm) return;
  btn.disabled = !state.cm.somethingSelected();
}

export function updateProjectNoteBtnState()
{
  const btn = el('projectNoteSelectionBtn');
  if (!btn || !state.pcm) return;
  btn.disabled = !state.pcm.somethingSelected();
}

export function bindNotesEvents()
{
  el('notesBubbleBtn').onclick = () => { notesDrawerOpen ? closeNotesDrawer() : openNotesDrawer(); };
  el('viewNotesQuickBtn').onclick = openNotesDrawer;
  el('notesCloseDrawerBtn').onclick = closeNotesDrawer;
  el('notesDrawerOverlay').onclick = closeNotesDrawer;
  el('openNotesFileBtn').onclick = () => window.studyide.openNotesFile();
  el('notesSearchInput').oninput = (e) => renderNotesList(e.target.value);

  el('noteSelectionBtn').onclick = () =>
  {
    if (!state.cm || !state.cm.somethingSelected()) return;
    const text = state.cm.getSelection();
    const source = state.currentExercise
      ? `${state.currentExercise.name}.${state.currentExercise.language === 'java' ? 'java' : 'py'}`
      : 'éditeur de code';
    saveSelectionAsNote(text, state.currentCourse, source, el('noteSelectionBtn'));
  };

  el('projectNoteSelectionBtn').onclick = () =>
  {
    if (!state.pcm || !state.pcm.somethingSelected()) return;
    const text = state.pcm.getSelection();
    const tab = getActiveTab();
    const root = getProjectRoot();
    const source = tab ? tab.name : (root ? root.name : 'projet');
    saveSelectionAsNote(text, root ? root.name : null, source, el('projectNoteSelectionBtn'));
  };
}
