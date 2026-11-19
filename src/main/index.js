'use strict';
// Point d'entrée du processus principal : enregistre les canaux IPC et gère le cycle de vie de l'appli.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { createTray, createWindow, getMainWindow, setQuitting } = require('./core/window');
const { ensureWorkspace, flushDB } = require('./core/db');
const { flushSettings, readSettings } = require('./core/settings');
const { WORKSPACE_DIR } = require('./core/paths');

app.whenReady().then(() => {
  // La fenêtre se charge dans son propre processus pendant que le processus
  // principal prépare le workspace : les deux étapes se chevauchent.
  createWindow();
  ensureWorkspace();
  setImmediate(createTray);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { getMainWindow().show(); getMainWindow().focus(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    const s = readSettings();
    if (s.minimizeToTray === false) app.quit();
  }
});

// Canaux IPC : un module par domaine (chacun expose register())
[
  require('./services/local-ai'),
  require('./ipc/data'),
  require('./ipc/files'),
  require('./ipc/edt'),
  require('./ipc/project'),
  require('./ipc/run'),
  require('./core/settings'),
  require('./ipc/notes'),
  require('./ipc/grades'),
  require('./ipc/system'),
  require('./ipc/docs'),
  require('./ipc/virt'),
  require('./ipc/opl'),
].forEach((m) => m.register());

// ---------- IPC : Terminal intégré + Développement Web ----------
// Tout est dans web-dev.js : terminaux (node-pty, avec repli sur pipes),
// détection de framework, serveurs de dev, live reload, dépendances, templates.

const webDev = require('./web-dev')({
  ipcMain,
  dialog,
  getMainWindow,
  workspaceDir: WORKSPACE_DIR
});

app.on('before-quit', () => {
  setQuitting(true);
  flushDB();
  flushSettings();
  webDev.killAll();
});
