/**
 * IPC — divers système : dossier de travail, focus fenêtre, export des données,
 * création d'un raccourci sur le bureau.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, dialog } = require('electron');
const { execFile } = require('child_process');

const { WORKSPACE_DIR } = require('./config');
const { ensureDir } = require('./store');
const { getMainWindow } = require('./context');

// Copie le workspace complet vers un dossier choisi, en excluant les modèles
// d'IA (plusieurs Go, retéléchargeables) pour rester léger.
async function exportData()
{
  const res = await dialog.showOpenDialog(getMainWindow(),
  {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choisis où exporter tes données StudyIDE'
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const destDir = path.join(res.filePaths[0], `StudyIDE-export-${stamp}`);

  try
  {
    fs.cpSync(WORKSPACE_DIR, destDir,
    {
      recursive: true,
      filter: (srcPath) =>
      {
        const rel = path.relative(WORKSPACE_DIR, srcPath);
        return rel !== 'models' && !rel.startsWith('models' + path.sep);
      }
    });
    return { ok: true, path: destDir };
  }
  catch (e)
  {
    return { ok: false, error: e.message };
  }
}

// Crée un raccourci sur le bureau (PowerShell sous Windows, .desktop sous Linux).
async function createDesktopShortcut()
{
  try
  {
    const desktopDir = path.join(os.homedir(), 'Desktop');
    ensureDir(desktopDir);
    const appDir = app.getAppPath();

    if (process.platform === 'win32')
    {
      const targetPath = path.join(appDir, 'Lancer-StudyIDE.bat');
      const iconPath = path.join(appDir, 'build', 'icon.ico');
      const shortcutPath = path.join(desktopDir, 'StudyIDE.lnk');
      const esc = (s) => s.replace(/'/g, "''");

      const lines =
      [
        '$ws = New-Object -ComObject WScript.Shell',
        `$s = $ws.CreateShortcut('${esc(shortcutPath)}')`,
        `$s.TargetPath = '${esc(targetPath)}'`,
        `$s.WorkingDirectory = '${esc(appDir)}'`
      ];
      if (fs.existsSync(iconPath)) lines.push(`$s.IconLocation = '${esc(iconPath)}'`);
      lines.push("$s.Description = 'StudyIDE'", '$s.Save()');

      await new Promise((resolve, reject) =>
      {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', lines.join('; ')], (err, stdout, stderr) =>
        {
          if (err) reject(new Error(stderr?.toString() || err.message));
          else resolve();
        });
      });
      return { ok: true, path: shortcutPath };
    }

    if (process.platform === 'linux')
    {
      const targetPath = path.join(appDir, 'lancer-studyide.run');
      const iconPath = path.join(appDir, 'build', 'icon.png');
      const entry = `[Desktop Entry]\nType=Application\nName=StudyIDE\nComment=Assistant de code et organisateur de cours (Semestre 5)\nExec="${targetPath}"\nIcon=${iconPath}\nTerminal=true\nCategories=Development;Education;\n`;

      const shortcutPath = path.join(desktopDir, 'StudyIDE.desktop');
      fs.writeFileSync(shortcutPath, entry, 'utf-8');
      fs.chmodSync(shortcutPath, 0o755);

      // Copie aussi dans le menu d'applications : plus fiable selon les bureaux.
      const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
      ensureDir(appsDir);
      const appsEntryPath = path.join(appsDir, 'studyide.desktop');
      fs.writeFileSync(appsEntryPath, entry, 'utf-8');
      fs.chmodSync(appsEntryPath, 0o755);

      return { ok: true, path: shortcutPath, needsTrust: true };
    }

    return { ok: false, error: 'Création automatique de raccourci non prise en charge sur cette plateforme.' };
  }
  catch (e)
  {
    return { ok: false, error: e.message };
  }
}

function register(ipcMain)
{
  ipcMain.handle('app:getWorkspaceDir', () => WORKSPACE_DIR);

  ipcMain.handle('app:focusWindow', () =>
  {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });

  ipcMain.handle('backup:export', exportData);
  ipcMain.handle('app:createDesktopShortcut', createDesktopShortcut);
}

module.exports = { register };
