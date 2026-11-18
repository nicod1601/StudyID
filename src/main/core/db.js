'use strict';
// Base de données JSON : cache mémoire, écriture différée et atomique, migration des PDF livrés avec l'appli.

const path = require('path');
const fs = require('fs');
const { COURSES_SEED, DB_FILE, SEED_PDFS_DIR, WORKSPACE_DIR } = require('./paths');

// ---------- Base de données : cache mémoire + écriture différée et atomique ----------
// Avant : chaque appel IPC relisait et re-parsait tout le JSON (et revérifiait
// 30 dossiers). Maintenant : lecture unique au démarrage, écriture groupée
// (debounce) via un fichier temporaire puis renommage, vidée à la fermeture.

let workspaceReady = false;

let dbCache = null;

let dbTimer = null;

let dbDirty = false;

function atomicWriteSync(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

function flushDB() {
  clearTimeout(dbTimer);
  dbTimer = null;
  if (!dbDirty || !dbCache) return;
  dbDirty = false;
  try { atomicWriteSync(DB_FILE, JSON.stringify(dbCache)); }
  catch (e) { dbDirty = true; console.error('Écriture de la base impossible :', e.message); }
}

function scheduleDBWrite() {
  dbDirty = true;
  if (dbTimer) return;
  dbTimer = setTimeout(flushDB, 400);
}

function ensureWorkspace() {
  if (workspaceReady) return;
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  for (const c of COURSES_SEED) {
    const docDir = path.join(WORKSPACE_DIR, c.code, 'documents');
    if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true }); // crée aussi le dossier de la matière
  }
  if (!fs.existsSync(DB_FILE)) {
    atomicWriteSync(DB_FILE, JSON.stringify({ courses: COURSES_SEED, exercises: {}, documents: {}, pdfExercises: {} }));
  }
  dbCache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!dbCache.documents) dbCache.documents = {};
  if (!dbCache.pdfExercises) dbCache.pdfExercises = {};
  if (!dbCache.exercises) dbCache.exercises = {};
  workspaceReady = true;
  migrateSeedPdfs(dbCache);
}

function readDB() {
  ensureWorkspace();
  return dbCache;
}

function writeDB(db) {
  if (db && db !== dbCache) dbCache = db;
  scheduleDBWrite();
}

// Le texte intégral des PDF (doc.pages) ne sert qu'à la recherche : inutile de le
// copier dans le renderer à chaque lecture de la base.
function publicDoc(d) {
  if (!d) return d;
  const { pages, ...rest } = d;
  return { ...rest, hasPages: Array.isArray(pages) };
}

function publicDB(db) {
  const documents = {};
  for (const [id, d] of Object.entries(db.documents)) documents[id] = publicDoc(d);
  return { ...db, documents };
}

// Copie les PDF de cours livrés avec l'appli dans le workspace, une seule fois,
// et enregistre les documents (la détection des exercices se fait ensuite côté
// renderer avec pdf.js, à l'ouverture, puis est mise en cache dans la DB).
function migrateSeedPdfs(db) {
  if (!fs.existsSync(SEED_PDFS_DIR)) return;
  const known = new Set(Object.values(db.documents).map((d) => `${d.courseCode}/${d.fileName}`));
  let changed = false;
  for (const courseCode of fs.readdirSync(SEED_PDFS_DIR)) {
    const srcDir = path.join(SEED_PDFS_DIR, courseCode);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const fileName of fs.readdirSync(srcDir)) {
      if (known.has(`${courseCode}/${fileName}`)) continue;
      const destPath = path.join(destDir, fileName);
      if (!fs.existsSync(destPath)) fs.copyFileSync(path.join(srcDir, fileName), destPath);
      const id = `doc-${courseCode}-${fileName}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      db.documents[id] = { id, courseCode, fileName, filePath: destPath, importedAt: new Date().toISOString(), seeded: true };
      changed = true;
    }
  }
  if (changed) scheduleDBWrite();
}

module.exports = { atomicWriteSync, ensureWorkspace, flushDB, publicDB, publicDoc, readDB, writeDB };
