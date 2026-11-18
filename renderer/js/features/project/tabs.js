// Mode Projet : onglets et documents CodeMirror.

// Rouvre les onglets du projet tels qu'on les avait laissés
async function restoreTabs(saved, root) {
  if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length) return;
  for (const p of saved.tabs.slice(0, 8)) {
    if (projectRoot !== root) return; // on a changé de projet entre-temps
    await openFileInTab(p, p.split(/[\\/]/).pop(), { silent: true, activate: false });
  }
  if (projectRoot !== root) return;
  const target = saved.active && openTabs.some((t) => t.path === saved.active) ? saved.active : (openTabs[0] && openTabs[0].path);
  if (target) activateTab(target);
}
async function openFileInTab(filePath, name, opts = {}) {
  let tab = openTabs.find((t) => t.path === filePath);
  if (!tab) {
    const res = await window.studyide.readProjectFile(filePath);
    if (!res.ok) { if (!opts.silent) notify('⚠ ' + res.error); return; }
    tab = openTabs.find((t) => t.path === filePath); // double-clic : l'onglet a pu être créé pendant la lecture
    if (!tab) {
      let mode = cmModeFor(name);
      // Gros fichier ou ligne géante (bundle minifié) : sans coloration, sinon l'éditeur se fige
      const heavy = res.size > 1048576 || (res.content.length > 200000 && /[^\n]{20000}/.test(res.content));
      if (heavy) {
        mode = 'text/plain';
        if (!opts.silent) notify('Fichier volumineux : coloration désactivée pour rester fluide.');
      }
      const doc = CodeMirror.Doc(res.content, mode); // un document par onglet : historique d'annulation, curseur et blocs repliés conservés
      tab = { path: filePath, name, ext: extOf(name), dirty: false, doc, cleanGen: doc.changeGeneration(), mode, heavy };
      openTabs.push(tab);
    }
  }
  if (opts.activate === false) { renderProjectTabs(); return; }
  activateTab(filePath);
}
function placeholderDoc() {
  return CodeMirror.Doc('// Sélectionne un fichier à gauche pour l\'ouvrir', 'text/plain');
}
function showNoFile() {
  pcm.swapDoc(placeholderDoc());
  pcm.setOption('readOnly', true);
  if (projectNav) projectNav.setActive(false);
}
function projectRelPath(absPath) {
  const root = projectRoot ? projectRoot.path : '';
  if (root && absPath.startsWith(root)) return absPath.slice(root.length).replace(/^[\\/]+/, '');
  return absPath;
}
function activateTab(filePath) {
  // Mémorise la position de défilement du fichier qu'on quitte (curseur et historique sont dans son document)
  const prev = openTabs.find((t) => t.path === activeTabPath);
  if (prev) prev.scrollInfo = pcm.getScrollInfo();
  activeTabPath = filePath;
  const tab = openTabs.find((t) => t.path === filePath);
  if (!tab) return;

  tab.loading = true;
  pcm.setOption('readOnly', false);
  if (pcm.getDoc() !== tab.doc) pcm.swapDoc(tab.doc);
  if (tab.scrollInfo) pcm.scrollTo(tab.scrollInfo.left, tab.scrollInfo.top);
  pcm.focus();
  tab.loading = false;

  if (projectNav) { projectNav.setFile(projectRelPath(tab.path), tab.ext); projectNav.setActive(true); }
  el('runActiveFileBtn').disabled = !['py', 'java', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'sh', 'html', 'htm'].includes(tab.ext);
  renderProjectTabs();
  highlightActiveInTree(filePath);
  saveProjectState();
}
function highlightActiveInTree(filePath) {
  document.querySelectorAll('#fileTree .ft-row').forEach((r) => r.classList.remove('active'));
  // Reconstruction simple : on remet juste la classe sur la ligne correspondant au nom courant
  // (l'arbre étant re-render au clic, un highlight exact n'est pas critique ici).
}
function renderProjectTabs() {
  const bar = el('projectTabbar');
  bar.innerHTML = '';
  for (const tab of openTabs) {
    const t = document.createElement('div');
    t.className = 'project-tab' + (tab.path === activeTabPath ? ' active' : '');
    t.innerHTML = `
      <span class="pt-icon">${iconFor(tab.name, false)}</span>
      <span class="pt-name">${escapeHtml(tab.name)}</span>
      ${tab.dirty ? '<span class="pt-dirty"></span>' : ''}
      <button class="pt-close" title="Fermer">✕</button>`;
    t.onclick = (e) => {
      if (e.target.closest('.pt-close')) return;
      activateTab(tab.path);
    };
    t.querySelector('.pt-close').onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.path);
    };
    bar.appendChild(t);
  }
  const activeEl = bar.querySelector('.project-tab.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function closeTab(filePath, skipConfirm) {
  const tab = openTabs.find((t) => t.path === filePath);
  if (tab && tab.dirty && !skipConfirm) {
    if (!confirm(`"${tab.name}" a des modifications non enregistrées. Fermer quand même ?`)) return;
  }
  openTabs = openTabs.filter((t) => t.path !== filePath);
  saveProjectState();
  if (activeTabPath === filePath) {
    activeTabPath = null;
    if (openTabs.length) {
      activateTab(openTabs[openTabs.length - 1].path);
    } else {
      showNoFile();
      el('runActiveFileBtn').disabled = true;
      renderProjectTabs();
    }
  } else {
    renderProjectTabs();
  }
}
async function saveActiveTab() {
  const tab = openTabs.find((t) => t.path === activeTabPath);
  if (!tab) return;
  const gen = tab.doc.changeGeneration(); // état au moment de l'enregistrement
  const res = await window.studyide.writeFile({ filePath: tab.path, content: tab.doc.getValue() });
  if (res.ok) { tab.cleanGen = gen; tab.dirty = !tab.doc.isClean(gen); renderProjectTabs(); }
  else alert('Erreur à l\'enregistrement : ' + res.error);
}
