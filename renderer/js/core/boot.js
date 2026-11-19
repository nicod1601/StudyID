// Démarrage de l'appli.

async function init() {
  // Les 3 lectures sont indépendantes : on les lance ensemble
  const [dbData, appSettings] = await Promise.all([
    window.studyide.getDB(),
    window.studyide.getSettings(),
    loadEditorSettings()
  ]);
  db = dbData;
  renderCourseList();

  cm = CodeMirror(el('editorHost'), {
    value: '// Sélectionne ou crée un exercice pour commencer',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    autoCloseBrackets: true,
    matchBrackets: true,
    mode: 'python',
    readOnly: true
  });
  cm.on('change', () => {
    if (currentExercise && !dirty) { dirty = true; updateSaveState(); }
  });
  cm.on('cursorActivity', updateNoteBtnState);
  applyEditorSettings(cm);

  el('iaBubbleBtn').classList.toggle('hidden', appSettings.showIaBubble === false);
  el('notesBubbleBtn').classList.toggle('hidden', appSettings.showNotesBubble === false);
  el('chatBubbleBtn').classList.toggle('hidden', appSettings.showChatBubble === false);

  // L'interface devient cliquable tout de suite
  bindCourseListEvents();
  bindEvents();
  bindCoursEvents();
  bindProjectEvents();
  bindIaEvents();
  bindIaBubbleEvents();
  bindNotesEvents();
  bindButEvents();
  bindAppSettingsEvents();
  bindChatBubbleEvents();
  bindEdtEvents();
  bindEdtRemindersEvents();
  bindEditorSettingsEvents();
  bindFullscreenEvents();

  // Détection Python/Java : lance 3 processus, donc jamais en travers du démarrage
  window.studyide.checkEnv().then((env) => {
    el('dotPython').classList.toggle('ok', env.python);
    el('dotJava').classList.toggle('ok', env.java && env.javac);
  });

  bindGlobalShortcuts();
  restoreLastState();

  await loadEdtReminderSettings();
  startEdtReminderLoop();
}
init();
