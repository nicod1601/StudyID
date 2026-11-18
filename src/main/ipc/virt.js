'use strict';
// IPC : section Virtualisation (détection des hyperviseurs, liste et contrôle des machines).

const { ipcMain } = require('electron');
const virt = require('../virt');

function register() {
  // Balayage complet, ou seulement certains hyperviseurs (ids) après une action
  ipcMain.handle('virt:scan', (evt, ids) => virt.scan(ids));
  ipcMain.handle('virt:action', (evt, payload) => virt.performAction(payload || {}));
}

module.exports = { register };
