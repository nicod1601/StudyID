'use strict';
// IPC : mode Projet (ouvrir un dossier, arborescence, lecture sûre des fichiers, création/renommage/suppression).

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getMainWindow } = require('../core/window');
const { readSettings, writeSettings } = require('../core/settings');

// ---------- IPC : Mode Projet (ouvrir un dossier, arborescence, terminal) ----------

const IGNORED_DIR_NAMES = new Set([
  '.git', 'node_modules', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'dist', 'build', '.idea', '.vscode',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.parcel-cache', '.cache', '.gradle', '.pytest_cache', '.mypy_cache', '.tox', 'coverage'
]);

async function listDirEntries(dirPath) {
  const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const entries = await Promise.all(dirents.map(async (d) => {
    const full = path.join(dirPath, d.name);
    let isDirectory = d.isDirectory();
    if (d.isSymbolicLink()) {
      try { isDirectory = (await fs.promises.stat(full)).isDirectory(); } catch (e) { return null; }
    }
    return { name: d.name, path: full, isDirectory, size: 0, ignored: isDirectory && IGNORED_DIR_NAMES.has(d.name) };
  }));
  return entries.filter(Boolean).sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });
}

// Lecture d'un fichier du projet pour l'éditeur : asynchrone, refuse les binaires et les fichiers énormes
// (sinon l'interface se fige sur une image, une base SQLite, un .zip ou un bundle de 80 Mo).
const MAX_EDITABLE_BYTES = 8 * 1024 * 1024;

function register() {

  ipcMain.handle('project:readFile', async (evt, filePath) => {
    try {
      const st = await fs.promises.stat(filePath);
      if (st.isDirectory()) return { ok: false, error: 'C\'est un dossier.' };
      if (st.size > MAX_EDITABLE_BYTES) return { ok: false, tooLarge: true, size: st.size, error: 'Fichier trop volumineux pour l\'éditeur (' + (st.size / 1048576).toFixed(1) + ' Mo).' };
      const buf = await fs.promises.readFile(filePath);
      const probe = buf.subarray(0, Math.min(buf.length, 8000));
      if (probe.includes(0)) return { ok: false, binary: true, size: st.size, error: 'Fichier binaire (image, archive, base de données…) : non affiché.' };
      let content = buf.toString('utf-8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // BOM
      return { ok: true, content, size: st.size };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('project:openDialog', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    const rootPath = res.filePaths[0];
    const s = readSettings();
    s.lastProjectPath = rootPath;
    writeSettings(s);
    return { path: rootPath, name: path.basename(rootPath) };
  });

  ipcMain.handle('project:reopenLast', () => {
    const s = readSettings();
    if (s.lastProjectPath && fs.existsSync(s.lastProjectPath)) {
      return { path: s.lastProjectPath, name: path.basename(s.lastProjectPath) };
    }
    return null;
  });

  ipcMain.handle('project:readDir', async (evt, dirPath) => {
    try {
      return { ok: true, entries: await listDirEntries(dirPath) };
    } catch (e) {
      return { ok: false, error: e.message, entries: [] };
    }
  });

  ipcMain.handle('project:newFile', (evt, { dirPath, name }) => {
    try {
      const safeName = name.trim();
      if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
      const filePath = path.join(dirPath, safeName);
      if (fs.existsSync(filePath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
      fs.writeFileSync(filePath, '', 'utf-8');
      return { ok: true, path: filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Crée un fichier avec son contenu (sous-dossiers créés au besoin). Le chemin reste confiné au dossier du projet.
  ipcMain.handle('project:createFile', (evt, { rootPath, relPath, content, overwrite }) => {
    try {
      if (!rootPath || !relPath || typeof relPath !== 'string') return { ok: false, error: 'Chemin invalide.' };
      const root = path.resolve(rootPath);
      const target = path.resolve(root, relPath.trim());
      if (target !== root && !target.startsWith(root + path.sep)) return { ok: false, error: 'Le fichier doit rester dans le dossier du projet.' };
      if (target === root) return { ok: false, error: 'Nom de fichier invalide.' };
      if (fs.existsSync(target) && !overwrite) return { ok: false, exists: true, error: 'Ce fichier existe déjà.' };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, String(content ?? ''), 'utf-8');
      return { ok: true, path: target };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('project:newFolder', (evt, { dirPath, name }) => {
    try {
      const safeName = name.trim();
      if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
      const folderPath = path.join(dirPath, safeName);
      if (fs.existsSync(folderPath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
      fs.mkdirSync(folderPath, { recursive: true });
      return { ok: true, path: folderPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('project:rename', (evt, { oldPath, newName }) => {
    try {
      const safeName = newName.trim();
      if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
      const newPath = path.join(path.dirname(oldPath), safeName);
      fs.renameSync(oldPath, newPath);
      return { ok: true, path: newPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('project:delete', (evt, targetPath) => {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { register };
