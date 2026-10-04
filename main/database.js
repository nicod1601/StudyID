/**
 * Base de données locale (un seul fichier JSON) + préparation du workspace.
 *
 * La DB regroupe : matières, exercices de code, documents PDF et exercices
 * détectés dans les PDF. Elle est relue à chaque accès et réécrite de façon
 * atomique via le store.
 */

const fs = require('fs');
const path = require('path');

const { WORKSPACE_DIR, PATHS, COURSES_SEED } = require('./config');
const { readJson, writeJsonAtomic, ensureDir } = require('./store');

// Prépare ~/StudyIDE : dossiers des matières, DB initiale, PDF fournis.
function ensureWorkspace()
{
  ensureDir(WORKSPACE_DIR);

  for (const course of COURSES_SEED)
  {
    const dir = path.join(WORKSPACE_DIR, course.code);
    ensureDir(dir);
    ensureDir(path.join(dir, 'documents'));
  }

  if (!fs.existsSync(PATHS.db))
  {
    writeJsonAtomic(PATHS.db, { courses: COURSES_SEED, exercises: {}, documents: {}, pdfExercises: {} });
  }

  migrateSeedPdfs();
}

// Garantit la présence des sous-objets attendus (DB d'ancienne version).
function readDB()
{
  ensureWorkspace();
  const db = readJson(PATHS.db, { courses: COURSES_SEED, exercises: {}, documents: {}, pdfExercises: {} });
  if (!db.documents) db.documents = {};
  if (!db.pdfExercises) db.pdfExercises = {};
  return db;
}

function writeDB(db)
{
  writeJsonAtomic(PATHS.db, db);
}

// Copie les PDF de cours livrés avec l'appli dans le workspace, une seule fois,
// et les enregistre comme documents. La détection des exercices se fait ensuite
// côté renderer (pdf.js) à l'ouverture, puis est mise en cache dans la DB.
function migrateSeedPdfs()
{
  if (!fs.existsSync(PATHS.seedPdfs)) return;

  const db = readJson(PATHS.db, { documents: {}, pdfExercises: {} });
  if (!db.documents) db.documents = {};
  if (!db.pdfExercises) db.pdfExercises = {};

  let changed = false;

  for (const courseCode of fs.readdirSync(PATHS.seedPdfs))
  {
    const srcDir = path.join(PATHS.seedPdfs, courseCode);
    if (!fs.statSync(srcDir).isDirectory()) continue;

    const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
    ensureDir(destDir);

    for (const fileName of fs.readdirSync(srcDir))
    {
      const alreadyRegistered = Object.values(db.documents).some(
        (d) => d.courseCode === courseCode && d.fileName === fileName
      );
      if (alreadyRegistered) continue;

      const destPath = path.join(destDir, fileName);
      if (!fs.existsSync(destPath)) fs.copyFileSync(path.join(srcDir, fileName), destPath);

      const id = `doc-${courseCode}-${fileName}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      db.documents[id] =
      {
        id, courseCode, fileName, filePath: destPath,
        importedAt: new Date().toISOString(), seeded: true
      };
      changed = true;
    }
  }

  if (changed) writeJsonAtomic(PATHS.db, db);
}

module.exports = { ensureWorkspace, readDB, writeDB };
