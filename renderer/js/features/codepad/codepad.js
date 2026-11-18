// =====================================================================
// StudyIDE — « Code rapide » : snippets web à copier, insérer ou lancer
//  Deux cibles :
//   📄 Fichier actif  -> copier ou insérer le code au curseur de l'éditeur
//   🗂 Projet         -> créer un fichier dans le dossier du projet,
//                        ou lancer une commande dans le terminal
//  Disponible dans les sections Projet et Web (bouton ⚡) et via Ctrl+Maj+K.
//  Le catalogue vit dans codepad-snippets.js (facile à compléter).
// =====================================================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const modal = $('codePadModal');
  if (!modal) return;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LANG_OF_EXT = { html: 'html', htm: 'html', css: 'css', scss: 'css', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', json: 'json', sh: 'sh', bash: 'sh' };

  let target = 'file';   // 'file' | 'project'
  let category = '';     // '' = toutes
  let query = '';

  // ---------- Contexte : où on est, quel éditeur, quel projet ----------
  function context() {
    if (currentMode === 'projet') {
      const tab = openTabs.find((t) => t.path === activeTabPath);
      return {
        where: 'projet',
        editor: tab ? pcm : null,
        fileName: tab ? tab.name : null,
        ext: tab ? tab.ext : null,
        root: projectRoot ? projectRoot.path : null,
        rootName: projectRoot ? projectRoot.name : null,
        run: (cmd) => runCommandInTerminal(cmd),
        afterCreate: async (filePath, name) => { await renderFileTree(); await openFileInTab(filePath, name); }
      };
    }
    if (currentMode === 'web') {
      const root = window.WebDev.getRoot();
      return {
        where: 'web', editor: null, fileName: null, ext: null,
        root: root ? root.path : null,
        rootName: root ? (root.name || root.path) : null,
        run: (cmd) => window.WebDev.runInTerminal(cmd),
        afterCreate: async () => { window.WebDev.setRoot(root); }
      };
    }
    // Section Code : l'éditeur de l'exercice courant
    return {
      where: 'code',
      editor: currentExercise ? cm : null,
      fileName: currentExercise ? currentExercise.name : null,
      ext: currentExercise ? (currentExercise.language === 'java' ? 'java' : 'py') : null,
      root: null, rootName: null, run: null, afterCreate: null
    };
  }

  // ---------- Petits utilitaires ----------
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'cp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('📋 Copié dans le presse-papiers');
  }

  // ---------- Liste ----------
  function visibleSnippets(ctx) {
    const q = norm(query).split(/\s+/).filter(Boolean);
    const myLang = ctx.ext ? LANG_OF_EXT[ctx.ext] : null;
    let list = window.CODEPAD_SNIPPETS.filter((s) => (target === 'file' ? s.kind !== 'cmd' : s.kind !== 'code'));
    if (category) list = list.filter((s) => s.cat === category);
    if (q.length) list = list.filter((s) => { const hay = norm(`${s.title} ${s.desc} ${s.cat} ${s.lang} ${s.code}`); return q.every((t) => hay.includes(t)); });
    // Les snippets du même langage que le fichier ouvert passent en premier
    if (target === 'file' && myLang) list = list.slice().sort((a, b) => Number(b.lang === myLang) - Number(a.lang === myLang));
    return list;
  }

  function actionsFor(s, ctx) {
    const copy = `<button class="btn-ghost" data-act="copy">📋 Copier</button>`;
    if (target === 'file') {
      return copy + `<button class="btn-primary" style="width:auto" data-act="insert" ${ctx.editor ? '' : 'disabled title="Ouvre un fichier pour insérer"'}>↳ Insérer au curseur</button>`;
    }
    if (s.kind === 'cmd') {
      return copy + `<button class="btn-run" data-act="run" ${ctx.run && (ctx.root || ctx.where === 'web') ? '' : 'disabled title="Ouvre un projet d\'abord"'}>▶ Lancer</button>`;
    }
    return copy + `<button class="btn-primary" style="width:auto" data-act="create" ${ctx.root ? '' : 'disabled title="Ouvre un projet d\'abord"'}>＋ Créer ${esc(s.path || '')}</button>`;
  }

  function render() {
    const ctx = context();

    // Cible : sans éditeur disponible, on propose d'office le projet (sauf en section Code)
    document.querySelectorAll('#cpTarget .cp-target-btn').forEach((b) => b.classList.toggle('active', b.dataset.target === target));
    $('cpContext').innerHTML = target === 'file'
      ? (ctx.fileName ? `Insertion dans <b>${esc(ctx.fileName)}</b> — les snippets ${ctx.ext ? 'du même langage' : ''} sont en tête.` : 'Aucun fichier ouvert : tu peux copier le code, ou ouvrir un fichier (section Projet) pour l\'insérer.')
      : (ctx.root ? `Projet : <b>${esc(ctx.rootName)}</b> — les fichiers sont créés ici, les commandes tournent dans son terminal.` : 'Aucun projet ouvert : ouvre un dossier (section Projet ou Web) pour créer des fichiers et lancer des commandes.');

    // Catégories présentes pour la cible courante
    const pool = window.CODEPAD_SNIPPETS.filter((s) => (target === 'file' ? s.kind !== 'cmd' : s.kind !== 'code'));
    const cats = [...new Set(pool.map((s) => s.cat))];
    if (category && !cats.includes(category)) category = '';
    $('cpCats').innerHTML = [''].concat(cats).map((c) => `<button class="cp-cat${c === category ? ' active' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'Tout'}</button>`).join('');

    const list = visibleSnippets(ctx);
    if (!list.length) { $('cpList').innerHTML = '<div class="cp-empty">Aucun snippet ne correspond.</div>'; return; }
    $('cpList').innerHTML = list.map((s) => `
      <div class="cp-card" data-id="${esc(s.id)}">
        <div class="cp-card-head">
          <span class="cp-lang">${esc(s.kind === 'file' ? s.path : s.lang)}</span>
          <span class="cp-card-title">${esc(s.title)}</span>
          <span class="cp-card-desc">${esc(s.desc || '')}</span>
          <div class="cp-actions">${actionsFor(s, ctx)}</div>
        </div>
        <pre class="cp-code">${esc(s.code)}</pre>
      </div>`).join('');
  }

  // ---------- Actions ----------
  async function createInProject(s, ctx) {
    const rel = prompt('Où créer le fichier ? (chemin relatif au projet)', s.path || 'nouveau-fichier.txt');
    if (!rel) return;
    let res = await window.studyide.createProjectFile({ rootPath: ctx.root, relPath: rel, content: s.code });
    if (!res.ok && res.exists) {
      if (!confirm(`"${rel}" existe déjà. Le remplacer ?`)) return;
      res = await window.studyide.createProjectFile({ rootPath: ctx.root, relPath: rel, content: s.code, overwrite: true });
    }
    if (!res.ok) { alert(res.error); return; }
    close();
    await ctx.afterCreate(res.path, res.path.split(/[\\/]/).pop());
    toast(`✅ ${rel} créé`);
  }

  async function onAction(act, id) {
    const s = window.CODEPAD_SNIPPETS.find((x) => x.id === id);
    if (!s) return;
    const ctx = context();
    if (act === 'copy') return copyText(s.code);
    if (act === 'insert' && ctx.editor) {
      close();
      ctx.editor.replaceSelection(s.code);
      ctx.editor.focus();
      toast('↳ Code inséré');
    } else if (act === 'run' && ctx.run) {
      close();
      ctx.run(s.code);
    } else if (act === 'create' && ctx.root) {
      await createInProject(s, ctx);
    }
  }

  // ---------- Ouverture / fermeture ----------
  function open() {
    const ctx = context();
    // Cible par défaut : fichier si un éditeur est prêt, sinon projet
    target = ctx.editor ? 'file' : (ctx.root ? 'project' : 'file');
    category = ''; query = '';
    $('cpSearch').value = '';
    modal.classList.add('open');
    render();
    $('cpSearch').focus();
  }
  function close() { modal.classList.remove('open'); }

  $('cpCloseBtn').onclick = close;
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
  $('cpTarget').addEventListener('click', (e) => {
    const b = e.target.closest('.cp-target-btn');
    if (b) { target = b.dataset.target; render(); }
  });
  $('cpCats').addEventListener('click', (e) => {
    const b = e.target.closest('.cp-cat');
    if (b) { category = b.dataset.cat; render(); }
  });
  let t = null;
  $('cpSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value; render(); }, 90); });
  $('cpList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    onAction(btn.dataset.act, btn.closest('.cp-card').dataset.id);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) { e.preventDefault(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); modal.classList.contains('open') ? close() : open(); }
  });

  const openers = ['codePadBtn', 'webCodePadBtn'];
  openers.forEach((id) => { const b = $(id); if (b) b.onclick = open; });

  window.CodePad = { open, close };
})();
