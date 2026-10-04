/**
 * Réglages des éditeurs de code (mode Code + mode Projet) :
 * taille d'indentation, tabulations réelles vs espaces, affichage des
 * caractères invisibles. Purement visuel : ne modifie jamais les fichiers.
 */

import { el } from '../core/dom.js';
import { state } from '../core/state.js';
import { getSettings, patchSettings } from '../core/settings-client.js';

let editorSettings = { editorTabSize: 4, editorIndentWithTabs: false, editorShowWhitespace: false };

// Overlay CodeMirror : un token par caractère espace/tab, pour afficher
// exactement un symbole par caractère réel.
const whitespaceOverlay =
{
  token: function (stream)
  {
    if (stream.peek() === ' ') { stream.next(); return 'ws-space'; }
    if (stream.peek() === '\t') { stream.next(); return 'ws-tab'; }
    stream.next();
    return null;
  }
};

export function applyEditorSettings(cmInstance)
{
  if (!cmInstance) return;
  cmInstance.setOption('tabSize', editorSettings.editorTabSize);
  cmInstance.setOption('indentUnit', editorSettings.editorTabSize);
  cmInstance.setOption('indentWithTabs', editorSettings.editorIndentWithTabs);

  if (editorSettings.editorShowWhitespace && !cmInstance._wsOverlayOn)
  {
    cmInstance.addOverlay(whitespaceOverlay);
    cmInstance._wsOverlayOn = true;
  }
  else if (!editorSettings.editorShowWhitespace && cmInstance._wsOverlayOn)
  {
    cmInstance.removeOverlay(whitespaceOverlay);
    cmInstance._wsOverlayOn = false;
  }
}

function applyEditorSettingsToAll()
{
  applyEditorSettings(state.cm);
  applyEditorSettings(state.pcm);
}

export async function loadEditorSettings()
{
  const s = await getSettings();
  editorSettings =
  {
    editorTabSize: Number(s.editorTabSize) || 4,
    editorIndentWithTabs: !!s.editorIndentWithTabs,
    editorShowWhitespace: !!s.editorShowWhitespace
  };
}

function openModal()
{
  el('editorTabSizeSelect').value = String(editorSettings.editorTabSize);
  el('editorIndentWithTabsCheckbox').checked = editorSettings.editorIndentWithTabs;
  el('editorShowWhitespaceCheckbox').checked = editorSettings.editorShowWhitespace;
  el('editorSettingsOverlay').classList.add('open');
}

function closeModal()
{
  el('editorSettingsOverlay').classList.remove('open');
}

export function bindEditorSettingsEvents()
{
  el('editorSettingsBtn').onclick = openModal;
  el('editorSettingsCloseBtn').onclick = closeModal;
  el('editorSettingsOverlay').addEventListener('click', (e) =>
  {
    if (e.target.id === 'editorSettingsOverlay') closeModal();
  });

  el('editorSettingsSaveBtn').onclick = async () =>
  {
    editorSettings =
    {
      editorTabSize: Number(el('editorTabSizeSelect').value) || 4,
      editorIndentWithTabs: el('editorIndentWithTabsCheckbox').checked,
      editorShowWhitespace: el('editorShowWhitespaceCheckbox').checked
    };
    await patchSettings(editorSettings);
    applyEditorSettingsToAll();
    closeModal();
  };
}
