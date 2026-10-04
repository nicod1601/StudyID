/**
 * IPC — mode Projet : ouvrir un dossier, lister l'arborescence, créer /
 * renommer / supprimer des fichiers et dossiers.
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const { getMainWindow } = require('./context');
const { patchSettings, readSettings } = require('./settings');

// Dossiers volumineux ou techniques, grisés dans l'arborescence.
const IGNORED_DIR_NAMES = new Set(
  ['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'target', 'dist', 'build', '.idea', '.vscode']);

function statEntry(fullPath, name)
{
  const st = fs.statSync(fullPath);
  return { name, path: fullPath, isDirectory: st.isDirectory(), size: st.isDirectory() ? 0 : st.size };
}

// Liste un dossier : dossiers d'abord, puis tri alphabétique (locale FR).
function listDirEntries(dirPath)
{
  const entries = fs.readdirSync(dirPath)
    .map((name) =>
    {
      try { return statEntry(path.join(dirPath, name), name); }
      catch (e) { return null; }
    })
    .filter(Boolean);

  entries.sort((a, b) =>
  {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });

  return entries.map((e) => ({ ...e, ignored: e.isDirectory && IGNORED_DIR_NAMES.has(e.name) }));
}

// Refuse les noms vides ou contenant un séparateur de chemin.
function invalidName(name)
{
  return !name || name.includes('/') || name.includes('\\');
}

function register(ipcMain)
{
  ipcMain.handle('project:openDialog', async () =>
  {
    const res = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;

    const rootPath = res.filePaths[0];
    patchSettings({ lastProjectPath: rootPath });
    return { path: rootPath, name: path.basename(rootPath) };
  });

  ipcMain.handle('project:reopenLast', () =>
  {
    const { lastProjectPath } = readSettings();
    if (lastProjectPath && fs.existsSync(lastProjectPath))
    {
      return { path: lastProjectPath, name: path.basename(lastProjectPath) };
    }
    return null;
  });

  ipcMain.handle('project:readDir', (evt, dirPath) =>
  {
    try { return { ok: true, entries: listDirEntries(dirPath) }; }
    catch (e) { return { ok: false, error: e.message, entries: [] }; }
  });

  ipcMain.handle('project:newFile', (evt, { dirPath, name }) =>
  {
    try
    {
      const safeName = name.trim();
      if (invalidName(safeName)) return { ok: false, error: 'Nom invalide.' };
      const filePath = path.join(dirPath, safeName);
      if (fs.existsSync(filePath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
      fs.writeFileSync(filePath, '', 'utf-8');
      return { ok: true, path: filePath };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('project:newFolder', (evt, { dirPath, name }) =>
  {
    try
    {
      const safeName = name.trim();
      if (invalidName(safeName)) return { ok: false, error: 'Nom invalide.' };
      const folderPath = path.join(dirPath, safeName);
      if (fs.existsSync(folderPath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
      fs.mkdirSync(folderPath, { recursive: true });
      return { ok: true, path: folderPath };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('project:rename', (evt, { oldPath, newName }) =>
  {
    try
    {
      const safeName = newName.trim();
      if (invalidName(safeName)) return { ok: false, error: 'Nom invalide.' };
      const newPath = path.join(path.dirname(oldPath), safeName);
      fs.renameSync(oldPath, newPath);
      return { ok: true, path: newPath };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('project:delete', (evt, targetPath) =>
  {
    try { fs.rmSync(targetPath, { recursive: true, force: true }); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
}

module.exports = { register };
