'use strict';
// IPC : « Mes notes » (sélections enregistrées depuis l'éditeur).

const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { WORKSPACE_DIR } = require('../core/paths');

// ---------- IPC : Mes notes (sélections enregistrées depuis l'éditeur) ----------
// Stocké en clair dans ~/StudyIDE/data-note.txt : lisible/éditable même en dehors
// de l'appli, et facile à retrouver pendant un exercice, un DS ou un projet futur.

const NOTES_FILE = path.join(WORKSPACE_DIR, 'data-note.txt');

function noteHeader(meta) {
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const parts = [date];
  if (meta.courseCode) parts.push(meta.courseCode);
  if (meta.source) parts.push(meta.source);
  return `=== ${parts.join(' · ')} ===`;
}

function parseNoteBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const m = /^=== (.+) ===$/.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { header: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks; // ordre chronologique croissant (le plus ancien en premier)
}

function register() {

  ipcMain.handle('notes:append', (evt, { text, courseCode, source }) => {
    try {
      if (!text || !text.trim()) return { ok: false, error: 'Sélectionne du texte avant d\'enregistrer.' };
      if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
      const block = `${noteHeader({ courseCode, source })}\n${text.trim()}\n\n`;
      fs.appendFileSync(NOTES_FILE, block, 'utf-8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('notes:list', () => {
    try {
      if (!fs.existsSync(NOTES_FILE)) return { ok: true, notes: [] };
      const content = fs.readFileSync(NOTES_FILE, 'utf-8');
      const blocks = parseNoteBlocks(content);
      const notes = blocks.map((b, i) => ({
        id: i,
        header: b.header,
        text: b.lines.join('\n').replace(/\n+$/, '')
      }));
      notes.reverse(); // les plus récentes en premier
      return { ok: true, notes };
    } catch (e) {
      return { ok: false, error: e.message, notes: [] };
    }
  });

  ipcMain.handle('notes:deleteAt', (evt, { id }) => {
    try {
      if (!fs.existsSync(NOTES_FILE)) return { ok: true };
      const content = fs.readFileSync(NOTES_FILE, 'utf-8');
      const blocks = parseNoteBlocks(content);
      blocks.splice(id, 1);
      const newContent = blocks.map((b) => `=== ${b.header} ===\n${b.lines.join('\n').replace(/\n+$/, '')}\n\n`).join('');
      fs.writeFileSync(NOTES_FILE, newContent, 'utf-8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('notes:openFile', () => {
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '', 'utf-8');
    shell.showItemInFolder(NOTES_FILE);
  });
}

module.exports = { register };
