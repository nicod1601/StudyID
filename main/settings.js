/**
 * Réglages de l'application.
 *
 * La lecture fusionne toujours les valeurs par défaut (config.js) avec le
 * fichier utilisateur : ajouter un réglage ne demande donc qu'une seule ligne
 * dans DEFAULT_SETTINGS. Le handler `settings:patch` évite le pénible
 * read-modify-write côté renderer (et la course entre deux écritures).
 */

const { PATHS, DEFAULT_SETTINGS } = require('./config');
const { readJson, writeJsonAtomic } = require('./store');

function readSettings()
{
  const stored = readJson(PATHS.settings, {}) || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

function writeSettings(settings)
{
  writeJsonAtomic(PATHS.settings, settings);
  return settings;
}

// Fusionne un patch partiel dans les réglages existants, puis sauvegarde.
function patchSettings(patch)
{
  const merged = { ...readSettings(), ...patch };
  writeJsonAtomic(PATHS.settings, merged);
  return merged;
}

function register(ipcMain)
{
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (evt, settings) => writeSettings(settings));
  ipcMain.handle('settings:patch', (evt, patch) => patchSettings(patch));
}

module.exports = { readSettings, writeSettings, patchSettings, register };
