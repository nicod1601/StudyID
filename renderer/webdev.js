// =====================================================================
// StudyIDE — Développement Web (côté interface)
//  - TerminalTabs : vrai terminal (xterm.js) à onglets, branché sur node-pty
//  - Section "Web" : détection du framework, serveurs, aperçu, dépendances
//  - Outils d'éditeur : modes web, Emmet, autocomplétion, barre de symboles
// Exposé via window.WebDev (chargé avant renderer.js).
// =====================================================================
(function () {
  'use strict';

  const api = window.studyide;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ===================================================================
  // 1. TERMINAL (xterm.js)
  // ===================================================================
  const XTERM_THEME = {
    background: '#06070b', foreground: '#d6dcf0', cursor: '#4fe3ff', cursorAccent: '#06070b',
    selectionBackground: 'rgba(124,140,255,0.35)',
    black: '#1b2032', red: '#ff6b7a', green: '#7ee787', yellow: '#ffd479', blue: '#7c8cff',
    magenta: '#c3a9ff', cyan: '#4fe3ff', white: '#d6dcf0',
    brightBlack: '#565e7d', brightRed: '#ff8f9b', brightGreen: '#9bf0a3', brightYellow: '#ffe2a0',
    brightBlue: '#a0acff', brightMagenta: '#d6c4ff', brightCyan: '#9af0ff', brightWhite: '#f4f6fc'
  };
  const TERM_FONT = '"JetBrains Mono", "Cascadia Code", Consolas, "SF Mono", monospace';

  const xtermAvailable = () => typeof window.Terminal === 'function';
  const fitCtor = () => window.FitAddon && window.FitAddon.FitAddon;
  const linksCtor = () => window.WebLinksAddon && window.WebLinksAddon.WebLinksAddon;

  function openLink(uri, onLocalLink) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(uri) && onLocalLink) onLocalLink(uri);
    else api.openUrl(uri);
  }

  // Terminal en lecture seule pour afficher des logs (couleurs ANSI conservées)
  function makeLogTerm(host, onLocalLink) {
    const term = new window.Terminal({
      disableStdin: true, convertEol: true, cursorBlink: false, cursorStyle: 'underline',
      cursorInactiveStyle: 'none', scrollback: 8000, fontSize: 12, fontFamily: TERM_FONT,
      theme: { ...XTERM_THEME, cursor: XTERM_THEME.background }
    });
    const Fit = fitCtor();
    const fit = Fit ? new Fit() : null;
    if (fit) term.loadAddon(fit);
    const Links = linksCtor();
    if (Links) term.loadAddon(new Links((e, uri) => openLink(uri, onLocalLink)));
    term.open(host);
    const doFit = () => { try { if (host.offsetWidth > 0 && host.offsetHeight > 0) fit && fit.fit(); } catch (e) { /* caché */ } };
    new ResizeObserver(debounce(doFit, 60)).observe(host);
    return { term, fit: doFit };
  }

  // --- Routage global des événements du PTY vers l'onglet concerné ---
  const sessions = new Map(); // ptyId -> tab
  const pendingData = new Map();
  let globalBound = false;
  function bindGlobalTerminalEvents() {
    if (globalBound) return;
    globalBound = true;
    api.onTerminalData(({ id, chunk }) => {
      const tab = sessions.get(id);
      if (tab) tab.receive(chunk);
      else (pendingData.get(id) || pendingData.set(id, []).get(id)).push(chunk);
    });
    api.onTerminalExit(({ id, code }) => {
      const tab = sessions.get(id);
      if (tab) tab.exited(code);
    });
  }

  class TerminalTabs {
    constructor(hostEl, tabsEl, opts = {}) {
      this.host = hostEl;
      this.tabsEl = tabsEl;
      this.getCwd = opts.getCwd || (() => '');
      this.onLocalLink = opts.onLocalLink || null;
      this.tabs = [];
      this.active = null;
      this.seq = 0;
      bindGlobalTerminalEvents();
      new ResizeObserver(debounce(() => this.fitActive(), 60)).observe(this.host);
    }

    async newTab(cwd, title) {
      if (!xtermAvailable()) { this.host.textContent = 'xterm.js introuvable.'; return null; }
      const key = ++this.seq;
      const el = document.createElement('div');
      el.className = 'term-instance';
      this.host.appendChild(el);

      const term = new window.Terminal({
        cursorBlink: true, fontSize: 12.5, fontFamily: TERM_FONT, lineHeight: 1.15,
        scrollback: 10000, theme: XTERM_THEME, allowProposedApi: true, macOptionIsMeta: true
      });
      const Fit = fitCtor();
      const fit = Fit ? new Fit() : null;
      if (fit) term.loadAddon(fit);
      const Links = linksCtor();
      if (Links) term.loadAddon(new Links((e, uri) => openLink(uri, this.onLocalLink)));
      term.open(el);

      const tab = {
        key, el, term, fit, id: null, mode: 'pty', alive: false, line: '',
        title: title || `Terminal ${key}`, shell: ''
      };
      tab.receive = (chunk) => {
        term.write(tab.mode === 'pipe' ? chunk.replace(/\r?\n/g, '\r\n') : chunk);
      };
      tab.exited = (code) => {
        tab.alive = false;
        term.write(`\r\n\x1b[90m[processus terminé, code ${code}] — ferme l'onglet ou relance avec ⟳\x1b[0m\r\n`);
        this.renderTabs();
      };

      // Copier / coller : Ctrl+C copie s'il y a une sélection (sinon interruption normale)
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'c' && (term.hasSelection() || e.shiftKey)) {
          if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          return false;
        }
        return true;
      });

      term.onData((d) => {
        if (!tab.alive) return;
        if (tab.mode === 'pty') api.sendTerminalInput(tab.id, d);
        else this._pipeInput(tab, d);
      });
      term.onResize(({ cols, rows }) => { if (tab.alive && tab.mode === 'pty') api.resizeTerminal(tab.id, cols, rows); });

      this.tabs.push(tab);
      this.activate(tab);
      this._fit(tab);

      const res = await api.startTerminal({ cwd: cwd || this.getCwd(), cols: term.cols, rows: term.rows });
      if (!res.ok) {
        term.write(`\x1b[31mImpossible de démarrer le terminal : ${res.error || 'erreur inconnue'}\x1b[0m\r\n`);
        return tab;
      }
      tab.id = res.id;
      tab.mode = res.mode;
      tab.shell = res.shell;
      tab.alive = true;
      sessions.set(tab.id, tab);
      if (!title) tab.title = `${res.shell || 'shell'} ${key}`;
      if (res.mode === 'pipe') {
        term.write('\x1b[33mℹ Mode simplifié (node-pty indisponible) : pas de programmes interactifs ni de Ctrl+C.\x1b[0m\r\n');
      }
      const buffered = pendingData.get(tab.id);
      if (buffered) { pendingData.delete(tab.id); buffered.forEach((c) => tab.receive(c)); }
      if (res.mode === 'pty') api.resizeTerminal(tab.id, term.cols, term.rows);
      this.renderTabs();
      return tab;
    }

    // Mode pipe : édition de ligne locale (écho + retour arrière)
    _pipeInput(tab, d) {
      if (d.length > 1 && d.startsWith('\x1b')) return; // flèches, etc.
      for (const ch of d) {
        if (ch === '\r') { tab.term.write('\r\n'); api.writeTerminal(tab.id, tab.line + '\n'); tab.line = ''; }
        else if (ch === '\x7f' || ch === '\b') { if (tab.line.length) { tab.line = tab.line.slice(0, -1); tab.term.write('\b \b'); } }
        else if (ch === '\x03') { tab.term.write('^C\r\n'); tab.line = ''; }
        else if (ch >= ' ') { tab.line += ch; tab.term.write(ch); }
      }
    }

    _fit(tab) {
      try {
        if (this.host.offsetWidth > 0 && this.host.offsetHeight > 0 && tab.fit) tab.fit.fit();
      } catch (e) { /* conteneur caché */ }
    }

    fitActive() { if (this.active) this._fit(this.active); }

    activate(tab) {
      this.active = tab;
      this.tabs.forEach((t) => t.el.classList.toggle('active', t === tab));
      this.renderTabs();
      requestAnimationFrame(() => { this._fit(tab); tab.term.focus(); });
    }

    renderTabs() {
      if (!this.tabsEl) return;
      this.tabsEl.innerHTML = '';
      this.tabs.forEach((tab) => {
        const b = document.createElement('div');
        b.className = 'term-tab' + (tab === this.active ? ' active' : '') + (tab.alive ? '' : ' dead');
        b.innerHTML = `<span class="tt-title">${esc(tab.title)}</span><button class="tt-close" title="Fermer">✕</button>`;
        b.onclick = () => this.activate(tab);
        b.querySelector('.tt-close').onclick = (e) => { e.stopPropagation(); this.closeTab(tab); };
        this.tabsEl.appendChild(b);
      });
    }

    closeTab(tab) {
      if (tab.id) { api.killTerminal(tab.id); sessions.delete(tab.id); }
      try { tab.term.dispose(); } catch (e) { /* ignoré */ }
      tab.el.remove();
      this.tabs = this.tabs.filter((t) => t !== tab);
      if (this.active === tab) {
        this.active = null;
        if (this.tabs.length) this.activate(this.tabs[this.tabs.length - 1]);
      }
      this.renderTabs();
    }

    async ensure(cwd) {
      if (!this.tabs.length) await this.newTab(cwd);
      return this.active;
    }

    async runCommand(cmd, cwd) {
      const tab = this.active && this.active.alive ? this.active : await this.newTab(cwd);
      if (!tab || !tab.alive) return;
      if (tab.mode === 'pty') api.sendTerminalInput(tab.id, cmd + '\r');
      else { tab.term.write(cmd + '\r\n'); api.writeTerminal(tab.id, cmd + '\n'); }
      tab.term.focus();
    }

    writeLocal(text) { if (this.active) this.active.term.write(text.replace(/\r?\n/g, '\r\n')); }

    async restartActive() {
      const old = this.active;
      const cwd = this.getCwd();
      if (old) this.closeTab(old);
      await this.newTab(cwd);
    }

    async reset(cwd) {
      [...this.tabs].forEach((t) => this.closeTab(t));
      await this.newTab(cwd);
    }

    clearActive() { if (this.active) this.active.term.clear(); }
  }

  // ===================================================================
  // 2. ÉDITEUR : modes, Emmet, autocomplétion, barre de symboles
  // ===================================================================
  const FILE_MODES = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'text/jsx', ts: 'text/typescript', mts: 'text/typescript', cts: 'text/typescript', tsx: 'text/typescript-jsx',
    json: 'application/json', jsonc: 'application/json', json5: 'application/json', webmanifest: 'application/json',
    html: 'htmlmixed', htm: 'htmlmixed', xhtml: 'htmlmixed', svelte: 'htmlmixed', astro: 'htmlmixed',
    ejs: 'htmlmixed', njk: 'htmlmixed', liquid: 'htmlmixed',
    vue: 'text/x-vue',
    css: 'text/css', scss: 'text/x-scss', less: 'text/x-less', sass: 'sass', styl: 'stylus', pcss: 'text/css',
    xml: 'xml', svg: 'xml', xsl: 'xml', rss: 'xml',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    pug: 'pug', jade: 'pug', hbs: 'handlebars', handlebars: 'handlebars', coffee: 'coffeescript',
    toml: 'toml', env: 'properties', ini: 'properties', properties: 'properties', conf: 'properties',
    diff: 'diff', patch: 'diff',
    yml: 'yaml', yaml: 'yaml', sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', php: 'php',
    py: 'python', java: 'text/x-java', rs: 'rust', go: 'go', rb: 'ruby', graphql: 'javascript', gql: 'javascript'
  };
  const NAME_MODES = { dockerfile: 'dockerfile', '.env': 'properties', '.gitignore': 'shell', '.npmrc': 'properties', '.editorconfig': 'properties', '.prettierrc': 'application/json', '.eslintrc': 'application/json', '.babelrc': 'application/json' };

  function cmModeFor(name) {
    const lower = String(name).toLowerCase();
    if (NAME_MODES[lower]) return NAME_MODES[lower];
    if (lower.startsWith('.env')) return 'properties';
    const m = /\.([^.]+)$/.exec(lower);
    return (m && FILE_MODES[m[1]]) || null;
  }

  const EXTRA_ICONS = {
    jsx: '⚛', tsx: '⚛', vue: '💚', svelte: '🧡', astro: '🚀', scss: '🎨', sass: '🎨', less: '🎨', styl: '🎨',
    svg: '🖼', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', webp: '🖼', ico: '🖼',
    mdx: '📝', graphql: '🔗', gql: '🔗', env: '🔐', toml: '⚙', ini: '⚙', dockerfile: '🐳',
    pug: '🐶', hbs: '🧩', ejs: '🧩', lock: '🔒', wasm: '🧱'
  };

  function activeModeName(cm) {
    try { return cm.getModeAt(cm.getCursor()).name; } catch (e) { return ''; }
  }

  function showHint(cm) {
    if (!cm.showHint) return window.CodeMirror.Pass;
    const CM = window.CodeMirror;
    const name = activeModeName(cm);
    let fn = CM.hint.anyword;
    if (name === 'xml' && CM.hint.html) fn = CM.hint.html;
    else if (name === 'css' && CM.hint.css) fn = CM.hint.css;
    else if (name === 'javascript' && CM.hint.javascript) fn = CM.hint.javascript;
    cm.showHint({ hint: fn, completeSingle: false });
  }

  function enhanceEditor(cm) {
    if (!cm || cm.__webEnhanced) return;
    cm.__webEnhanced = true;
    const CM = window.CodeMirror;

    // Auto-fermeture : ( ) [ ] { } ' " ` — sans doubler devant du texte
    cm.setOption('autoCloseBrackets', { pairs: '()[]{}\'\'""``', closeBefore: ')]}\'":;>,`', triples: '', explode: '[]{}' });
    cm.setOption('autoCloseTags', true);

    const keys = Object.assign({}, cm.getOption('extraKeys') || {});
    if (CM.commands.emmetExpandAbbreviation) {
      keys.Tab = 'emmetExpandAbbreviation';
      keys.Esc = 'emmetResetAbbreviation';
      keys.Enter = 'emmetInsertLineBreak';
    }
    keys['Ctrl-Space'] = showHint;
    keys['Ctrl-J'] = showHint;
    keys['Ctrl-/'] = 'toggleComment';
    keys['Cmd-/'] = 'toggleComment';
    cm.setOption('extraKeys', keys);

    // Suggestions automatiques : balises HTML après "<", propriétés JS après "."
    cm.on('inputRead', (editor, change) => {
      if (change.origin !== '+input' || editor.state.completionActive) return;
      const ch = change.text[0];
      const name = activeModeName(editor);
      if ((name === 'xml' && ch === '<') || (name === 'javascript' && ch === '.')) {
        setTimeout(() => showHint(editor), 0);
      }
    });
  }

  const SYMBOLS = [
    // [label, début, fin (optionnel : entoure la sélection), info-bulle]
    ['{ }', '{', '}', 'Accolades'], ['[ ]', '[', ']', 'Crochets'], ['( )', '(', ')', 'Parenthèses'],
    ['< >', '<', '>', 'Chevrons'], ['<></>', '<>', '</>', 'Fragment JSX'],
    ['" "', '"', '"', 'Guillemets'], ["' '", "'", "'", 'Apostrophes'], ['` `', '`', '`', 'Backticks (template string)'],
    ['${ }', '${', '}', 'Interpolation'],
    ['=>', '=>', null, 'Fonction fléchée'], ['===', '===', null, 'Égalité stricte'], ['!==', '!==', null, 'Différent strict'],
    ['&&', '&&', null, 'ET logique'], ['||', '||', null, 'OU logique'], ['?.', '?.', null, 'Optional chaining'],
    ['??', '??', null, 'Nullish coalescing'], ['...', '...', null, 'Spread / rest'],
    ['\\', '\\', null, 'Antislash'], ['|', '|', null, 'Barre verticale'], ['~', '~', null, 'Tilde'],
    ['@', '@', null, 'Arobase'], ['#', '#', null, 'Dièse'], ['$', '$', null, 'Dollar'], ['_', '_', null, 'Underscore'],
    ['&', '&', null, 'Esperluette'], ['%', '%', null, 'Pourcent'], ['^', '^', null, 'Circonflexe'], ['*', '*', null, 'Astérisque'],
    ['/', '/', null, 'Slash'], [';', ';', null, 'Point-virgule'], [':', ':', null, 'Deux-points'],
    ['//', '// ', null, 'Commentaire ligne'], ['/* */', '/* ', ' */', 'Commentaire bloc'], ['<!-- -->', '<!-- ', ' -->', 'Commentaire HTML'],
    ['⇥ Tab', '\t', null, 'Tabulation']
  ];

  function insertSymbol(cm, open, close) {
    if (!cm || cm.getOption('readOnly')) return;
    if (close) {
      const sel = cm.getSelection();
      cm.replaceSelection(open + sel + close);
      if (!sel) { const c = cm.getCursor(); cm.setCursor({ line: c.line, ch: c.ch - close.length }); }
    } else {
      cm.replaceSelection(open);
    }
    cm.focus();
  }

  function mountSymbolBar(barEl, getCm) {
    barEl.innerHTML = '';
    SYMBOLS.forEach(([label, open, close, title]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'symbol-btn';
      b.textContent = label;
      b.title = title + (close ? ' (entoure la sélection)' : '');
      b.addEventListener('mousedown', (e) => e.preventDefault()); // garde le focus dans l'éditeur
      b.addEventListener('click', () => insertSymbol(getCm(), open, close));
      barEl.appendChild(b);
    });
  }

  // ===================================================================
  // 3. SECTION WEB
  // ===================================================================
  let root = null;       // { path, name } — partagé avec le mode Projet
  let info = null;       // résultat de web:detect
  let ready = false;
  const servers = new Map();
  let selectedServerId = null;
  let previewServerId = null;
  let busy = false;
  let pane = 'server';
  let device = 'desktop';
  let webview = null;
  let webviewReady = false;
  let serverLog = null;
  let taskLog = null;
  let webTerms = null;
  let consoleCount = 0;
  let pendingNewProject = null;

  const runCmd = (pm, script) => {
    if (pm === 'yarn') return `yarn ${script}`;
    if (pm === 'pnpm') return `pnpm run ${script}`;
    if (pm === 'bun') return `bun run ${script}`;
    return `npm run ${script}`;
  };

  function getRoot() { return root; }
  function setRoot(r) {
    root = r;
    info = null;
    if (ready && !$('webContent').classList.contains('hidden')) refresh();
  }

  async function refresh() {
    if (!root) { renderAll(); return; }
    const res = await api.webDetect(root.path);
    info = res && res.ok ? res : null;
    renderAll();
  }

  function renderAll() {
    const has = !!(root && info);
    $('webEmpty').classList.toggle('hidden', has);
    $('webProjectBody').classList.toggle('hidden', !has);
    $('webTitle').textContent = root ? '🌐 ' + root.name : '🌐 Développement Web';
    $('webTitle').title = root ? root.path : '';
    if (!has) return;
    renderProjectCard();
    renderRunActions();
    renderServers();
    renderScripts();
    renderDeps();
  }

  function renderProjectCard() {
    const fw = info.framework;
    const badge = fw
      ? `<span class="web-fw"><span class="web-fw-icon">${fw.icon}</span>${esc(fw.label)}</span>`
      : `<span class="web-fw web-fw-none">Framework non détecté</span>`;
    const pm = info.kind === 'node' ? `<span class="web-chip">${esc(info.pm)}</span>` : '';
    const warn = info.kind === 'node' && info.needsInstall
      ? `<div class="web-warn">⚠ <code>node_modules</code> absent — installe les dépendances avant de lancer.</div>` : '';
    $('webProjectCard').innerHTML =
      `<div class="web-card-row">${badge}${pm}</div><div class="web-path" title="${esc(info.root)}">${esc(info.root)}</div>${warn}`;
  }

  function renderRunActions() {
    const box = $('webRunActions');
    box.innerHTML = '';
    const add = (label, cls, fn, title) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = label; if (title) b.title = title; b.onclick = fn;
      box.appendChild(b);
    };
    if (info.devCommand) add(`▶ Lancer — ${info.devCommand}`, 'btn-run web-run-btn', () => startDev());
    add('🌐 Serveur statique (live reload)', 'btn-ghost web-outline-btn', () => startStatic(), 'Sert le dossier tel quel et recharge la page à chaque modification');
    if (info.kind === 'node' && info.needsInstall) add('⬇ Installer les dépendances', 'btn-ghost web-outline-btn', () => runNpm('install'));
  }

  function statusLabel(s) { return ({ starting: 'démarrage…', running: 'en ligne', stopped: 'arrêté', error: 'erreur' })[s] || s; }

  function renderServers() {
    const box = $('webServers');
    box.innerHTML = '';
    if (!servers.size) { box.innerHTML = '<div class="empty-hint web-small">Aucun serveur lancé.</div>'; return; }
    [...servers.values()].forEach((s) => {
      const row = document.createElement('div');
      row.className = 'web-server' + (s.id === selectedServerId ? ' selected' : '');
      const live = s.status === 'starting' || s.status === 'running';
      row.innerHTML =
        `<div class="ws-top"><span class="ws-dot ${esc(s.status)}"></span><span class="ws-name" title="${esc(s.command)}">${esc(s.name)}</span>` +
        `<span class="ws-status">${statusLabel(s.status)}</span></div>` +
        (s.url ? `<a class="ws-url" href="#">${esc(s.url)}</a>` : '') +
        `<div class="ws-actions">` +
        (live ? `<button data-a="stop" title="Arrêter">■</button>` : '') +
        `<button data-a="restart" title="Redémarrer">⟳</button>` +
        `<button data-a="remove" title="Retirer de la liste">✕</button></div>`;
      row.onclick = () => selectServer(s.id);
      const link = row.querySelector('.ws-url');
      if (link) link.onclick = (e) => { e.preventDefault(); e.stopPropagation(); previewServerId = s.id; loadPreview(s.url); };
      row.querySelectorAll('.ws-actions button').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const a = btn.dataset.a;
          if (a === 'stop') await api.webStopServer(s.id);
          else if (a === 'restart') { const r = await api.webRestartServer(s.id); if (r.ok) { selectServer(r.server.id); previewServerId = r.server.id; } }
          else if (a === 'remove') { await api.webRemoveServer(s.id); servers.delete(s.id); if (selectedServerId === s.id) { selectedServerId = null; serverLog.term.reset(); } renderServers(); }
        };
      });
      box.appendChild(row);
    });
  }

  function renderScripts() {
    const box = $('webScripts');
    $('webScriptsCard').classList.toggle('hidden', info.kind !== 'node' || !info.scripts.length);
    box.innerHTML = '';
    info.scripts.forEach((sc) => {
      const row = document.createElement('div');
      row.className = 'web-script';
      row.innerHTML =
        `<div class="wsc-main"><span class="wsc-name">${esc(sc.name)}${sc.isDev ? ' <span class="web-chip dev">dev</span>' : ''}</span>` +
        `<span class="wsc-cmd" title="${esc(sc.command)}">${esc(sc.command)}</span></div>` +
        `<div class="wsc-actions"><button data-a="srv" title="Lancer comme serveur (avec aperçu)">▶</button><button data-a="term" title="Exécuter dans le terminal">⌨</button></div>`;
      row.querySelector('[data-a="srv"]').onclick = () => startServer(runCmd(info.pm, sc.name), sc.name);
      row.querySelector('[data-a="term"]').onclick = () => runInTerminal(runCmd(info.pm, sc.name));
      box.appendChild(row);
    });
  }

  function renderDeps() {
    $('webDepsCard').classList.toggle('hidden', info.kind !== 'node');
    if (info.kind !== 'node') return;
    const filter = $('webDepFilter').value.trim().toLowerCase();
    const box = $('webDeps');
    box.innerHTML = '';
    const list = info.deps.filter((d) => !filter || d.name.toLowerCase().includes(filter));
    if (!list.length) { box.innerHTML = '<div class="empty-hint web-small">Aucune dépendance.</div>'; return; }
    list.slice(0, 200).forEach((d) => {
      const row = document.createElement('div');
      row.className = 'web-dep';
      row.innerHTML = `<span class="wd-name" title="${esc(d.name)}">${esc(d.name)}</span><span class="wd-ver">${esc(d.version)}</span>` +
        (d.dev ? '<span class="web-chip dev">dev</span>' : '') + `<button title="Désinstaller">✕</button>`;
      row.querySelector('button').onclick = () => {
        if (confirm(`Désinstaller « ${d.name} » ?`)) runNpm('remove', [d.name]);
      };
      box.appendChild(row);
    });
  }

  // ---------- Serveurs ----------
  async function startServer(command, name) {
    if (!root) return;
    if (info && info.kind === 'node' && info.needsInstall) {
      const ok = await runNpm('install');
      if (!ok || !ok.ok) return;
    }
    const res = await api.webStartServer({ cwd: root.path, command, name });
    if (!res.ok) { alert(res.error || 'Impossible de lancer le serveur.'); return; }
    previewServerId = res.server.id;
    servers.set(res.server.id, res.server);
    selectServer(res.server.id);
    switchPane('server');
  }

  function startDev() { if (info && info.devCommand) startServer(info.devCommand, info.devCommand); }

  async function startStatic() {
    if (!root) return;
    const res = await api.webStartStatic({ cwd: root.path, name: 'Statique — ' + root.name });
    if (!res.ok) { alert(res.error || 'Impossible de lancer le serveur statique.'); return; }
    previewServerId = res.server.id;
    servers.set(res.server.id, res.server);
    selectServer(res.server.id);
    switchPane('server');
    if (res.server.url) loadPreview(res.server.url);
    return res.server;
  }

  async function selectServer(id) {
    selectedServerId = id;
    renderServers();
    serverLog.term.reset();
    const logs = await api.webGetServerLogs(id);
    if (selectedServerId === id && logs) serverLog.term.write(logs);
  }

  function runInTerminal(cmd) {
    if (!root) return;
    switchPane('terminal');
    webTerms.runCommand(cmd, root.path);
  }

  // ---------- Dépendances ----------
  async function runNpm(action, packages, dev) {
    if (busy || !root) return null;
    busy = true;
    document.querySelectorAll('#webDepsCard button, #webRunActions button').forEach((b) => { b.disabled = true; });
    switchPane('task');
    taskLog.term.write(`\x1b[36m── ${action} ──\x1b[0m\r\n`);
    const res = await api.webNpm({ cwd: root.path, action, packages, dev });
    taskLog.term.write(res.ok ? '\r\n\x1b[32m✔ Terminé\x1b[0m\r\n' : `\r\n\x1b[31m✖ Échec${res.error ? ' : ' + res.error : ''}\x1b[0m\r\n`);
    busy = false;
    await refresh();
    return res;
  }

  // ---------- Aperçu ----------
  function ensureWebview() {
    if (webview) return webview;
    const frame = document.createElement('div');
    frame.className = 'web-frame device-' + device;
    frame.id = 'webFrame';
    webview = document.createElement('webview');
    webview.className = 'web-webview';
    webview.setAttribute('allowpopups', '');
    frame.appendChild(webview);
    $('webPreview').appendChild(frame);
    $('webPreviewEmpty').classList.add('hidden');

    webview.addEventListener('dom-ready', () => { webviewReady = true; });
    const onNav = (e) => { if (e.url) $('webUrlInput').value = e.url; };
    webview.addEventListener('did-navigate', onNav);
    webview.addEventListener('did-navigate-in-page', onNav);
    webview.addEventListener('did-start-loading', () => $('webFrame').classList.add('loading'));
    webview.addEventListener('did-stop-loading', () => $('webFrame').classList.remove('loading'));
    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || !e.isMainFrame) return; // -3 = navigation annulée
      addConsole(3, `Échec du chargement (${e.errorDescription || e.errorCode}) : ${e.validatedURL}`);
    });
    webview.addEventListener('console-message', (e) => addConsole(e.level, e.message, e.sourceId, e.line));
    return webview;
  }

  function normalizeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u;
  }

  function loadPreview(url) {
    url = normalizeUrl(url);
    if (!url) return;
    const w = ensureWebview();
    $('webUrlInput').value = url;
    if (webview.getAttribute('src') === url && webviewReady) { try { w.reloadIgnoringCache(); } catch (e) { w.src = url; } }
    else w.setAttribute('src', url);
  }

  function addConsole(level, message, source, line) {
    if (typeof level === 'string') level = ({ debug: 0, verbose: 0, info: 1, log: 1, warning: 2, warn: 2, error: 3 })[level] ?? 1;
    const box = $('webConsole');
    const row = document.createElement('div');
    row.className = 'wc-line lvl-' + level;
    const src = source ? ` <span class="wc-src">${esc(String(source).split('/').pop())}${line ? ':' + line : ''}</span>` : '';
    row.innerHTML = `<span class="wc-msg">${esc(message)}</span>${src}`;
    box.appendChild(row);
    while (box.childNodes.length > 400) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    if (level >= 2 && pane !== 'console') {
      consoleCount++;
      const badge = $('webConsoleBadge');
      badge.textContent = consoleCount > 99 ? '99+' : String(consoleCount);
      badge.classList.remove('hidden');
    }
  }

  function setDevice(d) {
    device = d;
    document.querySelectorAll('#webDeviceSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.device === d));
    const frame = $('webFrame');
    if (frame) frame.className = 'web-frame device-' + d;
  }

  // Ouvre un fichier HTML du mode Projet dans l'aperçu (serveur statique + live reload)
  async function previewFile(absPath) {
    if (!root) return;
    const sep = /[\\/]/;
    let rel = absPath.startsWith(root.path) ? absPath.slice(root.path.length).split(sep).filter(Boolean).join('/') : '';
    window.switchMode('web');
    await refresh();
    let srv = [...servers.values()].find((s) => s.kind === 'static' && s.cwd === root.path && (s.status === 'running' || s.status === 'starting'));
    if (!srv) srv = await startStatic();
    if (srv && srv.url) { previewServerId = srv.id; loadPreview(srv.url + '/' + rel.split('/').map(encodeURIComponent).join('/')); }
  }

  // ---------- Panneau du bas ----------
  function switchPane(name) {
    pane = name;
    document.querySelectorAll('.web-btab').forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
    document.querySelectorAll('.web-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
    $('webBottom').classList.remove('collapsed');
    if (name === 'console') { consoleCount = 0; $('webConsoleBadge').classList.add('hidden'); }
    requestAnimationFrame(() => {
      serverLog && serverLog.fit(); taskLog && taskLog.fit();
      if (name === 'terminal' && webTerms) {
        if (!webTerms.tabs.length && root) webTerms.newTab(root.path); else webTerms.fitActive();
      }
    });
  }

  // ---------- Nouveau projet ----------
  async function openNewModal() {
    const tpls = await api.webTemplates();
    const sel = $('webTplSelect');
    sel.innerHTML = tpls.map((t) => `<option value="${esc(t.id)}">${esc(t.icon)} ${esc(t.label)}</option>`).join('');
    const showDesc = () => { const t = tpls.find((x) => x.id === sel.value); $('webTplDesc').textContent = t ? t.desc : ''; };
    sel.onchange = showDesc; showDesc();
    if (!$('webNewParent').value) $('webNewParent').value = await api.getWorkspaceDir();
    $('webNewError').textContent = '';
    $('webNewModal').classList.add('open');
    $('webNewName').focus();
  }

  async function createProject() {
    const templateId = $('webTplSelect').value;
    const name = $('webNewName').value.trim();
    const parentDir = $('webNewParent').value;
    const res = await api.webScaffold({ templateId, name, parentDir });
    if (!res.ok) { $('webNewError').textContent = res.error || 'Erreur.'; return; }
    $('webNewModal').classList.remove('open');
    if (res.kind === 'files') {
      setRoot({ path: res.projectPath, name: res.name });
      await refresh();
      if (templateId === 'static') startStatic();
    } else {
      pendingNewProject = { path: res.projectPath, name };
      showNotice(`Création de « ${esc(name)} » en cours dans le terminal. Quand c'est terminé :`, 'Ouvrir le projet', openPendingProject);
      switchPane('terminal');
      webTerms.newTab(res.cwd, 'création').then(() => webTerms.runCommand(res.command, res.cwd));
    }
  }

  async function openPendingProject() {
    if (!pendingNewProject) return;
    const d = await api.webDetect(pendingNewProject.path);
    if (!d.ok) { alert('Le dossier n\'existe pas encore : attends la fin de la commande.'); return; }
    setRoot({ path: pendingNewProject.path, name: pendingNewProject.name });
    pendingNewProject = null;
    hideNotice();
    await refresh();
  }

  function showNotice(html, btnLabel, onClick) {
    let n = $('webNotice');
    if (!n) {
      n = document.createElement('div');
      n.id = 'webNotice';
      n.className = 'web-notice';
      $('webScroll').parentElement.insertBefore(n, $('webScroll'));
    }
    n.innerHTML = `<span>${html}</span><button class="btn-ghost web-outline-btn">${esc(btnLabel)}</button><button class="btn-ghost wn-x" title="Masquer">✕</button>`;
    n.classList.remove('hidden');
    n.querySelector('.web-outline-btn').onclick = onClick;
    n.querySelector('.wn-x').onclick = hideNotice;
  }
  function hideNotice() { const n = $('webNotice'); if (n) n.classList.add('hidden'); }

  // ---------- Initialisation ----------
  function init() {
    if (ready) return;
    if (!xtermAvailable()) console.warn('xterm.js non chargé');
    const onLocalLink = (uri) => { loadPreview(uri); };

    serverLog = makeLogTerm($('webServerLogHost'), onLocalLink);
    taskLog = makeLogTerm($('webTaskLogHost'), onLocalLink);
    webTerms = new TerminalTabs($('webTermHost'), $('webTermTabs'), { getCwd: () => (root ? root.path : ''), onLocalLink });

    api.onWebServerUpdate((s) => {
      const isNew = !servers.has(s.id);
      servers.set(s.id, s);
      if (isNew && !selectedServerId) selectServer(s.id);
      if (s.status === 'running' && s.url && s.id === previewServerId) {
        const current = $('webUrlInput').value;
        if (!current || !current.startsWith(s.url)) loadPreview(s.url);
      }
      renderServers();
    });
    api.onWebServerLog(({ id, chunk }) => { if (id === selectedServerId) serverLog.term.write(chunk); });
    api.onWebServerRemoved(({ id }) => { servers.delete(id); if (selectedServerId === id) selectedServerId = null; renderServers(); });
    api.onWebTaskLog(({ chunk }) => taskLog.term.write(chunk));

    $('webOpenBtn').onclick = async () => {
      const p = await api.webPickFolder();
      if (p) { setRoot({ path: p, name: p.split(/[\\/]/).filter(Boolean).pop() }); }
    };
    $('webNewBtn').onclick = openNewModal;
    $('webRefreshBtn').onclick = refresh;
    $('webNewCancelBtn').onclick = () => $('webNewModal').classList.remove('open');
    $('webNewCreateBtn').onclick = createProject;
    $('webNewPickBtn').onclick = async () => { const p = await api.webPickFolder(); if (p) $('webNewParent').value = p; };

    $('webDepAddBtn').onclick = () => {
      const pkgs = $('webDepInput').value.split(/\s+/).filter(Boolean);
      if (!pkgs.length) return;
      runNpm('add', pkgs, $('webDepDev').checked).then((r) => { if (r && r.ok) $('webDepInput').value = ''; });
    };
    $('webDepInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('webDepAddBtn').click(); });
    $('webDepInstallBtn').onclick = () => runNpm('install');
    $('webDepUpdateBtn').onclick = () => { if (confirm('Mettre à jour toutes les dépendances (dans les limites du package.json) ?')) runNpm('update'); };
    $('webDepFilter').addEventListener('input', () => { if (info) renderDeps(); });

    $('webReloadBtn').onclick = () => { if (webview && webviewReady) webview.reloadIgnoringCache(); };
    $('webBackBtn').onclick = () => { if (webview && webviewReady && webview.canGoBack()) webview.goBack(); };
    $('webUrlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPreview(e.target.value); });
    $('webExternalBtn').onclick = () => { const u = normalizeUrl($('webUrlInput').value); if (u) api.openUrl(u); };
    $('webDevtoolsBtn').onclick = () => { if (webview && webviewReady) webview.openDevTools(); };
    document.querySelectorAll('#webDeviceSwitch button').forEach((b) => { b.onclick = () => setDevice(b.dataset.device); });

    document.querySelectorAll('.web-btab').forEach((b) => { b.onclick = () => switchPane(b.dataset.pane); });
    $('webToggleBottomBtn').onclick = () => { $('webBottom').classList.toggle('collapsed'); setTimeout(() => { serverLog.fit(); taskLog.fit(); webTerms.fitActive(); }, 180); };
    $('webNewTermBtn').onclick = () => { switchPane('terminal'); webTerms.newTab(root ? root.path : ''); };
    $('webClearLogsBtn').onclick = () => {
      if (pane === 'server') serverLog.term.reset();
      else if (pane === 'task') taskLog.term.reset();
      else if (pane === 'console') { $('webConsole').innerHTML = ''; consoleCount = 0; $('webConsoleBadge').classList.add('hidden'); }
      else webTerms.clearActive();
    };

    ready = true;
    api.webListServers().then((list) => { list.forEach((s) => servers.set(s.id, s)); renderServers(); });
  }

  async function onShow() {
    init();
    if (!root) {
      const last = await api.reopenLastProject();
      if (last) root = last;
    }
    await refresh();
    setTimeout(() => { serverLog.fit(); taskLog.fit(); webTerms.fitActive(); }, 50);
  }

  window.WebDev = {
    TerminalTabs, getRoot, setRoot, onShow, previewFile,
    cmModeFor, extraIcons: EXTRA_ICONS, enhanceEditor, mountSymbolBar
  };
})();
