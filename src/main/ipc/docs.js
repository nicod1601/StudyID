'use strict';
// IPC : documents PDF de cours, texte extrait pour la recherche, exercices détectés dans les PDF.

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { publicDB, publicDoc, readDB, writeDB } = require('../core/db');
const { getMainWindow } = require('../core/window');
const { SEED_SOLUTIONS, WORKSPACE_DIR } = require('../core/paths');

function register() {

  // ---------- IPC : cache du texte extrait des PDF (pour la recherche IA) ----------

  ipcMain.handle('docs:savePageText', (evt, { documentId, pages }) => {
    const db = readDB();
    if (db.documents[documentId]) {
      db.documents[documentId].pages = pages; // tableau de string, 1 par page
      writeDB(db);
    }
    return publicDoc(db.documents[documentId]);
  });

  ipcMain.handle('docs:getSearchCorpus', () => {
    const db = readDB();
    const chunks = [];
    for (const doc of Object.values(db.documents)) {
      if (Array.isArray(doc.pages)) {
        doc.pages.forEach((text, idx) => {
          if (text && text.trim()) {
            chunks.push({
              type: 'document', courseCode: doc.courseCode, source: doc.fileName,
              page: idx + 1, text
            });
          }
        });
      }
    }
    for (const ex of Object.values(db.pdfExercises)) {
      const doc = db.documents[ex.documentId];
      const parts = [];
      if (ex.statement) parts.push('Énoncé : ' + ex.statement);
      if (ex.solution) parts.push('Solution : ' + ex.solution);
      if (ex.userNotes) parts.push('Notes perso : ' + ex.userNotes);
      if (parts.length) {
        chunks.push({
          type: 'exercise', courseCode: ex.courseCode,
          source: doc ? doc.fileName : ex.courseCode,
          page: ex.page, exerciseNumber: ex.number,
          text: parts.join('\n')
        });
      }
    }
    return chunks;
  });

  // ---------- IPC : documents PDF de cours ----------

  ipcMain.handle('docs:listByCourse', (evt, courseCode) => {
    const db = readDB();
    return Object.values(db.documents).filter((d) => d.courseCode === courseCode).map(publicDoc);
  });

  ipcMain.handle('docs:readPdf', async (evt, filePath) => {
    try {
      const buf = await fs.promises.readFile(filePath);
      return { ok: true, data: buf }; // Buffer -> Uint8Array côté renderer
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('docs:importDialog', async (evt, courseCode) => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    const src = res.filePaths[0];
    const fileName = path.basename(src);
    const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(src, destPath);

    const db = readDB();
    const id = `doc-${courseCode}-${fileName}-${Date.now()}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    db.documents[id] = { id, courseCode, fileName, filePath: destPath, importedAt: new Date().toISOString(), seeded: false };
    writeDB(db);
    return db.documents[id];
  });

  ipcMain.handle('docs:deleteDocument', (evt, { id, deleteFile }) => {
    const db = readDB();
    const doc = db.documents[id];
    if (doc) {
      if (deleteFile && fs.existsSync(doc.filePath)) {
        try { fs.unlinkSync(doc.filePath); } catch (e) {}
      }
      delete db.documents[id];
      for (const exId of Object.keys(db.pdfExercises)) {
        if (db.pdfExercises[exId].documentId === id) delete db.pdfExercises[exId];
      }
      writeDB(db);
    }
    return publicDB(db);
  });

  // ---------- IPC : exercices détectés dans les PDF ----------

  ipcMain.handle('pdfEx:saveDetected', (evt, { documentId, courseCode, exercises }) => {
    // exercises: [{ number, title, page, statement }]
    const db = readDB();
    // On ne recrée pas si déjà présent pour ce document (on garde d'éventuelles
    // notes déjà écrites par l'utilisateur), sauf si forcé.
    if (db.documents[documentId]) db.documents[documentId].exercisesScanned = true;
    const already = Object.values(db.pdfExercises).some((e) => e.documentId === documentId);
    if (already) { writeDB(db); return { ok: true }; }

    const fileName = db.documents[documentId]?.fileName || '';
    for (const ex of exercises) {
      const id = `pex-${documentId}-${ex.number}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      const solutionKey = `${fileName}::${ex.number}`;
      db.pdfExercises[id] = {
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
    return { ok: true };
  });

  ipcMain.handle('pdfEx:listByDocument', (evt, documentId) => {
    const db = readDB();
    return Object.values(db.pdfExercises)
      .filter((e) => e.documentId === documentId)
      .sort((a, b) => Number(a.number) - Number(b.number));
  });

  ipcMain.handle('pdfEx:updateNotes', (evt, { id, userNotes }) => {
    const db = readDB();
    if (db.pdfExercises[id]) {
      db.pdfExercises[id].userNotes = userNotes;
      writeDB(db);
    }
    return db.pdfExercises[id];
  });

  ipcMain.handle('pdfEx:updateStatus', (evt, { id, status }) => {
    const db = readDB();
    if (db.pdfExercises[id]) {
      db.pdfExercises[id].status = status;
      writeDB(db);
    }
    return db.pdfExercises[id];
  });
}

module.exports = { register };
