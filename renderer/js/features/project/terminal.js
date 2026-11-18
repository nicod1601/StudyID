// Mode Projet : terminal intégré et exécution du fichier actif.

// ---- Terminal intégré (xterm.js + node-pty, voir webdev.js) ----

async function startProjectTerminal() {
  el('terminalCwd').textContent = projectRoot ? projectRoot.path : '';
  if (projectTerms) await projectTerms.reset(projectRoot ? projectRoot.path : '');
}
function runCommandInTerminal(cmd) {
  if (!projectTerms) return;
  el('projectTerminalPanel').classList.remove('collapsed');
  projectTerms.runCommand(cmd, projectRoot ? projectRoot.path : '');
}
function runActiveFileInTerminal() {
  const tab = openTabs.find((t) => t.path === activeTabPath);
  if (!tab || !projectTerms) return;
  const rel = tab.path; // chemins absolus : plus fiable, quel que soit le cwd courant
  const isWin = navigator.platform.toLowerCase().includes('win');
  let cmd;
  if (tab.ext === 'py') {
    cmd = `${isWin ? 'python' : 'python3'} "${rel}"`;
  } else if (tab.ext === 'html' || tab.ext === 'htm') {
    saveActiveTab();
    WebDev.previewFile(tab.path);
    return;
  } else if (tab.ext === 'js' || tab.ext === 'mjs' || tab.ext === 'cjs') {
    cmd = `node "${rel}"`;
  } else if (tab.ext === 'ts' || tab.ext === 'tsx') {
    cmd = `npx --yes tsx "${rel}"`;
  } else if (tab.ext === 'sh') {
    cmd = isWin ? `bash "${rel}"` : `bash "${rel}"`;
  } else if (tab.ext === 'java') {
    const dir = tab.path.slice(0, tab.path.length - tab.name.length - 1);
    const className = tab.name.replace(/\.java$/, '');
    cmd = `javac "${rel}" && java -cp "${dir}" ${className}`;
  } else {
    projectTerms.writeLocal('\x1b[33mExécution directe non supportée pour ce type de fichier. Utilise le terminal.\x1b[0m\n');
    return;
  }
  saveActiveTab();
  runCommandInTerminal(cmd);
}
