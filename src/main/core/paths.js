'use strict';
// Chemins de l'application : dossier de travail de l'utilisateur et ressources livrées avec l'appli.

const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..', '..');

// Dossier de travail de l'utilisateur : ~/StudyIDE
const WORKSPACE_DIR = path.join(os.homedir(), 'StudyIDE');

const DB_FILE = path.join(WORKSPACE_DIR, 'studyide-data.json');

const COURSES_SEED = require('../../../data/courses.json');

const SEED_SOLUTIONS = require('../../../data/seed-solutions.json');

const SEED_PDFS_DIR = path.join(ROOT, 'data', 'seed-pdfs');

module.exports = { COURSES_SEED, DB_FILE, ROOT, SEED_PDFS_DIR, SEED_SOLUTIONS, WORKSPACE_DIR };
