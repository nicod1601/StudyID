/**
 * IPC — fichiers génériques (lecture/écriture, import, ouverture externe).
 */

const fs = require('fs');
const path = require('path');
const { shell, dialog } = require('electron');

const { WORKSPACE_DIR, COURSES_SEED } = require('./config');
const { getMainWindow } = require('./context');

const MAX_WORKSPACE_FILES = 5000; // garde-fou si un dossier de cours devient énorme

// Liste TOUS les fichiers réellement présents dans les dossiers de matières du
// workspace (quel que soit leur mode de création), pour que l'assistant puisse
// les retrouver. Ne descend que dans les dossiers de matières connus.
function listWorkspaceFiles()
{
  const courseCodes = new Set(COURSES_SEED.map((c) => c.code));
  const results = [];

  if (!fs.existsSync(WORKSPACE_DIR)) return results;

  for (const name of fs.readdirSync(WORKSPACE_DIR))
  {
    if (!courseCodes.has(name)) continue; // ignore models/, *.json, etc.
    const courseDir = path.join(WORKSPACE_DIR, name);
    try { if (!fs.statSync(courseDir).isDirectory()) continue; } catch (e) { continue; }
    walkDir(courseDir, name, results);
  }
  return results;
}

function walkDir(dir, courseCode, out)
{
  if (out.length >= MAX_WORKSPACE_FILES) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }

  for (const entry of entries)
  {
    if (out.length >= MAX_WORKSPACE_FILES) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, courseCode, out);
    else out.push({ courseCode, fileName: entry.name, path: full });
  }
}

function register(ipcMain)
{
  ipcMain.handle('file:read', (evt, filePath) =>
  {
    try { return { ok: true, content: fs.readFileSync(filePath, 'utf-8') }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('file:write', (evt, { filePath, content }) =>
  {
    try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('file:openExternal', (evt, filePath) =>
  {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('app:openUrl', (evt, url) =>
  {
    shell.openExternal(url);
  });

  ipcMain.handle('file:importDialog', async (evt, courseCode) =>
  {
    const res = await dialog.showOpenDialog(getMainWindow(),
    {
      properties: ['openFile'],
      filters: [{ name: 'Code', extensions: ['py', 'java', 'txt'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;

    const src = res.filePaths[0];
    const dest = path.join(WORKSPACE_DIR, courseCode, path.basename(src));
    fs.copyFileSync(src, dest);
    return dest;
  });

  ipcMain.handle('workspace:listFiles', () => listWorkspaceFiles());
}

module.exports = { register };
