'use strict';
// IPC : exécution de code (Java, Python…) et vérification de l'environnement.

const { ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// ---------- IPC : exécution de code ----------

function checkTool(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try { p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' }); } catch (e) { return finish(false); }
    const timer = setTimeout(() => { try { p.kill(); } catch (e) { /* ignoré */ } finish(false); }, 4000);
    p.on('error', () => { clearTimeout(timer); finish(false); });
    p.on('exit', () => { clearTimeout(timer); finish(true); });
  });
}

let envCache = null;

function register() {
   // { at, value }
  ipcMain.handle('run:checkEnv', async (evt, opts) => {
    if (envCache && !(opts && opts.refresh) && Date.now() - envCache.at < 60000) return envCache.value;
    // Les 3 vérifications se lancent en même temps (avant : l'une après l'autre, ~1 s au démarrage)
    const [python, java, javac] = await Promise.all([
      checkTool(process.platform === 'win32' ? 'python' : 'python3', ['--version']),
      checkTool('java', ['-version']),
      checkTool('javac', ['-version'])
    ]);
    const value = { python, java, javac };
    envCache = { at: Date.now(), value };
    return value;
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
}

module.exports = { register };
