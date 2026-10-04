/**
 * IPC — calcul de notes BUT (saisie manuelle uniquement, aucune connexion au
 * portail universitaire). Les moyennes sont calculées côté renderer.
 */

const { PATHS, DEFAULT_BUT_GRADES } = require('./config');
const { readJson, writeJsonAtomic } = require('./store');

function register(ipcMain)
{
  ipcMain.handle('but:getGrades', () =>
  {
    const stored = readJson(PATHS.butGrades, null);
    if (stored) return stored;
    writeJsonAtomic(PATHS.butGrades, DEFAULT_BUT_GRADES);
    return DEFAULT_BUT_GRADES;
  });

  ipcMain.handle('but:setGrades', (evt, data) =>
  {
    writeJsonAtomic(PATHS.butGrades, data);
    return { ok: true };
  });

  ipcMain.handle('but:resetGrades', () =>
  {
    writeJsonAtomic(PATHS.butGrades, DEFAULT_BUT_GRADES);
    return DEFAULT_BUT_GRADES;
  });
}

module.exports = { register };
