/**
 * StudyIDE — point d'entrée du process principal (Electron).
 *
 * Ce fichier reste volontairement court : il gère le cycle de vie de l'appli,
 * la fenêtre et l'icône de la zone de notification. Toute la logique métier
 * est répartie dans les modules de /main (un module par domaine).
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { setMainWindow, getMainWindow } = require('./main/context');
const { ensureWorkspace } = require('./main/database');
const { readSettings } = require('./main/settings');
const terminal = require('./main/ipc-terminal');

// Tous les modules IPC à enregistrer (chacun expose register(ipcMain)).
const IPC_MODULES =
[
  require('./main/settings'),
  require('./main/ai'),
  require('./main/ipc-exercises'),
  require('./main/ipc-files'),
  require('./main/ipc-run'),
  require('./main/ipc-project'),
  terminal,
  require('./main/ipc-edt'),
  require('./main/ipc-notes'),
  require('./main/ipc-but'),
  require('./main/ipc-docs'),
  require('./main/ipc-system')
];

let tray = null;
let isQuitting = false;

function registerAllIpc()
{
  for (const mod of IPC_MODULES) mod.register(ipcMain);
}

function appIconPath()
{
  const dir = path.join(__dirname, 'build');
  return process.platform === 'win32' ? path.join(dir, 'icon.ico') : path.join(dir, 'icon.png');
}

function createWindow()
{
  const iconPath = appIconPath();
  const win = new BrowserWindow(
  {
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1f24',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences:
    {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Fermer la fenêtre la réduit dans la zone de notification (si activé).
  win.on('close', (e) =>
  {
    if (!isQuitting && readSettings().minimizeToTray !== false)
    {
      e.preventDefault();
      win.hide();
    }
  });

  setMainWindow(win);
}

function createTray()
{
  try
  {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) return;

    let img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });

    tray = new Tray(img);
    tray.setToolTip('StudyIDE');
    tray.setContextMenu(Menu.buildFromTemplate(
    [
      { label: 'Afficher StudyIDE', click: () => showMainWindow() },
      { type: 'separator' },
      { label: 'Quitter StudyIDE', click: () => { isQuitting = true; app.quit(); } }
    ]));
    tray.on('click', () =>
    {
      const win = getMainWindow();
      if (win && win.isVisible()) win.hide();
      else showMainWindow();
    });
  }
  catch (e)
  {
    console.error('Impossible de créer l\'icône de la zone de notification :', e.message);
  }
}

function showMainWindow()
{
  const win = getMainWindow();
  if (!win) return;
  win.show();
  win.focus();
}

app.whenReady().then(() =>
{
  ensureWorkspace();
  registerAllIpc();
  createWindow();
  createTray();

  app.on('activate', () =>
  {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on('window-all-closed', () =>
{
  if (process.platform !== 'darwin' && readSettings().minimizeToTray === false) app.quit();
});

app.on('before-quit', () =>
{
  isQuitting = true;
  terminal.killAll();
});
