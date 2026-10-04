/**
 * IPC — « Mes notes » : sélections de texte enregistrées depuis l'éditeur.
 *
 * Stocké en clair dans ~/StudyIDE/data-note.txt : lisible/éditable même en
 * dehors de l'appli. Chaque note est un bloc « === en-tête === » suivi du texte.
 */

const fs = require('fs');
const { shell } = require('electron');

const { WORKSPACE_DIR, PATHS } = require('./config');
const { ensureDir } = require('./store');

function noteHeader(meta)
{
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const parts = [date];
  if (meta.courseCode) parts.push(meta.courseCode);
  if (meta.source) parts.push(meta.source);
  return `=== ${parts.join(' · ')} ===`;
}

// Découpe le fichier en blocs { header, lines } (ordre chronologique croissant).
function parseNoteBlocks(content)
{
  const blocks = [];
  let current = null;
  for (const line of content.split('\n'))
  {
    const m = /^=== (.+) ===$/.exec(line);
    if (m)
    {
      if (current) blocks.push(current);
      current = { header: m[1], lines: [] };
    }
    else if (current)
    {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// Sérialise des blocs vers le format fichier.
function blocksToText(blocks)
{
  return blocks
    .map((b) => `=== ${b.header} ===\n${b.lines.join('\n').replace(/\n+$/, '')}\n\n`)
    .join('');
}

function register(ipcMain)
{
  ipcMain.handle('notes:append', (evt, { text, courseCode, source }) =>
  {
    try
    {
      if (!text || !text.trim()) return { ok: false, error: 'Sélectionne du texte avant d\'enregistrer.' };
      ensureDir(WORKSPACE_DIR);
      const block = `${noteHeader({ courseCode, source })}\n${text.trim()}\n\n`;
      fs.appendFileSync(PATHS.notes, block, 'utf-8');
      return { ok: true };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('notes:list', () =>
  {
    try
    {
      if (!fs.existsSync(PATHS.notes)) return { ok: true, notes: [] };
      const blocks = parseNoteBlocks(fs.readFileSync(PATHS.notes, 'utf-8'));
      const notes = blocks.map((b, i) => (
      {
        id: i,
        header: b.header,
        text: b.lines.join('\n').replace(/\n+$/, '')
      }));
      notes.reverse(); // les plus récentes en premier
      return { ok: true, notes };
    }
    catch (e) { return { ok: false, error: e.message, notes: [] }; }
  });

  ipcMain.handle('notes:deleteAt', (evt, { id }) =>
  {
    try
    {
      if (!fs.existsSync(PATHS.notes)) return { ok: true };
      const blocks = parseNoteBlocks(fs.readFileSync(PATHS.notes, 'utf-8'));
      blocks.splice(id, 1);
      fs.writeFileSync(PATHS.notes, blocksToText(blocks), 'utf-8');
      return { ok: true };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('notes:openFile', () =>
  {
    ensureDir(WORKSPACE_DIR);
    if (!fs.existsSync(PATHS.notes)) fs.writeFileSync(PATHS.notes, '', 'utf-8');
    shell.showItemInFolder(PATHS.notes);
  });
}

module.exports = { register };
