const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studyide', {
  getDB: () => ipcRenderer.invoke('db:get'),
  createExercise: (payload) => ipcRenderer.invoke('db:createExercise', payload),
  updateExerciseStatus: (payload) => ipcRenderer.invoke('db:updateExerciseStatus', payload),
  deleteExercise: (payload) => ipcRenderer.invoke('db:deleteExercise', payload),

  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (payload) => ipcRenderer.invoke('file:write', payload),
  openExternal: (filePath) => ipcRenderer.invoke('file:openExternal', filePath),
  importDialog: (courseCode) => ipcRenderer.invoke('file:importDialog', courseCode),

  checkEnv: () => ipcRenderer.invoke('run:checkEnv'),
  executeCode: (payload) => ipcRenderer.invoke('run:execute', payload),

  getWorkspaceDir: () => ipcRenderer.invoke('app:getWorkspaceDir'),
  focusWindow: () => ipcRenderer.invoke('app:focusWindow'),

  listDocuments: (courseCode) => ipcRenderer.invoke('docs:listByCourse', courseCode),
  readPdf: (filePath) => ipcRenderer.invoke('docs:readPdf', filePath),
  importPdfDialog: (courseCode) => ipcRenderer.invoke('docs:importDialog', courseCode),
  deleteDocument: (payload) => ipcRenderer.invoke('docs:deleteDocument', payload),

  saveDetectedExercises: (payload) => ipcRenderer.invoke('pdfEx:saveDetected', payload),
  listPdfExercises: (documentId) => ipcRenderer.invoke('pdfEx:listByDocument', documentId),
  updatePdfExerciseNotes: (payload) => ipcRenderer.invoke('pdfEx:updateNotes', payload),
  updatePdfExerciseStatus: (payload) => ipcRenderer.invoke('pdfEx:updateStatus', payload),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (payload) => ipcRenderer.invoke('settings:set', payload),

  appendNote: (payload) => ipcRenderer.invoke('notes:append', payload),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  deleteNote: (id) => ipcRenderer.invoke('notes:deleteAt', { id }),
  openNotesFile: () => ipcRenderer.invoke('notes:openFile'),

  getButGrades: () => ipcRenderer.invoke('but:getGrades'),
  setButGrades: (payload) => ipcRenderer.invoke('but:setGrades', payload),
  resetButGrades: () => ipcRenderer.invoke('but:resetGrades'),

  exportData: () => ipcRenderer.invoke('backup:export'),
  createDesktopShortcut: () => ipcRenderer.invoke('app:createDesktopShortcut'),

  savePageText: (payload) => ipcRenderer.invoke('docs:savePageText', payload),
  getSearchCorpus: () => ipcRenderer.invoke('docs:getSearchCorpus'),

  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),

  importEdtIcs: () => ipcRenderer.invoke('edt:importIcsDialog'),
  getEdtCache: () => ipcRenderer.invoke('edt:getCache'),

  getLocalAIStatus: () => ipcRenderer.invoke('localAI:status'),
  listLocalAIModels: () => ipcRenderer.invoke('localAI:listModels'),
  downloadLocalAI: (modelId) => ipcRenderer.invoke('localAI:download', { modelId }),
  deleteLocalAI: (modelId) => ipcRenderer.invoke('localAI:delete', { modelId }),
  askLocalAI: (payload) => ipcRenderer.invoke('localAI:ask', payload),
  onLocalAIProgress: (callback) => {
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

  // ---- Terminal intégré (node-pty) ----
  startTerminal: (opts) => ipcRenderer.invoke('terminal:start', typeof opts === 'string' ? { cwd: opts } : (opts || {})),
  writeTerminal: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  sendTerminalInput: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  terminalInfo: () => ipcRenderer.invoke('terminal:info'),
  onTerminalData: (callback) => {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback) => {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },

  // ---- Développement Web ----
  webDetect: (dir) => ipcRenderer.invoke('web:detect', dir),
  webStartServer: (opts) => ipcRenderer.invoke('web:startServer', opts),
  webStartStatic: (opts) => ipcRenderer.invoke('web:startStatic', opts),
  webStopServer: (id) => ipcRenderer.invoke('web:stopServer', { id }),
  webRestartServer: (id) => ipcRenderer.invoke('web:restartServer', { id }),
  webRemoveServer: (id) => ipcRenderer.invoke('web:removeServer', { id }),
  webListServers: () => ipcRenderer.invoke('web:listServers'),
  webGetServerLogs: (id) => ipcRenderer.invoke('web:getServerLogs', { id }),
  webNpm: (payload) => ipcRenderer.invoke('web:npm', payload),
  webTemplates: () => ipcRenderer.invoke('web:templates'),
  webScaffold: (payload) => ipcRenderer.invoke('web:scaffold', payload),
  webPickFolder: () => ipcRenderer.invoke('web:pickFolder'),
  onWebServerUpdate: (cb) => { const l = (e, d) => cb(d); ipcRenderer.on('web:server-update', l); return () => ipcRenderer.removeListener('web:server-update', l); },
  onWebServerLog: (cb) => { const l = (e, d) => cb(d); ipcRenderer.on('web:server-log', l); return () => ipcRenderer.removeListener('web:server-log', l); },
  onWebServerRemoved: (cb) => { const l = (e, d) => cb(d); ipcRenderer.on('web:server-removed', l); return () => ipcRenderer.removeListener('web:server-removed', l); },
  onWebTaskLog: (cb) => { const l = (e, d) => cb(d); ipcRenderer.on('web:task-log', l); return () => ipcRenderer.removeListener('web:task-log', l); }
});
