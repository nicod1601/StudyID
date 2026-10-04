/**
 * IPC — terminal intégré.
 *
 * Ce n'est pas un vrai pseudo-terminal (pty) mais un shell persistant
 * (cmd.exe / bash) alimenté ligne par ligne. Les programmes interactifs
 * plein écran (vim, htop…) ne s'afficheront pas correctement, mais tout le
 * reste (npm, git, python, javac…) fonctionne.
 */

const fs = require('fs');
const { spawn } = require('child_process');

const { WORKSPACE_DIR } = require('./config');
const { getMainWindow } = require('./context');

const terminals = new Map(); // id -> { proc, cwd }
let terminalSeq = 0;

function shellCommand()
{
  if (process.platform === 'win32') return { cmd: 'cmd.exe', args: [] };
  return { cmd: process.env.SHELL || '/bin/bash', args: ['-i'] };
}

// Tue tous les terminaux encore ouverts (appelé à la fermeture de l'appli).
function killAll()
{
  for (const { proc } of terminals.values())
  {
    try { proc.kill(); } catch (e) {}
  }
}

function register(ipcMain)
{
  ipcMain.handle('terminal:start', (evt, { cwd }) =>
  {
    const id = `term-${++terminalSeq}`;
    const { cmd, args } = shellCommand();
    const proc = spawn(cmd, args,
    {
      cwd: fs.existsSync(cwd) ? cwd : WORKSPACE_DIR,
      env: process.env,
      windowsHide: true
    });

    terminals.set(id, { proc, cwd });

    const sendData = (chunk) =>
    {
      const win = getMainWindow();
      if (win) win.webContents.send('terminal:data', { id, chunk: chunk.toString() });
    };
    proc.stdout.on('data', sendData);
    proc.stderr.on('data', sendData);
    proc.on('exit', (code) =>
    {
      const win = getMainWindow();
      if (win) win.webContents.send('terminal:exit', { id, code });
      terminals.delete(id);
    });

    return { ok: true, id };
  });

  ipcMain.handle('terminal:write', (evt, { id, data }) =>
  {
    const t = terminals.get(id);
    if (!t) return { ok: false, error: 'Terminal introuvable.' };
    try { t.proc.stdin.write(data); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('terminal:kill', (evt, { id }) =>
  {
    const t = terminals.get(id);
    if (t)
    {
      try { t.proc.kill(); } catch (e) {}
      terminals.delete(id);
    }
    return { ok: true };
  });
}

module.exports = { register, killAll };
