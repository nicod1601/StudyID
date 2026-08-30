const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const https = require('https');

// ---------- Mini IA locale (hors ligne) ----------

const MODEL_FILENAME = 'mini-ia-qwen2.5-1.5b-instruct-q4.gguf'; // legacy, gardé pour compat
const DEFAULT_MODEL_URL = 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'; // legacy

const LOCAL_MODEL_OPTIONS = [
  {
    id: 'fast',
    label: 'Rapide (1,5 Go)',
    description: 'Réponses quasi instantanées, correct pour des questions simples. Qualité limitée sur du code complexe.',
    fileName: 'mini-ia-qwen2.5-1.5b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    contextSize: 8192
  },
  {
    id: 'balanced',
    label: 'Équilibré (recommandé, ~4,7 Go)',
    description: 'Bien meilleur pour comprendre et expliquer tes cours (management, éco, algo, etc.) et pour du code correct. Plus lent (10-40s/réponse sur CPU).',
    fileName: 'mini-ia-qwen2.5-7b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    contextSize: 8192
  },
  {
    id: 'code',
    label: 'Expert Code (~4,7 Go)',
    description: 'Spécialisé Java/Python : meilleure qualité de code, debug, complétion. Moins bon sur les matières non techniques.',
    fileName: 'mini-ia-qwen2.5-coder-7b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
    contextSize: 16384
  }
];

function getModelOption(modelId) {
  return LOCAL_MODEL_OPTIONS.find((m) => m.id === modelId) || LOCAL_MODEL_OPTIONS[0];
}

let llamaModuleCache = null;
let loadedLlamaModel = null;
let loadedModelId = null;
let downloadInProgress = null; // stocke l'id du modèle en cours de téléchargement, ou null

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
        if (mainWindow) {
          mainWindow.webContents.send('localAI:progress', {
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

// Dossier de travail de l'utilisateur : ~/StudyIDE
const WORKSPACE_DIR = path.join(os.homedir(), 'StudyIDE');
const DB_FILE = path.join(WORKSPACE_DIR, 'studyide-data.json');
const COURSES_SEED = require('./data/courses.json');
const SEED_SOLUTIONS = require('./data/seed-solutions.json');
const SEED_PDFS_DIR = path.join(__dirname, 'data', 'seed-pdfs');

function ensureWorkspace() {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  for (const c of COURSES_SEED) {
    const dir = path.join(WORKSPACE_DIR, c.code);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const docDir = path.join(dir, 'documents');
    if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = { courses: COURSES_SEED, exercises: {}, documents: {}, pdfExercises: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
  migrateSeedPdfs();
}

function readDB() {
  ensureWorkspace();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!db.documents) db.documents = {};
  if (!db.pdfExercises) db.pdfExercises = {};
  return db;
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Copie les PDF de cours livrés avec l'appli dans le workspace, une seule fois,
// et enregistre les documents (la détection des exercices se fait ensuite côté
// renderer avec pdf.js, à l'ouverture, puis est mise en cache dans la DB).
function migrateSeedPdfs() {
  if (!fs.existsSync(SEED_PDFS_DIR)) return;
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!db.documents) db.documents = {};
  if (!db.pdfExercises) db.pdfExercises = {};
  let changed = false;
  const courseFolders = fs.readdirSync(SEED_PDFS_DIR);
  for (const courseCode of courseFolders) {
    const srcDir = path.join(SEED_PDFS_DIR, courseCode);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const fileName of fs.readdirSync(srcDir)) {
      const destPath = path.join(destDir, fileName);
      const alreadyRegistered = Object.values(db.documents).some(
        (d) => d.courseCode === courseCode && d.fileName === fileName
      );
      if (!alreadyRegistered) {
        if (!fs.existsSync(destPath)) fs.copyFileSync(path.join(srcDir, fileName), destPath);
        const id = `doc-${courseCode}-${fileName}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
        db.documents[id] = {
          id, courseCode, fileName, filePath: destPath,
          importedAt: new Date().toISOString(), seeded: true
        };
        changed = true;
      }
    }
  }
  if (changed) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

let mainWindow;
let tray = null;
let isQuitting = false;

function appIconPath() {
  const dir = path.join(__dirname, 'build');
  if (process.platform === 'win32') return path.join(dir, 'icon.ico');
  return path.join(dir, 'icon.png');
}

function createWindow() {
  const iconPath = appIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1f24',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    const s = readSettings();
    if (!isQuitting && s.minimizeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) return;
    let img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
    tray = new Tray(img);
    tray.setToolTip('StudyIDE');
    const menu = Menu.buildFromTemplate([
      { label: 'Afficher StudyIDE', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { type: 'separator' },
      { label: 'Quitter StudyIDE', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  } catch (e) {
    console.error('Impossible de créer l\'icône de la zone de notification :', e.message);
  }
}

app.whenReady().then(() => {
  ensureWorkspace();
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    const s = readSettings();
    if (s.minimizeToTray === false) app.quit();
  }
});

// ---------- IPC : données (matières / exercices) ----------

ipcMain.handle('db:get', () => readDB());

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

// ---------- IPC : fichiers ----------

ipcMain.handle('file:read', (evt, filePath) => {
  try {
    return { ok: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('file:write', (evt, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('file:openExternal', (evt, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('app:openUrl', (evt, url) => {
  shell.openExternal(url);
});

ipcMain.handle('file:importDialog', async (evt, courseCode) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Code', extensions: ['py', 'java', 'txt'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const src = res.filePaths[0];
  const dest = path.join(WORKSPACE_DIR, courseCode, path.basename(src));
  fs.copyFileSync(src, dest);
  return dest;
});

// ---------- IPC : Mode Projet (ouvrir un dossier, arborescence, terminal) ----------

const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'target', 'dist', 'build', '.idea', '.vscode']);

function statEntry(fullPath, name) {
  const st = fs.statSync(fullPath);
  return { name, path: fullPath, isDirectory: st.isDirectory(), size: st.isDirectory() ? 0 : st.size };
}

function listDirEntries(dirPath) {
  const names = fs.readdirSync(dirPath);
  const entries = names.map((name) => {
    try { return statEntry(path.join(dirPath, name), name); } catch (e) { return null; }
  }).filter(Boolean);
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });
  return entries.map((e) => ({ ...e, ignored: e.isDirectory && IGNORED_DIR_NAMES.has(e.name) }));
}

ipcMain.handle('project:openDialog', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  const rootPath = res.filePaths[0];
  const s = readSettings();
  s.lastProjectPath = rootPath;
  writeSettings(s);
  return { path: rootPath, name: path.basename(rootPath) };
});

ipcMain.handle('project:reopenLast', () => {
  const s = readSettings();
  if (s.lastProjectPath && fs.existsSync(s.lastProjectPath)) {
    return { path: s.lastProjectPath, name: path.basename(s.lastProjectPath) };
  }
  return null;
});

ipcMain.handle('project:readDir', (evt, dirPath) => {
  try {
    return { ok: true, entries: listDirEntries(dirPath) };
  } catch (e) {
    return { ok: false, error: e.message, entries: [] };
  }
});

ipcMain.handle('project:newFile', (evt, { dirPath, name }) => {
  try {
    const safeName = name.trim();
    if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
    const filePath = path.join(dirPath, safeName);
    if (fs.existsSync(filePath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
    fs.writeFileSync(filePath, '', 'utf-8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('project:newFolder', (evt, { dirPath, name }) => {
  try {
    const safeName = name.trim();
    if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
    const folderPath = path.join(dirPath, safeName);
    if (fs.existsSync(folderPath)) return { ok: false, error: 'Un fichier ou dossier porte déjà ce nom.' };
    fs.mkdirSync(folderPath, { recursive: true });
    return { ok: true, path: folderPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('project:rename', (evt, { oldPath, newName }) => {
  try {
    const safeName = newName.trim();
    if (!safeName || safeName.includes('/') || safeName.includes('\\')) return { ok: false, error: 'Nom invalide.' };
    const newPath = path.join(path.dirname(oldPath), safeName);
    fs.renameSync(oldPath, newPath);
    return { ok: true, path: newPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('project:delete', (evt, targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- IPC : Terminal intégré (console de commandes persistante) ----------
// Remarque : ceci est une "console" qui exécute des commandes ligne par ligne via
// un shell persistant (cmd.exe / bash), pas un vrai pseudo-terminal (pty). Les
// programmes interactifs plein écran (vim, htop...) ou colorés ne s'afficheront
// pas correctement, mais tout le reste (npm, git, python, javac...) fonctionne.

const terminals = new Map(); // id -> { proc, cwd }
let terminalSeq = 0;

function shellCommand() {
  if (process.platform === 'win32') return { cmd: 'cmd.exe', args: [] };
  return { cmd: process.env.SHELL || '/bin/bash', args: ['-i'] };
}

ipcMain.handle('terminal:start', (evt, { cwd }) => {
  const id = `term-${++terminalSeq}`;
  const { cmd, args } = shellCommand();
  const proc = spawn(cmd, args, {
    cwd: fs.existsSync(cwd) ? cwd : WORKSPACE_DIR,
    env: process.env,
    windowsHide: true
  });
  terminals.set(id, { proc, cwd });
  proc.stdout.on('data', (d) => {
    if (mainWindow) mainWindow.webContents.send('terminal:data', { id, chunk: d.toString() });
  });
  proc.stderr.on('data', (d) => {
    if (mainWindow) mainWindow.webContents.send('terminal:data', { id, chunk: d.toString() });
  });
  proc.on('exit', (code) => {
    if (mainWindow) mainWindow.webContents.send('terminal:exit', { id, code });
    terminals.delete(id);
  });
  return { ok: true, id };
});

ipcMain.handle('terminal:write', (evt, { id, data }) => {
  const t = terminals.get(id);
  if (!t) return { ok: false, error: 'Terminal introuvable.' };
  try {
    t.proc.stdin.write(data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('terminal:kill', (evt, { id }) => {
  const t = terminals.get(id);
  if (t) {
    try { t.proc.kill(); } catch (e) {}
    terminals.delete(id);
  }
  return { ok: true };
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const { proc } of terminals.values()) {
    try { proc.kill(); } catch (e) {}
  }
});

// ---------- IPC : exécution de code ----------

function checkTool(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let ok = false;
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(true));
  });
}

ipcMain.handle('run:checkEnv', async () => {
  const python = await checkTool(process.platform === 'win32' ? 'python' : 'python3', ['--version']);
  const java = await checkTool('java', ['-version']);
  const javac = await checkTool('javac', ['-version']);
  return { python, java, javac };
});

ipcMain.handle('run:execute', async (evt, { filePath, language }) => {
  return new Promise((resolve) => {
    const cwd = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    let child;
    let output = '';
    let errorOutput = '';

    if (language === 'python') {
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      child = spawn(pyCmd, [filePath], { cwd });
      pipe(child);
    } else if (language === 'java') {
      const compile = spawn('javac', [filePath], { cwd });
      let compileErr = '';
      compile.stderr.on('data', (d) => (compileErr += d.toString()));
      compile.on('error', (e) => resolve({ ok: false, output: '', error: `javac introuvable : ${e.message}` }));
      compile.on('exit', (code) => {
        if (code !== 0) {
          resolve({ ok: false, output: '', error: compileErr || 'Erreur de compilation.' });
          return;
        }
        child = spawn('java', ['-cp', cwd, baseName], { cwd });
        pipe(child);
      });
      return;
    } else {
      resolve({ ok: false, output: '', error: 'Langage non supporté.' });
      return;
    }

    function pipe(proc) {
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.stderr.on('data', (d) => (errorOutput += d.toString()));
      proc.on('error', (e) => resolve({ ok: false, output, error: `Impossible de lancer : ${e.message}` }));
      proc.on('exit', (code) => {
        resolve({ ok: code === 0, output, error: errorOutput, exitCode: code });
      });
    }
  });
});

const SETTINGS_FILE = path.join(WORKSPACE_DIR, 'studyide-settings.json');

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const initial = { localModelUrl: DEFAULT_MODEL_URL, localModelId: 'fast', iaEngine: 'auto', minimizeToTray: true };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (!s.localModelUrl) s.localModelUrl = DEFAULT_MODEL_URL;
    if (!s.localModelId) s.localModelId = 'fast';
    if (!s.iaEngine) s.iaEngine = 'auto';
    if (s.minimizeToTray === undefined) s.minimizeToTray = true;
    return s;
  } catch (e) {
    return { localModelUrl: DEFAULT_MODEL_URL, localModelId: 'fast', iaEngine: 'auto', minimizeToTray: true };
  }
}

function writeSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf-8');
}

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (evt, s) => { writeSettings(s); return readSettings(); });

// ---------- IPC : Mes notes (sélections enregistrées depuis l'éditeur) ----------
// Stocké en clair dans ~/StudyIDE/data-note.txt : lisible/éditable même en dehors
// de l'appli, et facile à retrouver pendant un exercice, un DS ou un projet futur.

const NOTES_FILE = path.join(WORKSPACE_DIR, 'data-note.txt');

function noteHeader(meta) {
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const parts = [date];
  if (meta.courseCode) parts.push(meta.courseCode);
  if (meta.source) parts.push(meta.source);
  return `=== ${parts.join(' · ')} ===`;
}

function parseNoteBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const m = /^=== (.+) ===$/.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { header: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks; // ordre chronologique croissant (le plus ancien en premier)
}

ipcMain.handle('notes:append', (evt, { text, courseCode, source }) => {
  try {
    if (!text || !text.trim()) return { ok: false, error: 'Sélectionne du texte avant d\'enregistrer.' };
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    const block = `${noteHeader({ courseCode, source })}\n${text.trim()}\n\n`;
    fs.appendFileSync(NOTES_FILE, block, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('notes:list', () => {
  try {
    if (!fs.existsSync(NOTES_FILE)) return { ok: true, notes: [] };
    const content = fs.readFileSync(NOTES_FILE, 'utf-8');
    const blocks = parseNoteBlocks(content);
    const notes = blocks.map((b, i) => ({
      id: i,
      header: b.header,
      text: b.lines.join('\n').replace(/\n+$/, '')
    }));
    notes.reverse(); // les plus récentes en premier
    return { ok: true, notes };
  } catch (e) {
    return { ok: false, error: e.message, notes: [] };
  }
});

ipcMain.handle('notes:deleteAt', (evt, { id }) => {
  try {
    if (!fs.existsSync(NOTES_FILE)) return { ok: true };
    const content = fs.readFileSync(NOTES_FILE, 'utf-8');
    const blocks = parseNoteBlocks(content);
    blocks.splice(id, 1);
    const newContent = blocks.map((b) => `=== ${b.header} ===\n${b.lines.join('\n').replace(/\n+$/, '')}\n\n`).join('');
    fs.writeFileSync(NOTES_FILE, newContent, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('notes:openFile', () => {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '', 'utf-8');
  shell.showItemInFolder(NOTES_FILE);
});

// ---------- IPC : Calcul de notes BUT (saisie manuelle + simulation, pas de scraping) ----------

const BUT_GRADES_FILE = path.join(WORKSPACE_DIR, 'but-grades.json');

// Structure pré-remplie d'après le relevé BUT Informatique — Semestre 5 A
// (coefficients repris tels quels ; l'étudiant peut tout modifier/ajouter/supprimer).
const DEFAULT_BUT_GRADES = {
  portalUrl: 'https://notes-iut.univ-lehavre.fr/',
  ues: [
    {
      id: 'ue-bin51', name: 'BIN51 — Réaliser un développement d\'application',
      resources: [
        { id: 'r1', name: 'BINR504 — Qualité algorithmique', coef: 4, grade: null },
        { id: 'r2', name: 'BINR505 — Programmation avancée', coef: 10, grade: null },
        { id: 'r3', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 6, grade: null },
        { id: 'r4', name: 'BINR507 — Automatisation de la chaîne de production', coef: 7, grade: null },
        { id: 'r5', name: 'BINR508 — Qualité de développement', coef: 4, grade: null },
        { id: 'r6', name: 'BINR509 — Virtualisation avancée', coef: 8, grade: null },
        { id: 'r7', name: 'BINR510 — Nouveaux paradigmes de base de données', coef: 13, grade: null },
        { id: 'r8', name: 'BINR513 — Économie durable et numérique', coef: 4, grade: null },
        { id: 'r9', name: 'BINR514 — Anglais', coef: 4, grade: null },
        { id: 'r10', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    },
    {
      id: 'ue-bin52', name: 'BIN52 — Optimiser des applications',
      resources: [
        { id: 'r11', name: 'BINR504 — Qualité algorithmique', coef: 6, grade: null },
        { id: 'r12', name: 'BINR505 — Programmation avancée', coef: 7, grade: null },
        { id: 'r13', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 7, grade: null },
        { id: 'r14', name: 'BINR508 — Qualité de développement', coef: 3, grade: null },
        { id: 'r15', name: 'BINR509 — Virtualisation avancée', coef: 4, grade: null },
        { id: 'r16', name: 'BINR510 — Nouveaux paradigmes de base de données', coef: 4, grade: null },
        { id: 'r17', name: 'BINR511 — Méthodes d\'optimisation pour l\'aide à la décision', coef: 9, grade: null },
        { id: 'r18', name: 'BINR512 — Modélisations mathématiques', coef: 16, grade: null },
        { id: 'r19', name: 'BINR514 — Anglais', coef: 4, grade: null },
        { id: 'r20', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    },
    {
      id: 'ue-bin56', name: 'BIN56 — Collaborer au sein d\'une équipe informatique',
      resources: [
        { id: 'r21', name: 'BINR501 — Initiation management équipe informatique', coef: 11, grade: null },
        { id: 'r22', name: 'BINR502 — PPP', coef: 6, grade: null },
        { id: 'r23', name: 'BINR503 — Politique de communication', coef: 15, grade: null },
        { id: 'r24', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 4, grade: null },
        { id: 'r25', name: 'BINR507 — Automatisation de la chaîne de production', coef: 3, grade: null },
        { id: 'r26', name: 'BINR513 — Économie durable et numérique', coef: 8, grade: null },
        { id: 'r27', name: 'BINR514 — Anglais', coef: 13, grade: null },
        { id: 'r28', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    }
  ]
};

ipcMain.handle('but:getGrades', () => {
  if (!fs.existsSync(BUT_GRADES_FILE)) {
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(DEFAULT_BUT_GRADES, null, 2), 'utf-8');
    return DEFAULT_BUT_GRADES;
  }
  try {
    return JSON.parse(fs.readFileSync(BUT_GRADES_FILE, 'utf-8'));
  } catch (e) {
    return DEFAULT_BUT_GRADES;
  }
});

ipcMain.handle('but:setGrades', (evt, data) => {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return { ok: true };
});

ipcMain.handle('but:resetGrades', () => {
  fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(DEFAULT_BUT_GRADES, null, 2), 'utf-8');
  return DEFAULT_BUT_GRADES;
});

// ---------- IPC : export / sauvegarde de toutes les données ----------
// Copie le dossier de travail complet (exercices, cours, notes, calcul BUT)
// vers un emplacement choisi par l'utilisateur. Les modèles d'IA locale
// (plusieurs Go, retéléchargeables) sont exclus pour rester léger et rapide.

ipcMain.handle('backup:export', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choisis où exporter tes données StudyIDE'
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

  const destRoot = res.filePaths[0];
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const destDir = path.join(destRoot, `StudyIDE-export-${stamp}`);

  try {
    fs.cpSync(WORKSPACE_DIR, destDir, {
      recursive: true,
      filter: (srcPath) => {
        const rel = path.relative(WORKSPACE_DIR, srcPath);
        return rel !== 'models' && !rel.startsWith('models' + path.sep);
      }
    });
    return { ok: true, path: destDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- IPC : raccourci sur le bureau ----------

ipcMain.handle('app:createDesktopShortcut', async () => {
  try {
    const desktopDir = path.join(os.homedir(), 'Desktop');
    if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
    const appDir = app.getAppPath();

    if (process.platform === 'win32') {
      const targetPath = path.join(appDir, 'Lancer-StudyIDE.bat');
      const iconPath = path.join(appDir, 'build', 'icon.ico');
      const shortcutPath = path.join(desktopDir, 'StudyIDE.lnk');
      const esc = (s) => s.replace(/'/g, "''");
      const lines = [
        '$ws = New-Object -ComObject WScript.Shell',
        `$s = $ws.CreateShortcut('${esc(shortcutPath)}')`,
        `$s.TargetPath = '${esc(targetPath)}'`,
        `$s.WorkingDirectory = '${esc(appDir)}'`
      ];
      if (fs.existsSync(iconPath)) lines.push(`$s.IconLocation = '${esc(iconPath)}'`);
      lines.push("$s.Description = 'StudyIDE'", '$s.Save()');
      const psScript = lines.join('; ');

      await new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], (err, stdout, stderr) => {
          if (err) reject(new Error(stderr?.toString() || err.message));
          else resolve();
        });
      });
      return { ok: true, path: shortcutPath };
    }

    if (process.platform === 'linux') {
      const targetPath = path.join(appDir, 'lancer-studyide.run');
      const iconPath = path.join(appDir, 'build', 'icon.png');
      const entry = `[Desktop Entry]\nType=Application\nName=StudyIDE\nComment=Assistant de code et organisateur de cours (Semestre 5)\nExec="${targetPath}"\nIcon=${iconPath}\nTerminal=true\nCategories=Development;Education;\n`;

      const shortcutPath = path.join(desktopDir, 'StudyIDE.desktop');
      fs.writeFileSync(shortcutPath, entry, 'utf-8');
      fs.chmodSync(shortcutPath, 0o755);

      // Copie aussi dans le menu d'applications : plus fiable selon les environnements de bureau
      const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
      fs.mkdirSync(appsDir, { recursive: true });
      const appsEntryPath = path.join(appsDir, 'studyide.desktop');
      fs.writeFileSync(appsEntryPath, entry, 'utf-8');
      fs.chmodSync(appsEntryPath, 0o755);

      return { ok: true, path: shortcutPath, needsTrust: true };
    }

    return { ok: false, error: 'Création automatique de raccourci non prise en charge sur cette plateforme.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- IPC : cache du texte extrait des PDF (pour la recherche IA) ----------

ipcMain.handle('docs:savePageText', (evt, { documentId, pages }) => {
  const db = readDB();
  if (db.documents[documentId]) {
    db.documents[documentId].pages = pages; // tableau de string, 1 par page
    writeDB(db);
  }
  return db.documents[documentId];
});

ipcMain.handle('app:getWorkspaceDir', () => WORKSPACE_DIR);

ipcMain.handle('docs:getSearchCorpus', () => {
  const db = readDB();
  const chunks = [];
  for (const doc of Object.values(db.documents)) {
    if (Array.isArray(doc.pages)) {
      doc.pages.forEach((text, idx) => {
        if (text && text.trim()) {
          chunks.push({
            type: 'document', courseCode: doc.courseCode, source: doc.fileName,
            page: idx + 1, text
          });
        }
      });
    }
  }
  for (const ex of Object.values(db.pdfExercises)) {
    const doc = db.documents[ex.documentId];
    const parts = [];
    if (ex.statement) parts.push('Énoncé : ' + ex.statement);
    if (ex.solution) parts.push('Solution : ' + ex.solution);
    if (ex.userNotes) parts.push('Notes perso : ' + ex.userNotes);
    if (parts.length) {
      chunks.push({
        type: 'exercise', courseCode: ex.courseCode,
        source: doc ? doc.fileName : ex.courseCode,
        page: ex.page, exerciseNumber: ex.number,
        text: parts.join('\n')
      });
    }
  }
  return chunks;
});

// ---------- IPC : documents PDF de cours ----------

ipcMain.handle('docs:listByCourse', (evt, courseCode) => {
  const db = readDB();
  return Object.values(db.documents).filter((d) => d.courseCode === courseCode);
});

ipcMain.handle('docs:readAsBase64', (evt, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    return { ok: true, base64: buf.toString('base64') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('docs:importDialog', async (evt, courseCode) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const src = res.filePaths[0];
  const fileName = path.basename(src);
  const destDir = path.join(WORKSPACE_DIR, courseCode, 'documents');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, fileName);
  fs.copyFileSync(src, destPath);

  const db = readDB();
  const id = `doc-${courseCode}-${fileName}-${Date.now()}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  db.documents[id] = { id, courseCode, fileName, filePath: destPath, importedAt: new Date().toISOString(), seeded: false };
  writeDB(db);
  return db.documents[id];
});

ipcMain.handle('docs:deleteDocument', (evt, { id, deleteFile }) => {
  const db = readDB();
  const doc = db.documents[id];
  if (doc) {
    if (deleteFile && fs.existsSync(doc.filePath)) {
      try { fs.unlinkSync(doc.filePath); } catch (e) {}
    }
    delete db.documents[id];
    for (const exId of Object.keys(db.pdfExercises)) {
      if (db.pdfExercises[exId].documentId === id) delete db.pdfExercises[exId];
    }
    writeDB(db);
  }
  return db;
});

// ---------- IPC : exercices détectés dans les PDF ----------

ipcMain.handle('pdfEx:saveDetected', (evt, { documentId, courseCode, exercises }) => {
  // exercises: [{ number, title, page, statement }]
  const db = readDB();
  // On ne recrée pas si déjà présent pour ce document (on garde d'éventuelles
  // notes déjà écrites par l'utilisateur), sauf si forcé.
  const already = Object.values(db.pdfExercises).some((e) => e.documentId === documentId);
  if (already) return db;

  const fileName = db.documents[documentId]?.fileName || '';
  for (const ex of exercises) {
    const id = `pex-${documentId}-${ex.number}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const solutionKey = `${fileName}::${ex.number}`;
    db.pdfExercises[id] = {
      id, documentId, courseCode,
      number: ex.number,
      title: ex.title || '',
      page: ex.page,
      statement: ex.statement || '',
      solution: SEED_SOLUTIONS[solutionKey] || '',
      userNotes: '',
      status: 'todo'
    };
  }
  writeDB(db);
  return db;
});

ipcMain.handle('pdfEx:listByDocument', (evt, documentId) => {
  const db = readDB();
  return Object.values(db.pdfExercises)
    .filter((e) => e.documentId === documentId)
    .sort((a, b) => Number(a.number) - Number(b.number));
});

ipcMain.handle('pdfEx:updateNotes', (evt, { id, userNotes }) => {
  const db = readDB();
  if (db.pdfExercises[id]) {
    db.pdfExercises[id].userNotes = userNotes;
    writeDB(db);
  }
  return db.pdfExercises[id];
});

ipcMain.handle('pdfEx:updateStatus', (evt, { id, status }) => {
  const db = readDB();
  if (db.pdfExercises[id]) {
    db.pdfExercises[id].status = status;
    writeDB(db);
  }
  return db.pdfExercises[id];
});
