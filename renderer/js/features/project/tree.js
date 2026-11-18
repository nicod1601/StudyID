// Mode Projet : arborescence paresseuse (rendu par paquets, un seul écouteur de clic).

// ---------------------------------------------------------------------
// Arborescence du projet
//  - chargement paresseux dossier par dossier, rendu par paquets de 250 lignes
//    (un dossier de 5 000 fichiers ne bloque plus l'interface)
//  - un seul écouteur de clic pour tout l'arbre
//  - reconstruction « hors écran » puis échange : pas de clignotement, le défilement est conservé
//  - dossiers dépliés et onglets mémorisés par projet
// ---------------------------------------------------------------------
let treeGen = 0;                 // invalide les rendus en cours (changement de projet, nouveau rafraîchissement)
const treeEntries = new Map();   // dossier -> entrées (pour « afficher plus »)
const TREE_CHUNK = 250;
let treeRefreshedAt = 0;
async function renderFileTree() {
  const container = el('fileTree');
  const gen = ++treeGen;
  if (!projectRoot) {
    container.innerHTML = '<div class="empty-hint" id="fileTreeEmpty">Ouvre un dossier de projet (ton dépôt Git, ton code VS Code, un projet Laravel…) pour voir son arborescence ici.</div>';
    return;
  }
  const scroll = container.scrollTop;
  const rootDiv = document.createElement('div');
  await buildTreeLevel(rootDiv, projectRoot.path, 0, gen);
  if (gen !== treeGen) return; // un rendu plus récent a pris la place
  container.replaceChildren(rootDiv);
  container.scrollTop = scroll;
  treeRefreshedAt = Date.now();
}
async function buildTreeLevel(parentEl, dirPath, depth, gen) {
  const res = await window.studyide.readProjectDir(dirPath);
  if (gen !== treeGen || !res.ok) return;
  treeEntries.set(dirPath, res.entries);
  await appendTreeRows(parentEl, dirPath, 0, depth, gen);
}
async function appendTreeRows(parentEl, dirPath, from, depth, gen) {
  const entries = treeEntries.get(dirPath) || [];
  const to = Math.min(entries.length, from + TREE_CHUNK);
  const frag = document.createDocumentFragment();
  const pending = [];
  for (let i = from; i < to; i++) {
    const entry = entries[i];
    const isOpen = entry.isDirectory && expandedDirs.has(entry.path);
    const row = document.createElement('div');
    row.className = 'ft-row' + (entry.ignored ? ' ft-ignored' : '') + (activeTabPath === entry.path ? ' active' : '');
    row.dataset.path = entry.path;
    row.dataset.name = entry.name;
    row.dataset.depth = depth;
    if (entry.isDirectory) row.dataset.dir = '1';
    row.style.paddingLeft = (6 + depth * 2) + 'px';
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
    frag.append(row, childWrap);
    if (isOpen) { // les dossiers déjà dépliés se chargent en parallèle
      childWrap.dataset.loaded = '1';
      pending.push(buildTreeLevel(childWrap, entry.path, depth + 1, gen));
    }
  }
  if (to < entries.length) {
    const more = document.createElement('div');
    more.className = 'ft-more';
    more.dataset.dirPath = dirPath;
    more.dataset.next = to;
    more.dataset.depth = depth;
    more.style.paddingLeft = (6 + depth * 2) + 'px';
    more.textContent = `… afficher ${Math.min(TREE_CHUNK, entries.length - to)} de plus (${entries.length - to} restants)`;
    frag.appendChild(more);
  }
  parentEl.appendChild(frag);
  await Promise.all(pending);
}
function bindTreeEvents() {
  el('fileTree').addEventListener('click', async (e) => {
    const more = e.target.closest('.ft-more');
    if (more) {
      const parent = more.parentElement;
      more.remove();
      await appendTreeRows(parent, more.dataset.dirPath, Number(more.dataset.next), Number(more.dataset.depth), treeGen);
      return;
    }
    const row = e.target.closest('.ft-row');
    if (!row) return;
    const p = row.dataset.path, name = row.dataset.name, depth = Number(row.dataset.depth);
    const act = e.target.closest('[data-act]');

    if (act) {
      e.stopPropagation();
      if (act.dataset.act === 'rename') {
        const newName = prompt('Nouveau nom :', name);
        if (!newName || newName === name) return;
        const r = await window.studyide.renameProjectEntry({ oldPath: p, newName });
        if (!r.ok) { alert(r.error); return; }
        renderFileTree();
      } else {
        if (!confirm(`Supprimer définitivement "${name}" ?`)) return;
        const r = await window.studyide.deleteProjectEntry(p);
        if (!r.ok) { alert(r.error); return; }
        const sep = p.includes('\\') ? '\\' : '/';
        openTabs.filter((t) => t.path === p || t.path.startsWith(p + sep)).forEach((t) => closeTab(t.path, true));
        renderFileTree();
      }
      return;
    }

    if (row.dataset.dir) {
      const childWrap = row.nextElementSibling;
      const nowOpen = !expandedDirs.has(p);
      if (nowOpen) expandedDirs.add(p); else expandedDirs.delete(p);
      row.querySelector('.ft-chevron').classList.toggle('open', nowOpen);
      row.querySelector('.ft-icon').textContent = iconFor(name, true, nowOpen);
      childWrap.style.display = nowOpen ? '' : 'none';
      saveProjectState();
      if (nowOpen && !childWrap.dataset.loaded) {
        childWrap.dataset.loaded = '1';
        childWrap.innerHTML = '<div class="ft-loading">⏳ Chargement…</div>';
        const gen = treeGen;
        const tmp = document.createElement('div');
        await buildTreeLevel(tmp, p, depth + 1, gen);
        if (gen === treeGen) childWrap.replaceChildren(...tmp.childNodes);
      }
    } else {
      openFileInTab(p, name);
    }
  });
}
