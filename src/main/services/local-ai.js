'use strict';
// Mini IA locale hors ligne : téléchargement des modèles, chargement et questions (node-llama-cpp, optionnel).

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { WORKSPACE_DIR } = require('../core/paths');
const { LOCAL_MODEL_OPTIONS, getModelOption } = require('./local-models');
const { readSettings } = require('../core/settings');
const { getMainWindow } = require('../core/window');

let llamaModuleCache = null;

let loadedLlamaModel = null;

let loadedModelId = null;

let downloadInProgress = null;
 // stocke l'id du modèle en cours de téléchargement, ou null

function modelsDir() {
  return path.join(WORKSPACE_DIR, 'models');
}

async function getLlamaModule() {
  if (!llamaModuleCache) llamaModuleCache = await import('node-llama-cpp');
  return llamaModuleCache;
}

function modelFilePath(modelId) {
  return path.join(modelsDir(), getModelOption(modelId).fileName);
}

function downloadFile(url, finalPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Trop de redirections.')); return; }
    const tmpPath = finalPath + '.part';
    const req = https.get(url, { headers: { 'User-Agent': 'StudyIDE' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, finalPath, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} — le lien du modèle est peut-être invalide.`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(tmpPath);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (getMainWindow()) {
          getMainWindow().webContents.send('localAI:progress', {
            received, total, percent: total ? Math.round((received / total) * 100) : null
          });
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, finalPath);
            resolve();
          } catch (e) { reject(e); }
        });
      });
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function getLoadedModel(modelId) {
  if (loadedLlamaModel && loadedModelId === modelId) return loadedLlamaModel;
  // Un autre modèle était chargé : on le libère avant de charger le nouveau.
  if (loadedLlamaModel) {
    try { await loadedLlamaModel.dispose(); } catch (e) {}
    loadedLlamaModel = null;
  }
  const { getLlama } = await getLlamaModule();
  const llama = await getLlama();
  loadedLlamaModel = await llama.loadModel({ modelPath: modelFilePath(modelId) });
  loadedModelId = modelId;
  return loadedLlamaModel;
}

function register() {

  ipcMain.handle('localAI:listModels', () => {
    return LOCAL_MODEL_OPTIONS.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      downloaded: fs.existsSync(modelFilePath(m.id)),
      downloading: downloadInProgress === m.id
    }));
  });

  ipcMain.handle('localAI:status', () => {
    const settings = readSettings();
    const modelId = settings.localModelId || 'fast';
    return {
      modelId,
      downloaded: fs.existsSync(modelFilePath(modelId)),
      downloading: downloadInProgress === modelId,
      modelPath: modelFilePath(modelId)
    };
  });

  ipcMain.handle('localAI:download', async (evt, { modelId }) => {
    if (downloadInProgress) return { ok: false, error: 'Un téléchargement est déjà en cours.' };
    if (!fs.existsSync(modelsDir())) fs.mkdirSync(modelsDir(), { recursive: true });
    const opt = getModelOption(modelId);
    downloadInProgress = opt.id;
    try {
      await downloadFile(opt.url, modelFilePath(opt.id));
      downloadInProgress = null;
      return { ok: true };
    } catch (e) {
      downloadInProgress = null;
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('localAI:ask', async (evt, { prompt }) => {
    const settings = readSettings();
    const modelId = settings.localModelId || 'fast';
    const opt = getModelOption(modelId);
    if (!fs.existsSync(modelFilePath(modelId))) {
      return { ok: false, error: 'Le modèle local sélectionné n\'est pas encore téléchargé.' };
    }
    try {
      const { LlamaChatSession } = await getLlamaModule();
      const model = await getLoadedModel(modelId);
      const context = await model.createContext({ contextSize: opt.contextSize || 8192 });
      const session = new LlamaChatSession({ contextSequence: context.getSequence() });
      const answer = await session.prompt(prompt, { maxTokens: 900 });
      await context.dispose();
      return { ok: true, text: answer };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('localAI:delete', (evt, { modelId }) => {
    try {
      const fp = modelFilePath(modelId);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      if (loadedModelId === modelId) { loadedLlamaModel = null; loadedModelId = null; }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { register };
