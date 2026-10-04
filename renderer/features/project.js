/**
 * Mode Projet : ouvrir un dossier (comme VS Code), parcourir son arborescence,
 * éditer plusieurs fichiers en onglets, et exécuter via un terminal intégré.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { askText } from '../core/ask.js';
import { applyEditorSettings } from './editor-settings.js';
import { updateProjectNoteBtnState } from './notes.js';

let projectRoot = null;       // { path, name }
let projectStarted = false;   // évite de réinitialiser à chaque changement de mode
let openTabs = [];            // [{ path, name, ext, dirty, value, mode, scrollInfo, cursor, loading }]
let activeTabPath = null;
let expandedDirs = new Set(); // chemins des dossiers actuellement dépliés
let terminalId = null;

const isWindows = window.studyide.platform === 'win32';

const EXT_ICONS =
{
  py: '🐍', java: '☕', js: '🟨', mjs: '🟨', cjs: '🟨', jsx: '🟨',
  ts: '🔷', tsx: '🔷', html: '🌐', htm: '🌐', css: '🎨', json: '📋',
  md: '📝', sh: '🐚', bash: '🐚', sql: '🗄', php: '🐘', rs: '🦀',
  go: '🐹', rb: '💎', yml: '⚙', yaml: '⚙', txt: '📄', gitignore: '🚫',
  xml: '📰', c: '🔧', h: '🔧', cpp: '🔧'
};

const RUNNABLE_EXT = ['py', 'java', 'js', 'mjs', 'sh'];

function extOf(name)
{
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function iconFor(name, isDirectory, isOpenDir)
{
  if (isDirectory) return isOpenDir ? '📂' : '📁';
  return EXT_ICONS[extOf(name)] || '📄';
}

// Mode CodeMirror associé à une extension de fichier.
function cmModeFor(name)
{
  switch (extOf(name))
  {
    case 'py': return 'python';
    case 'java': return 'text/x-java';
    case 'js': case 'mjs': case 'cjs': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'text/typescript';
    case 'json': return 'application/json';
    case 'css': return 'css';
    case 'html': case 'htm': return 'htmlmixed';
    case 'xml': return 'xml';
    case 'md': case 'markdown': return 'markdown';
    case 'sh': case 'bash': return 'shell';
    case 'sql': return 'sql';
    case 'php': return 'php';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'rb': return 'ruby';
    case 'yml': case 'yaml': return 'yaml';
    default: return 'text/plain';
  }
}

// Infos nécessaires au bouton « Noter la sélection » (utilisé par notes.js).
export function getActiveTab()
{
  return openTabs.find((t) => t.path === activeTabPath) || null;
}

export function getProjectRoot()
{
  return projectRoot;
}

export async function initProjectMode()
{
  if (!state.pcm)
  {
    state.pcm = CodeMirror(el('projectEditorHost'),
    {
      value: '',
      theme: 'dracula',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      autoCloseBrackets: true,
      autoCloseTags: true,
      matchBrackets: true,
      styleActiveLine: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      mode: 'text/plain',
      readOnly: true,
      extraKeys: { 'Ctrl-S': saveActiveTab, 'Cmd-S': saveActiveTab }
    });

    state.pcm.on('change', () =>
    {
      const tab = getActiveTab();
      if (tab && !tab.loading) { tab.dirty = true; renderProjectTabs(); }
    });
    state.pcm.on('cursorActivity', updateProjectNoteBtnState);
    applyEditorSettings(state.pcm);
  }

  if (projectStarted) return;
  projectStarted = true;

  const last = await window.studyide.reopenLastProject();
  if (last) await openProjectFolder(last);
}

async function openProjectFolder(root)
{
  projectRoot = root;
  expandedDirs = new Set([root.path]);
  openTabs = [];
  activeTabPath = null;

  el('projectTitle').textContent = '🗂 ' + root.name;
  el('projectTitle').title = root.path;
  el('projectToolbar').classList.remove('hidden');
  el('projectEditorToolbar').classList.remove('hidden');

  renderProjectTabs();
  state.pcm.setValue('// Sélectionne un fichier à gauche pour l\'ouvrir');
  state.pcm.setOption('readOnly', true);
  el('runActiveFileBtn').disabled = true;

  await renderFileTree();
  startProjectTerminal();
}

async function renderFileTree()
{
  const container = el('fileTree');
  if (!projectRoot)
  {
    container.innerHTML = '<div class="empty-hint" id="fileTreeEmpty">Ouvre un dossier de projet (ton dépôt Git, ton code VS Code, etc.) pour voir son arborescence ici.</div>';
    return;
  }
  // On construit l'arbre à part, puis on remplace le contenu d'un coup : rendu
  // correct même si deux rafraîchissements se chevauchent.
  const rootUl = document.createElement('div');
  await buildTreeLevel(rootUl, projectRoot.path, 0);
  container.innerHTML = '';
  container.appendChild(rootUl);
}

async function buildTreeLevel(parentEl, dirPath, depth)
{
  const res = await window.studyide.readProjectDir(dirPath);
  if (!res.ok) return;

  for (const entry of res.entries)
  {
    const row = document.createElement('div');
    row.className = 'ft-row' + (entry.ignored ? ' ft-ignored' : '') + (activeTabPath === entry.path ? ' active' : '');
    row.style.paddingLeft = (6 + depth * 2) + 'px';

    const isOpen = entry.isDirectory && expandedDirs.has(entry.path);
    row.innerHTML = `
      <span class="ft-chevron${isOpen ? ' open' : ''}">${entry.isDirectory ? '▸' : ''}</span>
      <span class="ft-icon">${iconFor(entry.name, entry.isDirectory, isOpen)}</span>
      <span class="ft-name">${escapeHtml(entry.name)}</span>
      <span class="ft-row-actions">
        <button data-act="rename" title="Renommer">✎</button>
        <button data-act="delete" title="Supprimer">🗑</button>
      </span>`;

    const childWrap = document.createElement('div');
    childWrap.className = 'ft-children';
    childWrap.style.display = isOpen ? '' : 'none';

    row.onclick = async (e) =>
    {
      if (e.target.closest('.ft-row-actions')) return;

      if (entry.isDirectory)
      {
        const nowOpen = !expandedDirs.has(entry.path);
        if (nowOpen) expandedDirs.add(entry.path); else expandedDirs.delete(entry.path);
        row.querySelector('.ft-chevron').classList.toggle('open', nowOpen);
        childWrap.style.display = nowOpen ? '' : 'none';
        row.querySelector('.ft-icon').textContent = iconFor(entry.name, true, nowOpen);
        if (nowOpen && !childWrap.dataset.loaded)
        {
          childWrap.dataset.loaded = '1';
          await buildTreeLevel(childWrap, entry.path, depth + 1);
        }
      }
      else
      {
        await openFileInTab(entry.path, entry.name);
      }
    };

    row.querySelector('[data-act="rename"]').onclick = async (e) =>
    {
      e.stopPropagation();
      const name = await askText('Nouveau nom :', entry.name);
      if (!name || name === entry.name) return;
      const res2 = await window.studyide.renameProjectEntry({ oldPath: entry.path, newName: name });
      if (!res2.ok) { alert(res2.error); return; }
      renderFileTree();
    };

    row.querySelector('[data-act="delete"]').onclick = async (e) =>
    {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement "${entry.name}" ?`)) return;
      const res2 = await window.studyide.deleteProjectEntry(entry.path);
      if (!res2.ok) { alert(res2.error); return; }
      closeTab(entry.path, true);
      renderFileTree();
    };

    parentEl.appendChild(row);
    parentEl.appendChild(childWrap);

    if (entry.isDirectory && isOpen)
    {
      childWrap.dataset.loaded = '1';
      await buildTreeLevel(childWrap, entry.path, depth + 1);
    }
  }
}

async function openFileInTab(filePath, name)
{
  let tab = openTabs.find((t) => t.path === filePath);
  if (!tab)
  {
    const res = await window.studyide.readFile(filePath);
    if (!res.ok) { alert('Impossible d\'ouvrir ce fichier : ' + res.error); return; }
    tab = { path: filePath, name, ext: extOf(name), dirty: false, value: res.content, mode: cmModeFor(name) };
    openTabs.push(tab);
  }
  activateTab(filePath);
}

function activateTab(filePath)
{
  // Sauvegarde l'état du tab courant (contenu, scroll, curseur) avant de basculer.
  const prev = getActiveTab();
  if (prev)
  {
    prev.value = state.pcm.getValue();
    prev.scrollInfo = state.pcm.getScrollInfo();
    prev.cursor = state.pcm.getCursor();
  }

  activeTabPath = filePath;
  const tab = openTabs.find((t) => t.path === filePath);
  if (!tab) return;

  tab.loading = true;
  state.pcm.setOption('readOnly', false);
  state.pcm.setOption('mode', tab.mode);
  state.pcm.setValue(tab.value);
  if (tab.cursor) state.pcm.setCursor(tab.cursor);
  if (tab.scrollInfo) state.pcm.scrollTo(tab.scrollInfo.left, tab.scrollInfo.top);
  state.pcm.focus();
  tab.loading = false;

  el('runActiveFileBtn').disabled = !RUNNABLE_EXT.includes(tab.ext);
  renderProjectTabs();
}

function renderProjectTabs()
{
  const bar = el('projectTabbar');
  bar.innerHTML = '';

  for (const tab of openTabs)
  {
    const t = document.createElement('div');
    t.className = 'project-tab' + (tab.path === activeTabPath ? ' active' : '');
    t.innerHTML = `
      <span class="pt-icon">${iconFor(tab.name, false)}</span>
      <span class="pt-name">${escapeHtml(tab.name)}</span>
      ${tab.dirty ? '<span class="pt-dirty"></span>' : ''}
      <button class="pt-close" title="Fermer">✕</button>`;

    t.onclick = (e) =>
    {
      if (e.target.closest('.pt-close')) return;
      activateTab(tab.path);
    };
    t.querySelector('.pt-close').onclick = (e) =>
    {
      e.stopPropagation();
      closeTab(tab.path);
    };
    bar.appendChild(t);
  }
}

function closeTab(filePath, skipConfirm)
{
  const tab = openTabs.find((t) => t.path === filePath);
  if (tab && tab.dirty && !skipConfirm)
  {
    if (!confirm(`"${tab.name}" a des modifications non enregistrées. Fermer quand même ?`)) return;
  }

  openTabs = openTabs.filter((t) => t.path !== filePath);

  if (activeTabPath !== filePath)
  {
    renderProjectTabs();
    return;
  }

  activeTabPath = null;
  if (openTabs.length)
  {
    activateTab(openTabs[openTabs.length - 1].path);
  }
  else
  {
    state.pcm.setValue('// Sélectionne un fichier à gauche pour l\'ouvrir');
    state.pcm.setOption('readOnly', true);
    el('runActiveFileBtn').disabled = true;
    renderProjectTabs();
  }
}

async function saveActiveTab()
{
  const tab = getActiveTab();
  if (!tab) return;
  tab.value = state.pcm.getValue();
  const res = await window.studyide.writeFile({ filePath: tab.path, content: tab.value });
  if (res.ok) { tab.dirty = false; renderProjectTabs(); }
  else alert('Erreur à l\'enregistrement : ' + res.error);
}

// ---- Terminal intégré ----

function termWrite(text)
{
  const out = el('terminalOutput');
  out.textContent += text;
  out.parentElement.scrollTop = out.parentElement.scrollHeight;
}

async function startProjectTerminal()
{
  if (terminalId)
  {
    try { await window.studyide.killTerminal(terminalId); } catch (e) {}
  }
  el('terminalOutput').textContent = '';
  el('terminalCwd').textContent = '— ' + (projectRoot ? projectRoot.path : '');

  const res = await window.studyide.startTerminal(projectRoot ? projectRoot.path : '');
  if (res.ok)
  {
    terminalId = res.id;
    termWrite(`Terminal démarré dans ${projectRoot.path}\n`);
  }
  else
  {
    termWrite('⚠️ Impossible de démarrer le terminal : ' + (res.error || '') + '\n');
  }
}

function runCommandInTerminal(cmd)
{
  if (!terminalId) return;
  el('projectTerminalPanel').classList.remove('collapsed');
  termWrite(`$ ${cmd}\n`);
  window.studyide.writeTerminal(terminalId, cmd + '\n');
}

function runActiveFileInTerminal()
{
  const tab = getActiveTab();
  if (!tab || !terminalId) return;

  const file = tab.path; // chemin absolu : fiable quel que soit le cwd courant
  let cmd;

  if (tab.ext === 'py')
  {
    cmd = `${isWindows ? 'python' : 'python3'} "${file}"`;
  }
  else if (tab.ext === 'js' || tab.ext === 'mjs')
  {
    cmd = `node "${file}"`;
  }
  else if (tab.ext === 'sh')
  {
    cmd = `bash "${file}"`;
  }
  else if (tab.ext === 'java')
  {
    const dir = tab.path.slice(0, tab.path.length - tab.name.length - 1);
    const className = tab.name.replace(/\.java$/, '');
    cmd = `javac "${file}" && java -cp "${dir}" ${className}`;
  }
  else
  {
    termWrite('Exécution directe non supportée pour ce type de fichier. Utilise le terminal ci-dessous.\n');
    return;
  }

  saveActiveTab();
  runCommandInTerminal(cmd);
}

export function bindProjectEvents()
{
  window.studyide.onTerminalData(({ id, chunk }) =>
  {
    if (id === terminalId) termWrite(chunk);
  });
  window.studyide.onTerminalExit(({ id, code }) =>
  {
    if (id === terminalId) { termWrite(`\n[processus terminé, code ${code}]\n`); terminalId = null; }
  });

  el('openProjectBtn').onclick = async () =>
  {
    const root = await window.studyide.openProjectDialog();
    if (root) await openProjectFolder(root);
  };

  el('projectRefreshBtn').onclick = () => renderFileTree();

  el('projectNewFileBtn').onclick = async () =>
  {
    if (!projectRoot) return;
    const name = await askText('Nom du nouveau fichier :', 'nouveau-fichier.txt');
    if (!name) return;
    const res = await window.studyide.newProjectFile({ dirPath: projectRoot.path, name });
    if (!res.ok) { alert(res.error); return; }
    await renderFileTree();
    openFileInTab(res.path, name);
  };

  el('projectNewFolderBtn').onclick = async () =>
  {
    if (!projectRoot) return;
    const name = await askText('Nom du nouveau dossier :', 'nouveau-dossier');
    if (!name) return;
    const res = await window.studyide.newProjectFolder({ dirPath: projectRoot.path, name });
    if (!res.ok) { alert(res.error); return; }
    renderFileTree();
  };

  el('runActiveFileBtn').onclick = runActiveFileInTerminal;
  el('restartTerminalBtn').onclick = () => startProjectTerminal();
  el('toggleTerminalBtn').onclick = () => el('projectTerminalPanel').classList.toggle('collapsed');

  el('terminalInput').addEventListener('keydown', (e) =>
  {
    if (e.key !== 'Enter') return;
    const val = e.target.value;
    e.target.value = '';
    if (!terminalId) return;
    termWrite(`$ ${val}\n`);
    window.studyide.writeTerminal(terminalId, val + '\n');
  });
}
