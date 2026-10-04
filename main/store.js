/**
 * Lecture / écriture JSON robuste et ATOMIQUE.
 *
 * writeJsonAtomic écrit d'abord dans un fichier temporaire ".tmp" puis le
 * renomme : si l'appli plante en plein milieu, le fichier d'origine reste
 * intact. C'est ce qui protège les données de l'utilisateur (DB, notes, notes
 * BUT, réglages) contre la corruption.
 */

const fs = require('fs');
const path = require('path');

// Lit un JSON, ou renvoie `fallback` si le fichier est absent ou illisible.
function readJson(filePath, fallback = null)
{
  try
  {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  catch (e)
  {
    return fallback;
  }
}

// Écrit un objet en JSON, de façon atomique (temp + rename).
function writeJsonAtomic(filePath, data)
{
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// Crée un dossier (et ses parents) s'il n'existe pas encore.
function ensureDir(dirPath)
{
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = { readJson, writeJsonAtomic, ensureDir };
