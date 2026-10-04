/**
 * IA locale via Ollama (http://localhost:11434).
 *
 * On n'embarque plus de moteur natif : Ollama (appli officielle, signée) gère
 * le moteur ET les modèles depuis son registre vérifié. StudyID lui parle
 * seulement en HTTP, ce qui supprime tous les problèmes de binaires bloqués.
 *
 * Prérequis côté utilisateur : installer Ollama (https://ollama.com) et le
 * laisser tourner. Les modèles se téléchargent ensuite depuis l'appli.
 */

const http = require('http');

const { LOCAL_MODEL_OPTIONS, OLLAMA_HOST } = require('./config');
const { readSettings } = require('./settings');
const { getMainWindow } = require('./context');

const MAX_ANSWER_TOKENS = 4096; // généreux : évite de couper le code au milieu

let downloadInProgress = null; // id du profil en cours de téléchargement, ou null

function getModelOption(modelId)
{
  return LOCAL_MODEL_OPTIONS.find((m) => m.id === modelId) || LOCAL_MODEL_OPTIONS[0];
}

// Requête HTTP simple vers Ollama ; renvoie { status, json } (ou rejette).
function ollamaRequest(method, path, body)
{
  return new Promise((resolve, reject) =>
  {
    const [host, port] = OLLAMA_HOST.split(':');
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {};

    const req = http.request({ host, port: Number(port) || 11434, path, method, headers }, (res) =>
    {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () =>
      {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (e) {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Requête en flux (NDJSON) : appelle onLine pour chaque objet reçu (pull/chat).
function ollamaStream(path, body, onLine)
{
  return new Promise((resolve, reject) =>
  {
    const [host, port] = OLLAMA_HOST.split(':');
    const payload = JSON.stringify(body);

    const req = http.request(
      { host, port: Number(port) || 11434, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) =>
      {
        let buf = '';
        res.on('data', (chunk) =>
        {
          buf += chunk;
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0)
          {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try
            {
              const obj = JSON.parse(line);
              if (obj.error) { reject(new Error(obj.error)); return; }
              onLine(obj);
            }
            catch (e) {}
          }
        });
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Liste les modèles réellement installés dans Ollama ; null si Ollama injoignable.
async function installedModelNames()
{
  try
  {
    const res = await ollamaRequest('GET', '/api/tags');
    if (res.status !== 200 || !res.json) return null;
    return (res.json.models || []).map((m) => m.name);
  }
  catch (e)
  {
    return null; // Ollama n'est pas lancé / pas installé
  }
}

function register(ipcMain)
{
  ipcMain.handle('localAI:listModels', async () =>
  {
    const installed = await installedModelNames();
    const names = new Set(installed || []);
    return LOCAL_MODEL_OPTIONS.map((m) => (
    {
      id: m.id,
      label: m.label,
      description: m.description,
      heavy: !!m.heavy,
      warning: m.warning || '',
      downloaded: names.has(m.model),
      downloading: downloadInProgress === m.id
    }));
  });

  ipcMain.handle('localAI:status', async () =>
  {
    const installed = await installedModelNames();
    const ollamaRunning = installed !== null;
    const modelId = readSettings().localModelId || 'fast';
    const opt = getModelOption(modelId);
    return {
      ollamaRunning,
      modelId,
      modelName: opt.model,
      downloaded: ollamaRunning && installed.includes(opt.model),
      downloading: downloadInProgress === modelId
    };
  });

  ipcMain.handle('localAI:download', async (evt, { modelId }) =>
  {
    if (downloadInProgress) return { ok: false, error: 'Un téléchargement est déjà en cours.' };
    if ((await installedModelNames()) === null)
    {
      return { ok: false, error: 'Ollama n\'est pas détecté. Installe-le depuis https://ollama.com puis relance-le.' };
    }

    const opt = getModelOption(modelId);
    downloadInProgress = opt.id;
    try
    {
      await ollamaStream('/api/pull', { name: opt.model, stream: true }, (obj) =>
      {
        const win = getMainWindow();
        if (!win) return;
        const total = obj.total || 0;
        const received = obj.completed || 0;
        win.webContents.send('localAI:progress',
        {
          received,
          total,
          percent: total ? Math.round((received / total) * 100) : null,
          status: obj.status || ''
        });
      });
      return { ok: true };
    }
    catch (e)
    {
      return { ok: false, error: e.message };
    }
    finally
    {
      downloadInProgress = null;
    }
  });

  ipcMain.handle('localAI:ask', async (evt, { prompt, system, history }) =>
  {
    const modelId = readSettings().localModelId || 'fast';
    const opt = getModelOption(modelId);

    const installed = await installedModelNames();
    if (installed === null)
    {
      return { ok: false, error: 'Ollama n\'est pas lancé. Installe-le (https://ollama.com) et laisse-le tourner.' };
    }
    if (!installed.includes(opt.model))
    {
      return { ok: false, error: 'Le modèle sélectionné n\'est pas encore téléchargé.' };
    }

    // Message système (règles strictes) + historique récent + question actuelle.
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    if (Array.isArray(history))
    {
      for (const m of history)
      {
        if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        {
          messages.push({ role: m.role, content: m.content });
        }
      }
    }
    messages.push({ role: 'user', content: prompt });

    try
    {
      let text = '';
      await ollamaStream('/api/chat',
        { model: opt.model, messages, stream: true, options: { num_predict: MAX_ANSWER_TOKENS } },
        (obj) => { if (obj.message && obj.message.content) text += obj.message.content; });
      return { ok: true, text };
    }
    catch (e)
    {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('localAI:delete', async (evt, { modelId }) =>
  {
    const opt = getModelOption(modelId);
    try
    {
      await ollamaRequest('DELETE', '/api/delete', { name: opt.model });
      return { ok: true };
    }
    catch (e)
    {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { register };
