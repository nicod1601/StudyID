/**
 * Pont sécurisé entre le renderer (page web) et le process principal.
 * Avec contextIsolation, c'est le SEUL point de contact : le renderer n'a accès
 * qu'à `window.studyide`, et à rien d'autre de Node/Electron.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studyide',
{
  // Plateforme (remplace navigator.platform, déprécié).
  platform: process.platform,

  // ---- Base de données / exercices de code ----
  getDB: () => ipcRenderer.invoke('db:get'),
  createExercise: (payload) => ipcRenderer.invoke('db:createExercise', payload),
  updateExerciseStatus: (payload) => ipcRenderer.invoke('db:updateExerciseStatus', payload),
  deleteExercise: (payload) => ipcRenderer.invoke('db:deleteExercise', payload),
  renameExercise: (payload) => ipcRenderer.invoke('db:renameExercise', payload),

  // ---- Fichiers ----
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (payload) => ipcRenderer.invoke('file:write', payload),
  openExternal: (filePath) => ipcRenderer.invoke('file:openExternal', filePath),
  importDialog: (courseCode) => ipcRenderer.invoke('file:importDialog', courseCode),
  listWorkspaceFiles: () => ipcRenderer.invoke('workspace:listFiles'),

  // ---- Exécution de code ----
  checkEnv: () => ipcRenderer.invoke('run:checkEnv'),
  executeCode: (payload) => ipcRenderer.invoke('run:execute', payload),

  // ---- Application ----
  getWorkspaceDir: () => ipcRenderer.invoke('app:getWorkspaceDir'),
  focusWindow: () => ipcRenderer.invoke('app:focusWindow'),
  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),
  exportData: () => ipcRenderer.invoke('backup:export'),
  createDesktopShortcut: () => ipcRenderer.invoke('app:createDesktopShortcut'),

  // ---- Documents PDF ----
  listDocuments: (courseCode) => ipcRenderer.invoke('docs:listByCourse', courseCode),
  readPdfBase64: (filePath) => ipcRenderer.invoke('docs:readAsBase64', filePath),
  importPdfDialog: (courseCode) => ipcRenderer.invoke('docs:importDialog', courseCode),
  deleteDocument: (payload) => ipcRenderer.invoke('docs:deleteDocument', payload),
  savePageText: (payload) => ipcRenderer.invoke('docs:savePageText', payload),

  // ---- Exercices détectés dans les PDF ----
  saveDetectedExercises: (payload) => ipcRenderer.invoke('pdfEx:saveDetected', payload),
  listPdfExercises: (documentId) => ipcRenderer.invoke('pdfEx:listByDocument', documentId),
  updatePdfExerciseNotes: (payload) => ipcRenderer.invoke('pdfEx:updateNotes', payload),
  updatePdfExerciseStatus: (payload) => ipcRenderer.invoke('pdfEx:updateStatus', payload),

  // ---- Réglages ----
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (payload) => ipcRenderer.invoke('settings:set', payload),
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),

  // ---- Mes notes ----
  appendNote: (payload) => ipcRenderer.invoke('notes:append', payload),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  deleteNote: (id) => ipcRenderer.invoke('notes:deleteAt', { id }),
  openNotesFile: () => ipcRenderer.invoke('notes:openFile'),

  // ---- Notes BUT ----
  getButGrades: () => ipcRenderer.invoke('but:getGrades'),
  setButGrades: (payload) => ipcRenderer.invoke('but:setGrades', payload),
  resetButGrades: () => ipcRenderer.invoke('but:resetGrades'),

  // ---- Emploi du temps ----
  importEdtIcs: () => ipcRenderer.invoke('edt:importIcsDialog'),
  getEdtCache: () => ipcRenderer.invoke('edt:getCache'),

  // ---- Mini IA locale ----
  getLocalAIStatus: () => ipcRenderer.invoke('localAI:status'),
  listLocalAIModels: () => ipcRenderer.invoke('localAI:listModels'),
  downloadLocalAI: (modelId) => ipcRenderer.invoke('localAI:download', { modelId }),
  deleteLocalAI: (modelId) => ipcRenderer.invoke('localAI:delete', { modelId }),
  askLocalAI: (payload) => ipcRenderer.invoke('localAI:ask', payload),
  onLocalAIProgress: (callback) =>
  {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('localAI:progress', listener);
    return () => ipcRenderer.removeListener('localAI:progress', listener);
  },

  // ---- Mode Projet ----
  openProjectDialog: () => ipcRenderer.invoke('project:openDialog'),
  reopenLastProject: () => ipcRenderer.invoke('project:reopenLast'),
  readProjectDir: (dirPath) => ipcRenderer.invoke('project:readDir', dirPath),
  newProjectFile: (payload) => ipcRenderer.invoke('project:newFile', payload),
  newProjectFolder: (payload) => ipcRenderer.invoke('project:newFolder', payload),
  renameProjectEntry: (payload) => ipcRenderer.invoke('project:rename', payload),
  deleteProjectEntry: (targetPath) => ipcRenderer.invoke('project:delete', targetPath),

  // ---- Terminal intégré ----
  startTerminal: (cwd) => ipcRenderer.invoke('terminal:start', { cwd }),
  writeTerminal: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  onTerminalData: (callback) =>
  {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback) =>
  {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
});
