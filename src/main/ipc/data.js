'use strict';
// IPC : matières et exercices.

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { publicDB, readDB, writeDB } = require('../core/db');
const { WORKSPACE_DIR } = require('../core/paths');

function register() {

  // ---------- IPC : données (matières / exercices) ----------

  ipcMain.handle('db:get', () => publicDB(readDB()));

  ipcMain.handle('db:createExercise', (evt, { courseCode, name, language }) => {
    const db = readDB();
    const id = `${courseCode}-${Date.now()}`;
    const ext = language === 'java' ? 'java' : 'py';
    const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'Exercice';
    const fileName = language === 'java' ? `${safeName}.java` : `${safeName}.py`;
    const filePath = path.join(WORKSPACE_DIR, courseCode, fileName);

    const template = language === 'java'
      ? `public class ${safeName} {\n    public static void main(String[] args) {\n        System.out.println("Hello, ${safeName} !");\n    }\n}\n`
      : `# ${safeName}\n\ndef main():\n    print("Hello, ${safeName} !")\n\nif __name__ == "__main__":\n    main()\n`;

    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, template, 'utf-8');

    db.exercises[id] = {
      id, courseCode, name, language, filePath,
      status: 'todo',
      createdAt: new Date().toISOString()
    };
    writeDB(db);
    return db.exercises[id];
  });

  ipcMain.handle('db:updateExerciseStatus', (evt, { id, status }) => {
    const db = readDB();
    if (db.exercises[id]) {
      db.exercises[id].status = status;
      writeDB(db);
    }
    return db;
  });

  ipcMain.handle('db:deleteExercise', (evt, { id, deleteFile }) => {
    const db = readDB();
    const ex = db.exercises[id];
    if (ex) {
      if (deleteFile && fs.existsSync(ex.filePath)) {
        try { fs.unlinkSync(ex.filePath); } catch (e) {}
      }
      delete db.exercises[id];
      writeDB(db);
    }
    return db;
  });
}

module.exports = { register };
