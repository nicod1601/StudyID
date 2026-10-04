/**
 * IPC — base de données et exercices de code.
 */

const fs = require('fs');
const path = require('path');

const { WORKSPACE_DIR } = require('./config');
const { readDB, writeDB } = require('./database');

// Construit un nom de fichier sûr : retire l'extension éventuellement tapée par
// l'utilisateur (« test.java » → « test ») puis nettoie les caractères interdits.
function makeSafeName(name, language)
{
  const base = String(name).trim().replace(/\.(java|py)$/i, '');
  return base.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'Exercice';
}

function register(ipcMain)
{
  ipcMain.handle('db:get', () => readDB());

  ipcMain.handle('db:createExercise', (evt, { courseCode, name, language }) =>
  {
    const db = readDB();
    const id = `${courseCode}-${Date.now()}`;
    const safeName = makeSafeName(name, language);
    const fileName = language === 'java' ? `${safeName}.java` : `${safeName}.py`;
    const filePath = path.join(WORKSPACE_DIR, courseCode, fileName);

    const template = language === 'java'
      ? `public class ${safeName} {\n    public static void main(String[] args) {\n        System.out.println("Hello, ${safeName} !");\n    }\n}\n`
      : `# ${safeName}\n\ndef main():\n    print("Hello, ${safeName} !")\n\nif __name__ == "__main__":\n    main()\n`;

    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, template, 'utf-8');

    db.exercises[id] =
    {
      id, courseCode, name, language, filePath,
      status: 'todo',
      createdAt: new Date().toISOString()
    };
    writeDB(db);
    return db.exercises[id];
  });

  ipcMain.handle('db:updateExerciseStatus', (evt, { id, status }) =>
  {
    const db = readDB();
    if (db.exercises[id])
    {
      db.exercises[id].status = status;
      writeDB(db);
    }
    return db;
  });

  ipcMain.handle('db:deleteExercise', (evt, { id, deleteFile }) =>
  {
    const db = readDB();
    const ex = db.exercises[id];
    if (ex)
    {
      if (deleteFile && fs.existsSync(ex.filePath))
      {
        try { fs.unlinkSync(ex.filePath); } catch (e) {}
      }
      delete db.exercises[id];
      writeDB(db);
    }
    return db;
  });

  ipcMain.handle('db:renameExercise', (evt, { id, name }) =>
  {
    const db = readDB();
    const ex = db.exercises[id];
    if (!ex) return { ok: false, error: 'Exercice introuvable.' };

    const safeName = makeSafeName(name, ex.language);
    const ext = ex.language === 'java' ? '.java' : '.py';
    const newPath = path.join(path.dirname(ex.filePath), safeName + ext);

    if (newPath !== ex.filePath && fs.existsSync(newPath))
    {
      return { ok: false, error: 'Un fichier porte déjà ce nom.' };
    }

    try
    {
      if (fs.existsSync(ex.filePath) && newPath !== ex.filePath) fs.renameSync(ex.filePath, newPath);
      ex.name = String(name).trim() || safeName;
      ex.filePath = newPath;
      writeDB(db);
      return { ok: true, exercise: ex };
    }
    catch (e)
    {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { register };
