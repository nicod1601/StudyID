// Réglages de l'éditeur : tabulations, indentation, caractères invisibles.

// =====================================================================
// RÉGLAGES DE L'ÉDITEUR — indentation, tabs/espaces, caractères invisibles
// =====================================================================

let editorSettings = { editorTabSize: 4, editorIndentWithTabs: false, editorShowWhitespace: false };
// Overlay CodeMirror : un token par caractère espace/tabulation individuel
// (pas par bloc), pour afficher exactement un symbole par caractère réel.
const whitespaceOverlay = {
  token: function (stream) {
    if (stream.peek() === ' ') { stream.next(); return 'ws-space'; }
    if (stream.peek() === '\t') { stream.next(); return 'ws-tab'; }
    stream.next();
    return null;
  }
};
function applyEditorSettings(cmInstance) {
  if (!cmInstance) return;
  cmInstance.setOption('tabSize', editorSettings.editorTabSize);
  cmInstance.setOption('indentUnit', editorSettings.editorTabSize);
  cmInstance.setOption('indentWithTabs', editorSettings.editorIndentWithTabs);

  if (editorSettings.editorShowWhitespace) {
    if (!cmInstance._wsOverlayOn) {
      cmInstance.addOverlay(whitespaceOverlay);
      cmInstance._wsOverlayOn = true;
    }
  } else if (cmInstance._wsOverlayOn) {
    cmInstance.removeOverlay(whitespaceOverlay);
    cmInstance._wsOverlayOn = false;
  }
}
function applyEditorSettingsToAll() {
  applyEditorSettings(cm);
  applyEditorSettings(pcm);
}
async function loadEditorSettings() {
  const s = await window.studyide.getSettings();
  editorSettings = {
    editorTabSize: Number(s.editorTabSize) || 4,
    editorIndentWithTabs: !!s.editorIndentWithTabs,
    editorShowWhitespace: !!s.editorShowWhitespace
  };
}
function openEditorSettingsModal() {
  el('editorTabSizeSelect').value = String(editorSettings.editorTabSize);
  el('editorIndentWithTabsCheckbox').checked = editorSettings.editorIndentWithTabs;
  el('editorShowWhitespaceCheckbox').checked = editorSettings.editorShowWhitespace;
  el('editorSettingsOverlay').classList.add('open');
}
function closeEditorSettingsModal() {
  el('editorSettingsOverlay').classList.remove('open');
}
function bindEditorSettingsEvents() {
  el('editorSettingsBtn').onclick = openEditorSettingsModal;
  el('editorSettingsCloseBtn').onclick = closeEditorSettingsModal;
  el('editorSettingsOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'editorSettingsOverlay') closeEditorSettingsModal();
  });

  el('editorSettingsSaveBtn').onclick = async () => {
    editorSettings = {
      editorTabSize: Number(el('editorTabSizeSelect').value) || 4,
      editorIndentWithTabs: el('editorIndentWithTabsCheckbox').checked,
      editorShowWhitespace: el('editorShowWhitespaceCheckbox').checked
    };
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, ...editorSettings });
    applyEditorSettingsToAll();
    closeEditorSettingsModal();
  };
}
