// Mode Projet : ouverture d'un dossier et mémoire par projet (dossiers dépliés, onglets).

// =====================================================================
// MODE PROJET : ouvrir un dossier (compatible VS Code), arborescence,
// onglets multi-fichiers, terminal intégré
// =====================================================================

let pcm = null;               // instance CodeMirror du mode Projet
let projectRoot = null;       // { path, name }
let projectStarted = false;   // évite de réinitialiser à chaque switchMode
let openTabs = [];            // [{ path, name, ext, dirty, value, mode, scrollInfo, cursor }]
let activeTabPath = null;
let expandedDirs = new Set(); // chemins de dossiers actuellement dépliés
let projectNav = null;        // fil d'Ariane / barre d'état / symboles (editor-nav.js)
let projectTerms = null;
async function initProjectMode() {
  if (!pcm) {
    await window.Lazy.editor(); // modes rares, autocomplétion, Emmet (chargés une seule fois)
    if (pcm) return; // un autre appel concurrent a déjà créé l'éditeur pendant l'attente
    pcm = CodeMirror(el('projectEditorHost'), {
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
      scrollbarStyle: 'simple',   // vraies barres de défilement (verticale + horizontale), toujours visibles et déplaçables
      scrollPastEnd: true,        // on peut faire défiler jusqu'à mettre la dernière ligne en haut
      cursorScrollMargin: 36,     // le curseur ne reste jamais collé au bord
      highlightSelectionMatches: { showToken: /[\w$#.-]/, annotateScrollbar: true, minChars: 2, delay: 150 },
      extraKeys: { 'Ctrl-S': saveActiveTab, 'Cmd-S': saveActiveTab }
    });
    pcm.on('change', () => {
      const tab = openTabs.find((t) => t.path === activeTabPath);
      if (!tab || tab.loading || !tab.doc) return;
      const dirty = !tab.doc.isClean(tab.cleanGen); // faux si on annule jusqu'à l'état enregistré
      if (dirty !== tab.dirty) { // la barre d'onglets n'est redessinée que si l'état change
        tab.dirty = dirty;
        renderProjectTabs();
      }
    });
    pcm.on('cursorActivity', updateProjectNoteBtnState);
    applyEditorSettings(pcm);
    // Outils dev web : Emmet, autocomplétion (Ctrl+Espace), auto-fermeture ` ' " ( [ {
    WebDev.enhanceEditor(pcm);
    WebDev.mountSymbolBar(el('projectSymbolBar'), () => pcm);
    projectNav = EditorNav.attach(pcm, {
      body: el('projectEditorBody'), crumb: el('projectBreadcrumb'), status: el('projectStatusBar')
    });
    EditorNav.initSplitter(el('projectTerminalPanel'), el('projectTermSplitter'));
    el('projectTabbar').addEventListener('wheel', (e) => { // molette = défilement horizontal des onglets
      if (e.deltaY && !e.deltaX) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; }
    }, { passive: false });
    projectTerms = new WebDev.TerminalTabs(el('projectTermHost'), el('projectTermTabs'), {
      getCwd: () => (projectRoot ? projectRoot.path : ''),
      onLocalLink: (uri) => { window.studyide.openUrl(uri); }
    });
  }
  // Un dossier choisi depuis la section Web devient le projet courant ici aussi
  const sharedRoot = WebDev.getRoot();
  if (sharedRoot && (!projectRoot || sharedRoot.path !== projectRoot.path)) {
    projectStarted = true;
    await openProjectFolder(sharedRoot);
    return;
  }
  if (projectStarted) return;
  projectStarted = true;

  const last = await window.studyide.reopenLastProject();
  if (last) await openProjectFolder(last);
}
async function openProjectFolder(root) {
  const saved = loadProjectState(root);
  projectRoot = root;
  expandedDirs = new Set([root.path, ...((saved && saved.expanded) || [])]);
  openTabs = [];
  activeTabPath = null;
  el('projectTitle').textContent = '🗂 ' + root.name;
  el('projectTitle').title = root.path;
  el('projectToolbar').classList.remove('hidden');
  el('projectEditorToolbar').classList.remove('hidden');
  el('projectSymbolBar').classList.remove('hidden');
  el('fileTree').innerHTML = '<div class="empty-hint">⏳ Ouverture du projet…</div>';
  renderProjectTabs();
  showNoFile();
  el('runActiveFileBtn').disabled = true;
  await renderFileTree();          // l'arborescence s'affiche dès que la racine est lue
  startProjectTerminal();          // le reste se prépare ensuite, sans bloquer
  WebDev.setRoot(root);
  restoreTabs(saved, root);
}
let saveStateTimer = null;
function saveProjectState() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    if (!projectRoot) return;
    try {
      localStorage.setItem('studyide.proj.' + projectRoot.path, JSON.stringify({
        expanded: [...expandedDirs].slice(0, 200),
        tabs: openTabs.map((t) => t.path).slice(0, 12),
        active: activeTabPath
      }));
    } catch (e) { /* ignoré */ }
  }, 400);
}
function loadProjectState(root) {
  try { return JSON.parse(localStorage.getItem('studyide.proj.' + root.path) || 'null'); } catch (e) { return null; }
}
