// Mode Projet : liaisons des boutons, de l'éditeur et du rafraîchissement automatique.

function bindProjectEvents() {
  bindTreeEvents();
  // En revenant sur la fenêtre (après un git pull, un artisan make:…), l'arbre se met à jour tout seul
  window.addEventListener('focus', () => {
    if (currentMode === 'projet' && projectRoot && Date.now() - treeRefreshedAt > 4000) renderFileTree();
  });
  el('openProjectBtn').onclick = async () => {
    const root = await window.studyide.openProjectDialog();
    if (!root) return;
    if (openTabs.some((t) => t.dirty) && !confirm('Des fichiers ont des modifications non enregistrées. Ouvrir un autre projet quand même ?')) return;
    await openProjectFolder(root);
  };

  el('projectRefreshBtn').onclick = () => renderFileTree();

  el('projectNewFileBtn').onclick = async () => {
    if (!projectRoot) return;
    const name = await askText('Nom du nouveau fichier :', 'nouveau-fichier.txt');
    if (!name) return;
    const res = await window.studyide.newProjectFile({ dirPath: projectRoot.path, name });
    if (!res.ok) { alert(res.error); return; }
    await renderFileTree();
    openFileInTab(res.path, name);
  };

  el('projectNewFolderBtn').onclick = async () => {
    if (!projectRoot) return;
    const name = await askText('Nom du nouveau dossier :', 'nouveau-dossier');
    if (!name) return;
    const res = await window.studyide.newProjectFolder({ dirPath: projectRoot.path, name });
    if (!res.ok) { alert(res.error); return; }
    renderFileTree();
  };

  el('runActiveFileBtn').onclick = runActiveFileInTerminal;

  el('restartTerminalBtn').onclick = () => { if (projectTerms) projectTerms.restartActive(); };
  el('newTerminalBtn').onclick = () => {
    el('projectTerminalPanel').classList.remove('collapsed');
    if (projectTerms) projectTerms.newTab(projectRoot ? projectRoot.path : '');
  };
  el('symbolToggleBtn').onclick = () => el('projectSymbolBar').classList.toggle('hidden');

  el('toggleTerminalBtn').onclick = () => {
    el('projectTerminalPanel').classList.toggle('collapsed');
  };
}
