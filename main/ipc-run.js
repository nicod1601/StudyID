/**
 * IPC — détection de l'environnement et exécution de code (Python / Java).
 */

const path = require('path');
const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const pythonCmd = isWindows ? 'python' : 'python3';

// Teste la présence d'un outil : résout false si le binaire est introuvable.
function checkTool(cmd, args = ['--version'])
{
  return new Promise((resolve) =>
  {
    const p = spawn(cmd, args);
    p.on('error', () => resolve(false));
    p.on('exit', () => resolve(true));
  });
}

function register(ipcMain)
{
  ipcMain.handle('run:checkEnv', async () =>
  {
    const python = await checkTool(pythonCmd, ['--version']);
    const java = await checkTool('java', ['-version']);
    const javac = await checkTool('javac', ['-version']);
    return { python, java, javac };
  });

  ipcMain.handle('run:execute', (evt, { filePath, language }) =>
    new Promise((resolve) =>
    {
      const cwd = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));
      let output = '';
      let errorOutput = '';

      // Branche la sortie d'un process enfant sur la réponse.
      function pipe(proc)
      {
        proc.stdout.on('data', (d) => (output += d.toString()));
        proc.stderr.on('data', (d) => (errorOutput += d.toString()));
        proc.on('error', (e) => resolve({ ok: false, output, error: `Impossible de lancer : ${e.message}` }));
        proc.on('exit', (code) => resolve({ ok: code === 0, output, error: errorOutput, exitCode: code }));
      }

      if (language === 'python')
      {
        pipe(spawn(pythonCmd, [filePath], { cwd }));
        return;
      }

      if (language === 'java')
      {
        const compile = spawn('javac', [filePath], { cwd });
        let compileErr = '';
        compile.stderr.on('data', (d) => (compileErr += d.toString()));
        compile.on('error', (e) => resolve({ ok: false, output: '', error: `javac introuvable : ${e.message}` }));
        compile.on('exit', (code) =>
        {
          if (code !== 0)
          {
            resolve({ ok: false, output: '', error: compileErr || 'Erreur de compilation.' });
            return;
          }
          pipe(spawn('java', ['-cp', cwd, baseName], { cwd }));
        });
        return;
      }

      resolve({ ok: false, output: '', error: 'Langage non supporté.' });
    }));
}

module.exports = { register };
