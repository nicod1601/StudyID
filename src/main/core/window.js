'use strict';
// Fenêtre principale, icône de la barre système (tray) et état « en train de quitter ».

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { readSettings } = require('./settings');
const { ROOT } = require('./paths');

let mainWindow;

let tray = null;

let isQuitting = false;

function appIconPath() {
  const dir = path.join(ROOT, 'build');
  if (process.platform === 'win32') return path.join(dir, 'icon.ico');
  return path.join(dir, 'icon.png');
}

function createWindow() {
  const iconPath = appIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#08090d',
    show: false, // affichée sur 'ready-to-show' : pas de flash blanc, démarrage perçu plus net
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false
      // backgroundThrottling laissé actif : fenêtre masquée dans la zone de notification
      // = quasi 0 % CPU (les rappels EDT tolèrent un tick par minute).
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    const s = readSettings();
    if (!isQuitting && s.minimizeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(ROOT, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) return;
    let img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
    tray = new Tray(img);
    tray.setToolTip('StudyIDE');
    const menu = Menu.buildFromTemplate([
      { label: 'Afficher StudyIDE', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { type: 'separator' },
      { label: 'Quitter StudyIDE', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  } catch (e) {
    console.error('Impossible de créer l\'icône de la zone de notification :', e.message);
  }
}

function getMainWindow() { return mainWindow; }
function setQuitting(v) { isQuitting = v; }

module.exports = { createTray, createWindow, getMainWindow, setQuitting };
