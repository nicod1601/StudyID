'use strict';
// IPC : lecture/écriture de fichiers, ouverture externe, import de fichiers.

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { getMainWindow } = require('../core/window');
const { WORKSPACE_DIR } = require('../core/paths');

function register() {

  // ---------- IPC : fichiers ----------

  ipcMain.handle('file:read', (evt, filePath) => {
    try {
      return { ok: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('file:write', (evt, { filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('file:openExternal', (evt, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('app:openUrl', (evt, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('file:importDialog', async (evt, courseCode) => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Code', extensions: ['py', 'java', 'txt'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    const src = res.filePaths[0];
    const dest = path.join(WORKSPACE_DIR, courseCode, path.basename(src));
    fs.copyFileSync(src, dest);
    return dest;
  });
}

module.exports = { register };
