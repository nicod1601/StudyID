/**
 * IPC — documents PDF de cours et exercices détectés dans ces PDF.
 *
 * Le texte extrait des pages (par pdf.js côté renderer) est mis en cache dans
 * la DB pour alimenter la recherche locale de la mini-IA.
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const { WORKSPACE_DIR, SEED_SOLUTIONS } = require('./config');
const { readDB, writeDB } = require('./database');
const { ensureDir } = require('./store');
const { getMainWindow } = require('./context');

function register(ipcMain)
{
  // ----- Documents PDF -----

  ipcMain.handle('docs:listByCourse', (evt, courseCode) =>
  {
    const db = readDB();
    return Object.values(db.documents).filter((d) => d.courseCode === courseCode);
  });

  ipcMain.handle('docs:readAsBase64', (evt, filePath) =>
  {
    try { return { ok: true, base64: fs.readFileSync(filePath).toString('base64') }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('docs:importDialog', async (evt, courseCode) =>
  {
    const res = await dialog.showOpenDialog(getMainWindow(),
    {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;

    const src = res.filePaths[0];
    const fileName = path.basename(src);
    const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
    ensureDir(destDir);
    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(src, destPath);

    const db = readDB();
    const id = `doc-${courseCode}-${fileName}-${Date.now()}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    db.documents[id] = { id, courseCode, fileName, filePath: destPath, importedAt: new Date().toISOString(), seeded: false };
    writeDB(db);
    return db.documents[id];
  });

  ipcMain.handle('docs:deleteDocument', (evt, { id, deleteFile }) =>
  {
    const db = readDB();
    const doc = db.documents[id];
    if (doc)
    {
      if (deleteFile && fs.existsSync(doc.filePath))
      {
        try { fs.unlinkSync(doc.filePath); } catch (e) {}
      }
      delete db.documents[id];
      for (const exId of Object.keys(db.pdfExercises))
      {
        if (db.pdfExercises[exId].documentId === id) delete db.pdfExercises[exId];
      }
      writeDB(db);
    }
    return db;
  });

  // ----- Cache du texte extrait + corpus de recherche -----

  ipcMain.handle('docs:savePageText', (evt, { documentId, pages }) =>
  {
    const db = readDB();
    if (db.documents[documentId])
    {
      db.documents[documentId].pages = pages; // tableau de string, 1 par page
      writeDB(db);
    }
    return db.documents[documentId];
  });

  // ----- Exercices détectés dans les PDF -----

  ipcMain.handle('pdfEx:saveDetected', (evt, { documentId, courseCode, exercises }) =>
  {
    const db = readDB();
    // On ne recrée pas si déjà présent pour ce document : on préserve les notes
    // éventuellement déjà écrites par l'utilisateur.
    const already = Object.values(db.pdfExercises).some((e) => e.documentId === documentId);
    if (already) return db;

    const fileName = db.documents[documentId]?.fileName || '';
    for (const ex of exercises)
    {
      const id = `pex-${documentId}-${ex.number}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      const solutionKey = `${fileName}::${ex.number}`;
      db.pdfExercises[id] =
      {
        id, documentId, courseCode,
        number: ex.number,
        title: ex.title || '',
        page: ex.page,
        statement: ex.statement || '',
        solution: SEED_SOLUTIONS[solutionKey] || '',
        userNotes: '',
        status: 'todo'
      };
    }
    writeDB(db);
    return db;
  });

  ipcMain.handle('pdfEx:listByDocument', (evt, documentId) =>
  {
    const db = readDB();
    return Object.values(db.pdfExercises)
      .filter((e) => e.documentId === documentId)
      .sort((a, b) => Number(a.number) - Number(b.number));
  });

  ipcMain.handle('pdfEx:updateNotes', (evt, { id, userNotes }) =>
  {
    const db = readDB();
    if (db.pdfExercises[id])
    {
      db.pdfExercises[id].userNotes = userNotes;
      writeDB(db);
    }
    return db.pdfExercises[id];
  });

  ipcMain.handle('pdfEx:updateStatus', (evt, { id, status }) =>
  {
    const db = readDB();
    if (db.pdfExercises[id])
    {
      db.pdfExercises[id].status = status;
      writeDB(db);
    }
    return db.pdfExercises[id];
  });
}

module.exports = { register };
