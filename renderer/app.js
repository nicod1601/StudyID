/**
 * Point d'entrée du renderer (chargé en module ES).
 *
 * Rôle unique : initialiser l'état, créer l'éditeur de code, puis câbler les
 * événements de chaque fonctionnalité. La logique vit dans les modules de
 * /core (briques partagées) et /features (une fonctionnalité par fichier).
 */

import { el } from './core/dom.js';
import { state } from './core/state.js';
import { getSettings } from './core/settings-client.js';

import { renderCourseList } from './features/courses.js';
import { initCodeEditor, bindEditorEvents } from './features/editor.js';
import { loadEditorSettings, applyEditorSettings, bindEditorSettingsEvents } from './features/editor-settings.js';
import { bindCoursEvents } from './features/pdf.js';
import { bindModeEvents } from './features/nav.js';
import { bindProjectEvents } from './features/project.js';
import { bindIaEvents, bindIaBubbleEvents } from './features/ia.js';
import { bindNotesEvents } from './features/notes.js';
import { bindButEvents } from './features/but.js';
import { bindAppSettingsEvents } from './features/app-settings.js';
import { bindChatBubbleEvents } from './features/chat.js';
import { bindEdtEvents, bindEdtRemindersEvents, initEdtReminders } from './features/edt.js';
import { bindDiscordEvents } from './features/discord.js';
import { bindFullscreenEvents } from './features/fullscreen.js';
import { bindGlobalSearch } from './features/search.js';
import { bindDrawerResize } from './features/drawer-resize.js';

// Affiche ou masque les bulles flottantes selon les réglages.
async function applyBubbleVisibility()
{
  const s = await getSettings();
  el('iaBubbleBtn').classList.toggle('hidden', s.showIaBubble === false);
  el('notesBubbleBtn').classList.toggle('hidden', s.showNotesBubble === false);
  el('chatBubbleBtn').classList.toggle('hidden', s.showChatBubble === false);
}

// Indique si Python / Java sont disponibles sur la machine.
async function showEnvStatus()
{
  const env = await window.studyide.checkEnv();
  el('dotPython').classList.toggle('ok', env.python);
  el('dotJava').classList.toggle('ok', env.java && env.javac);
}

function bindAllEvents()
{
  bindEditorEvents();
  bindCoursEvents();
  bindModeEvents();
  bindProjectEvents();
  bindIaEvents();
  bindIaBubbleEvents();
  bindNotesEvents();
  bindButEvents();
  bindAppSettingsEvents();
  bindChatBubbleEvents();
  bindEdtEvents();
  bindDiscordEvents();
  bindEdtRemindersEvents();
  bindEditorSettingsEvents();
  bindFullscreenEvents();
  bindGlobalSearch();
  bindDrawerResize();
}

async function init()
{
  state.db = await window.studyide.getDB();
  renderCourseList();

  initCodeEditor();
  await loadEditorSettings();
  applyEditorSettings(state.cm);

  await applyBubbleVisibility();
  await showEnvStatus();

  bindAllEvents();
  await initEdtReminders();
}

init();
