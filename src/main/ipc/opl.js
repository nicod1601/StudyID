'use strict';
// IPC : fichiers du module OPL / CPLEX (.mod et .dat), stockés dans ~/StudyIDE/Optimisation.

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { getMainWindow } = require('../core/window');
const { WORKSPACE_DIR } = require('../core/paths');

const OPL_DIR = path.join(WORKSPACE_DIR, 'Optimisation');
const NAME_RE = /^[\w][\w .()-]{0,80}\.(mod|dat)$/i;

function checkName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.includes('..')) throw new Error('Nom invalide : utilise des lettres, chiffres, espaces, _ - et l\'extension .mod ou .dat.');
  return path.join(OPL_DIR, name);
}
function ensureDir() { fs.mkdirSync(OPL_DIR, { recursive: true }); }
// Nom libre : « modele.mod » puis « modele (2).mod »…
function freeName(name) {
  const ext = path.extname(name), base = name.slice(0, -ext.length);
  let n = name, i = 2;
  while (fs.existsSync(path.join(OPL_DIR, n))) n = `${base} (${i++})${ext}`;
  return n;
}

function register() {
  const wrap = (fn) => async (evt, arg) => { try { ensureDir(); return { ok: true, ...(await fn(arg)) }; } catch (e) { return { ok: false, error: e.message }; } };

  ipcMain.handle('opl:list', wrap(() => ({
    dir: OPL_DIR,
    files: fs.readdirSync(OPL_DIR).filter((f) => NAME_RE.test(f)).map((f) => {
      const st = fs.statSync(path.join(OPL_DIR, f));
      return { name: f, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  })));

  ipcMain.handle('opl:read', wrap((name) => ({ content: fs.readFileSync(checkName(name), 'utf-8') })));

  ipcMain.handle('opl:write', wrap(({ name, content }) => {
    if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) throw new Error('Contenu invalide ou trop gros.');
    fs.writeFileSync(checkName(name), content, 'utf-8');
    return {};
  }));

  // Crée un fichier sans écraser l'existant ; renvoie le nom réellement utilisé
  ipcMain.handle('opl:create', wrap(({ name, content }) => {
    checkName(name);
    const finalName = freeName(name);
    fs.writeFileSync(path.join(OPL_DIR, finalName), typeof content === 'string' ? content : '', 'utf-8');
    return { name: finalName };
  }));

  ipcMain.handle('opl:delete', wrap((name) => { fs.unlinkSync(checkName(name)); return {}; }));

  ipcMain.handle('opl:rename', wrap(({ from, to }) => {
    const src = checkName(from), dst = checkName(to);
    if (fs.existsSync(dst)) throw new Error('Un fichier porte déjà ce nom.');
    fs.renameSync(src, dst);
    return { name: to };
  }));

  // Copie des fichiers choisis par l'utilisateur dans le dossier Optimisation
  ipcMain.handle('opl:import', wrap(async () => {
    const r = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Importer des fichiers OPL', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Modèles OPL', extensions: ['mod', 'dat'] }]
    });
    if (r.canceled) return { names: [] };
    const names = [];
    for (const p of r.filePaths) {
      const base = path.basename(p).replace(/[^\w .()-]/g, '_');
      if (!NAME_RE.test(base)) continue;
      const st = fs.statSync(p);
      if (st.size > 5 * 1024 * 1024) continue;
      const finalName = freeName(base);
      fs.copyFileSync(p, path.join(OPL_DIR, finalName));
      names.push(finalName);
    }
    return { names };
  }));

  // « Enregistrer sous » : écrit une copie où l'utilisateur veut
  ipcMain.handle('opl:export', wrap(async ({ name, content }) => {
    checkName(name);
    const r = await dialog.showSaveDialog(getMainWindow(), { title: 'Enregistrer une copie', defaultPath: path.join(require('os').homedir(), name), filters: [{ name: 'OPL', extensions: ['mod', 'dat'] }] });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, String(content), 'utf-8');
    return { saved: true, path: r.filePath };
  }));

  ipcMain.handle('opl:openFolder', wrap(async () => { await shell.openPath(OPL_DIR); return {}; }));
}

module.exports = { register };
