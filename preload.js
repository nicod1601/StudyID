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

  listDocuments: (courseCode) => ipcRenderer.invoke('docs:listByCourse', courseCode),
  readPdfBase64: (filePath) => ipcRenderer.invoke('docs:readAsBase64', filePath),
  importPdfDialog: (courseCode) => ipcRenderer.invoke('docs:importDialog', courseCode),
  deleteDocument: (payload) => ipcRenderer.invoke('docs:deleteDocument', payload),

  saveDetectedExercises: (payload) => ipcRenderer.invoke('pdfEx:saveDetected', payload),
  listPdfExercises: (documentId) => ipcRenderer.invoke('pdfEx:listByDocument', documentId),
  updatePdfExerciseNotes: (payload) => ipcRenderer.invoke('pdfEx:updateNotes', payload),
  updatePdfExerciseStatus: (payload) => ipcRenderer.invoke('pdfEx:updateStatus', payload),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (payload) => ipcRenderer.invoke('settings:set', payload),

  savePageText: (payload) => ipcRenderer.invoke('docs:savePageText', payload),
  getSearchCorpus: () => ipcRenderer.invoke('docs:getSearchCorpus'),

  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),

  getLocalAIStatus: () => ipcRenderer.invoke('localAI:status'),
  listLocalAIModels: () => ipcRenderer.invoke('localAI:listModels'),
  downloadLocalAI: (modelId) => ipcRenderer.invoke('localAI:download', { modelId }),
  deleteLocalAI: (modelId) => ipcRenderer.invoke('localAI:delete', { modelId }),
  askLocalAI: (payload) => ipcRenderer.invoke('localAI:ask', payload),
  onLocalAIProgress: (callback) => {
    const listener = (evt, data) => callback(data);
    ipcRenderer.on('localAI:progress', listener);
    return () => ipcRenderer.removeListener('localAI:progress', listener);
  }
});
