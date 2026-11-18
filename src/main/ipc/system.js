'use strict';
// IPC : sauvegarde des données, raccourci bureau, workspace et focus de la fenêtre.

const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { getMainWindow } = require('../core/window');
const { flushDB } = require('../core/db');
const { flushSettings } = require('../core/settings');
const { WORKSPACE_DIR } = require('../core/paths');

function register() {

  // ---------- IPC : export / sauvegarde de toutes les données ----------
  // Copie le dossier de travail complet (exercices, cours, notes, calcul BUT)
  // vers un emplacement choisi par l'utilisateur. Les modèles d'IA locale
  // (plusieurs Go, retéléchargeables) sont exclus pour rester léger et rapide.

  ipcMain.handle('backup:export', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choisis où exporter tes données StudyIDE'
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

    flushDB(); // l'export doit contenir les dernières modifications
    flushSettings();
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

  ipcMain.handle('app:getWorkspaceDir', () => WORKSPACE_DIR);

  ipcMain.handle('app:focusWindow', () => {
    if (!getMainWindow()) return;
    if (getMainWindow().isMinimized()) getMainWindow().restore();
    if (!getMainWindow().isVisible()) getMainWindow().show();
    getMainWindow().focus();
  });
}

module.exports = { register };
