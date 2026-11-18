// =====================================================================
// StudyIDE — navigation dans l'éditeur de projet
//  - Fil d'Ariane : chemin du fichier + classe › fonction courante
//  - Aller au symbole (Ctrl+Shift+O) avec filtre flou et aperçu en direct
//  - Barre d'état : ligne/colonne, sélection, indentation, retour à la ligne, zoom
//  - Raccourcis : déplacer / dupliquer des lignes, tout replier / déplier, zoom
// Exposé via window.EditorNav. Les fonctions pures sont testables sous Node.
// =====================================================================
(function (root) {
  'use strict';

  // ===================================================================
  // 1. SYMBOLES (fonctions pures)
  // ===================================================================
  const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with', 'do', 'try', 'new', 'typeof', 'await', 'super', 'constructor_']);

  const ID = '[A-Za-z_$][\\w$]*';
  // [expression, type, formatage du libellé, rejeter les mots-clés ?]
  const JS_RULES = [
    [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+(${ID})`), 'class'],
    [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${ID})\\s*[(<]`), 'function'],
    [new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(interface|type|enum)\\s+(${ID})`), 'type', (m) => `${m[1]} ${m[2]}`],
    [new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::\\s*[^=]+)?=>|${ID}\\s*=>)`), 'function'],
    [new RegExp(`^\\s+(?:(?:public|private|protected|static|async|get|set|readonly|override|abstract)\\s+)*(#?${ID})\\s*(?:<[^>]*>)?\\s*\\([^;]*\\)\\s*(?::\\s*[^={;]+)?\\{\\s*$`), 'method', null, true],
    [new RegExp(`^\\s+(${ID})\\s*:\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>)`), 'method']
  ];
  const HTML_RULES = [
    [/<(h[1-6])\b[^>]*>\s*([^<]{1,80})/i, 'heading', (m) => `${m[1].toLowerCase()}  ${m[2].trim()}`],
    [/<([a-z][\w-]*)\b[^>]*\sid=["']([^"']+)["']/i, 'id', (m) => `${m[1].toLowerCase()}#${m[2]}`],
    [/<(header|nav|main|section|article|aside|footer|form|template|script|style)\b([^>]*)>/i, 'section', (m) => {
      const attr = /(?:class|id)=["']([^"']+)["']/.exec(m[2] || '');
      return `<${m[1].toLowerCase()}${attr ? ' ' + attr[1] : ''}>`;
    }]
  ];

  const RULES = {
    js: JS_RULES,
    html: HTML_RULES,
    web: JS_RULES.concat(HTML_RULES),
    css: [
      [/^\s*@(media|keyframes|font-face|supports|layer|container)\b([^{]*)\{/, 'section', (m) => `@${m[1]}${m[2].trim() ? ' ' + m[2].trim() : ''}`],
      [/^\s*@(mixin|function)\s+([\w-]+)/, 'function', (m) => `@${m[1]} ${m[2]}`],
      [/^\s*([^\s{}@/;:][^{};]*?)\s*\{\s*$/, 'selector', null, 'css']
    ],
    md: [[/^(#{1,6})\s+(.+?)\s*#*\s*$/, 'heading', (m) => m[2], 'md']],
    py: [
      [/^\s*class\s+(\w+)/, 'class'],
      [/^\s*(?:async\s+)?def\s+(\w+)/, 'function']
    ],
    c: [
      [/^\s*(?:(?:public|private|protected|static|final|abstract|sealed|partial|export|internal|data)\s+)*(class|interface|enum|record|struct|namespace|object)\s+(\w+)/, 'class', (m) => `${m[1]} ${m[2]}`],
      [/^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|override|virtual|async|internal|inline|open|suspend)\s+)+(?:[\w<>[\],.?*&\s]+?\s+)?(\w+)\s*\([^;]*\)\s*(?:throws[^{]*)?\{?\s*$/, 'method', null, true],
      [/^\s*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/, 'function']
    ],
    php: [
      [/^\s*(?:abstract\s+|final\s+)?(class|interface|trait)\s+(\w+)/, 'class', (m) => `${m[1]} ${m[2]}`],
      [/^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(\w+)/, 'function']
    ],
    go: [
      [/^type\s+(\w+)\s+(struct|interface)/, 'class', (m) => `${m[2]} ${m[1]}`],
      [/^func\s+(?:\([^)]*\)\s*)?(\w+)/, 'function']
    ],
    rust: [
      [/^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|impl|mod)\s+([\w<>:]+)/, 'class', (m) => `${m[1]} ${m[2]}`],
      [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/, 'function']
    ],
    ruby: [
      [/^\s*(class|module)\s+([\w:]+)/, 'class', (m) => `${m[1]} ${m[2]}`],
      [/^\s*def\s+(?:self\.)?(\w+[?!=]?)/, 'function']
    ],
    sh: [[/^\s*(?:function\s+)?([\w-]+)\s*\(\s*\)\s*\{?/, 'function']],
    sql: [[/^\s*create\s+(?:or\s+replace\s+)?(table|view|function|procedure|index|trigger)\s+(?:if\s+not\s+exists\s+)?([\w."`]+)/i, 'class', (m) => `${m[1].toLowerCase()} ${m[2]}`]],
    json: [[/^(\s{0,3})"([^"]+)"\s*:/, 'id', (m) => m[2], 'json']],
    yaml: [[/^([A-Za-z_][\w.-]*)\s*:/, 'id']]
  };

  const EXT_GROUP = {
    js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
    vue: 'web', svelte: 'web', astro: 'web', html: 'html', htm: 'html', ejs: 'html',
    css: 'css', scss: 'css', less: 'css', sass: 'css', pcss: 'css',
    md: 'md', mdx: 'md', markdown: 'md', py: 'py',
    java: 'c', kt: 'c', kts: 'c', cs: 'c', c: 'c', cpp: 'c', cc: 'c', h: 'c', hpp: 'c', swift: 'c', scala: 'c', dart: 'c',
    php: 'php', go: 'go', rs: 'rust', rb: 'ruby', sh: 'sh', bash: 'sh', zsh: 'sh',
    json: 'json', yml: 'yaml', yaml: 'yaml', sql: 'sql'
  };

  const LANG_LABEL = {
    js: 'JavaScript', ts: 'TypeScript', jsx: 'JSX', tsx: 'TSX', mjs: 'JavaScript', cjs: 'JavaScript', html: 'HTML', htm: 'HTML',
    css: 'CSS', scss: 'SCSS', less: 'Less', sass: 'Sass', json: 'JSON', md: 'Markdown', mdx: 'MDX', py: 'Python', java: 'Java',
    vue: 'Vue', svelte: 'Svelte', astro: 'Astro', php: 'PHP', go: 'Go', rs: 'Rust', rb: 'Ruby', sh: 'Shell', sql: 'SQL',
    yml: 'YAML', yaml: 'YAML', xml: 'XML', svg: 'SVG', toml: 'TOML', c: 'C', cpp: 'C++', cs: 'C#', kt: 'Kotlin', txt: 'Texte'
  };

  function indentOf(text, tabSize) {
    let col = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 32) col++;
      else if (ch === 9) col += tabSize - (col % tabSize);
      else break;
    }
    return col;
  }

  // Parcourt les lignes et renvoie [{ line, label, kind, indent }]
  function extractSymbols(getLine, lineCount, ext, tabSize) {
    const group = EXT_GROUP[String(ext || '').toLowerCase()];
    const rules = group && RULES[group];
    if (!rules) return null; // type de fichier non géré
    const out = [];
    const max = Math.min(lineCount, 30000);
    let inFence = false;
    for (let i = 0; i < max; i++) {
      const text = getLine(i);
      if (!text || text.length > 400) continue;
      const trimmed = text.trimStart();
      if (group === 'md') { // pas de faux titres dans les blocs de code ```
        if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) { inFence = !inFence; continue; }
        if (inFence) continue;
      }
      if (group === 'js' || group === 'web' || group === 'c' || group === 'php') {
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      }
      if (group === 'py' && trimmed.startsWith('#')) continue;
      for (const [re, kind, fmt, special] of rules) {
        const m = re.exec(text);
        if (!m) continue;
        let label = fmt ? fmt(m) : m[1];
        let indent = indentOf(text, tabSize);
        if (special === true && KEYWORDS.has(m[1])) continue;
        if (special === 'css') {
          if (/^(from|to|\d+(\.\d+)?%)/.test(m[1].trim())) continue; // étapes de @keyframes
          label = m[1].trim().replace(/\s+/g, ' ');
        }
        if (special === 'md') indent = m[1].length * 2;
        if (special === 'json') {
          if (m[1].length > 2) continue;
          indent = m[1].length;
        }
        if (!label) continue;
        out.push({ line: i, label: label.length > 90 ? label.slice(0, 89) + '…' : label, kind, indent });
        break;
      }
    }
    return out;
  }

  // Chemin « classe › méthode » pour une ligne donnée
  function symbolPath(symbols, line) {
    let idx = -1;
    for (let i = 0; i < symbols.length; i++) { if (symbols[i].line <= line) idx = i; else break; }
    if (idx < 0) return [];
    const path = [symbols[idx]];
    for (let j = idx - 1; j >= 0; j--) {
      if (symbols[j].indent < path[0].indent) path.unshift(symbols[j]);
    }
    return path.slice(-3);
  }

  // Filtre flou : tous les caractères dans l'ordre, bonus pour les débuts de mots et les suites
  function fuzzyScore(query, text) {
    const q = query.toLowerCase();
    const s = text.toLowerCase();
    if (!q) return 0;
    let qi = 0, score = 0, last = -2;
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) {
        score += i === last + 1 ? 3 : 1;
        if (i === 0 || /[\W_]/.test(s[i - 1]) || (text[i] !== s[i] && text[i - 1] === s[i - 1])) score += 2;
        last = i;
        qi++;
      }
    }
    if (qi < q.length) return -1;
    if (s.includes(q)) score += 10;
    return score - s.length * 0.01;
  }

  const api = { extractSymbols, symbolPath, fuzzyScore, indentOf, EXT_GROUP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests Node
  if (typeof document === 'undefined') return;

  // ===================================================================
  // 2. PRÉFÉRENCES
  // ===================================================================
  const prefs = {
    get(k, d) { try { const v = localStorage.getItem('studyide.editor.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('studyide.editor.' + k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ===================================================================
  // 4. NAVIGATION : fil d'Ariane, barre d'état, symboles, raccourcis
  // ===================================================================
  const KIND_BADGE = { class: 'C', function: 'ƒ', method: 'ƒ', type: 'T', selector: '#', heading: '§', id: '#', section: '▸' };

  function moveLines(cm, dir) {
    const sel = cm.listSelections()[0];
    const a = sel.anchor, h = sel.head;
    let from = Math.min(a.line, h.line);
    let to = Math.max(a.line, h.line);
    const bottom = a.line > h.line ? a : (h.line > a.line ? h : null);
    if (to > from && bottom && bottom.ch === 0) to--; // la sélection s'arrête au début d'une ligne : elle ne l'inclut pas
    if ((dir < 0 && from <= cm.firstLine()) || (dir > 0 && to >= cm.lastLine())) return;
    cm.operation(() => {
      const end = (n) => ({ line: n, ch: cm.getLine(n).length });
      const block = cm.getRange({ line: from, ch: 0 }, end(to));
      if (dir < 0) cm.replaceRange(block + '\n' + cm.getLine(from - 1), { line: from - 1, ch: 0 }, end(to));
      else cm.replaceRange(cm.getLine(to + 1) + '\n' + block, { line: from, ch: 0 }, end(to + 1));
      cm.setSelection({ line: a.line + dir, ch: a.ch }, { line: h.line + dir, ch: h.ch });
    });
  }

  function duplicateLines(cm, dir) {
    const sel = cm.listSelections()[0];
    const from = Math.min(sel.anchor.line, sel.head.line);
    let to = Math.max(sel.anchor.line, sel.head.line);
    const bottom = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
    if (to > from && bottom.ch === 0) to--;
    cm.operation(() => {
      const end = { line: to, ch: cm.getLine(to).length };
      const block = cm.getRange({ line: from, ch: 0 }, end);
      cm.replaceRange('\n' + block, end);
      if (dir > 0) {
        const n = to - from + 1;
        cm.setSelection({ line: sel.anchor.line + n, ch: sel.anchor.ch }, { line: sel.head.line + n, ch: sel.head.ch });
      }
    });
  }

  class EditorNav {
    constructor(cm, els) {
      this.cm = cm;
      this.els = els;
      this.file = { rel: '', ext: '' };
      this.active = false;
      this.symbols = null;
      this.wrap = !!prefs.get('wrap', false);
      this.fontSize = Number(prefs.get('fontSize', 13.5)) || 13.5;
      this._statusRaf = 0;
      this._crumbTimer = null;

      this.buildStatusBar();
      this.buildPicker();
      this.applyPrefs();
      this.bind();
      this.setActive(false);
    }

    // ---------- Construction de l'interface ----------
    buildStatusBar() {
      const bar = this.els.status;
      bar.innerHTML = `
        <button class="sb-item sb-pos" title="Aller à la ligne (Ctrl+G)">Ln 1, Col 1</button>
        <span class="sb-item sb-sel"></span>
        <span class="sb-item sb-lines"></span>
        <span class="sb-item sb-indent"></span>
        <span class="sb-item sb-lang"></span>
        <span class="sb-spacer"></span>
        <button class="sb-btn sb-symbols" title="Aller au symbole (Ctrl+Shift+O)">☰ Symboles</button>
        <button class="sb-btn sb-fold" title="Tout replier (Ctrl+K puis Ctrl+0)">⊟</button>
        <button class="sb-btn sb-unfold" title="Tout déplier (Ctrl+K puis Ctrl+J)">⊞</button>
        <button class="sb-btn sb-wrap" title="Retour à la ligne automatique">↩ Retour</button>
        <button class="sb-btn sb-zoom-out" title="Réduire le texte (Ctrl+-)">A−</button>
        <span class="sb-item sb-zoom" title="Taille du texte (Ctrl+0 pour réinitialiser)"></span>
        <button class="sb-btn sb-zoom-in" title="Agrandir le texte (Ctrl++)">A+</button>`;
      const q = (c) => bar.querySelector(c);
      this.ui = {
        pos: q('.sb-pos'), sel: q('.sb-sel'), lines: q('.sb-lines'), indent: q('.sb-indent'), lang: q('.sb-lang'),
        wrap: q('.sb-wrap'), zoom: q('.sb-zoom')
      };
      q('.sb-pos').onclick = () => this.cm.execCommand('jumpToLine');
      q('.sb-symbols').onclick = () => this.openPicker();
      q('.sb-fold').onclick = () => { this.cm.execCommand('foldAll'); this.cm.focus(); };
      q('.sb-unfold').onclick = () => { this.cm.execCommand('unfoldAll'); this.cm.focus(); };
      q('.sb-wrap').onclick = () => this.toggleWrap();
      q('.sb-zoom-out').onclick = () => this.zoom(-1);
      q('.sb-zoom-in').onclick = () => this.zoom(1);
      this.ui.zoom.onclick = () => this.zoom(0);
    }

    buildPicker() {
      const p = document.createElement('div');
      p.className = 'sym-picker hidden';
      p.innerHTML = `
        <input type="text" class="sym-input" placeholder="Aller au symbole…  (fonction, classe, titre, sélecteur)" spellcheck="false" autocomplete="off" />
        <div class="sym-list"></div>
        <div class="sym-foot">↑↓ naviguer · Entrée aller · Échap annuler</div>`;
      this.els.body.appendChild(p);
      this.picker = { root: p, input: p.querySelector('.sym-input'), list: p.querySelector('.sym-list'), items: [], sel: 0, open: false, restore: null };

      const pk = this.picker;
      pk.input.addEventListener('input', () => this.filterPicker());
      pk.input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.movePicker(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.movePicker(-1); }
        else if (e.key === 'PageDown') { e.preventDefault(); this.movePicker(8); }
        else if (e.key === 'PageUp') { e.preventDefault(); this.movePicker(-8); }
        else if (e.key === 'Enter') { e.preventDefault(); this.commitPicker(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.closePicker(true); }
      });
      pk.input.addEventListener('blur', () => setTimeout(() => { if (pk.open && !pk.root.contains(document.activeElement)) this.closePicker(true); }, 120));
    }

    // ---------- Liaisons ----------
    bind() {
      const cm = this.cm;
      const wrapper = cm.getWrapperElement();
      wrapper.classList.add('project-cm');

      cm.on('cursorActivity', () => this.scheduleStatus());
      cm.on('change', () => { this.symbols = null; this.scheduleStatus(); this.scheduleCrumb(); });
      cm.on('swapDoc', () => { this.symbols = null; this.scheduleStatus(); this.scheduleCrumb(); });

      // Les barres de défilement doivent suivre les changements de mise en page (terminal replié, séparateur…)
      let raf = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => cm.refresh());
      }).observe(this.els.body);

      // Zoom : Ctrl + molette, Ctrl +/-/0
      wrapper.addEventListener('wheel', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });
      wrapper.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return; // altKey : AltGr (clavier AZERTY), on ne touche pas
        if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(1); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom(-1); }
        else if (e.key === '0') { e.preventDefault(); this.zoom(0); }
      }, true);

      const keys = Object.assign({}, cm.getOption('extraKeys') || {});
      keys['Shift-Ctrl-O'] = () => this.openPicker();
      keys['Cmd-Shift-O'] = () => this.openPicker();
      keys['Ctrl-G'] = 'jumpToLine';
      keys['Cmd-G'] = 'jumpToLine';
      keys['Alt-Up'] = (c) => moveLines(c, -1);
      keys['Alt-Down'] = (c) => moveLines(c, 1);
      keys['Shift-Alt-Down'] = (c) => duplicateLines(c, 1);
      keys['Shift-Alt-Up'] = (c) => duplicateLines(c, 0);
      keys['Ctrl-K Ctrl-0'] = 'foldAll';
      keys['Ctrl-K Ctrl-J'] = 'unfoldAll';
      keys['Alt-Z'] = () => this.toggleWrap();
      cm.setOption('extraKeys', keys);
    }

    applyPrefs() {
      this.cm.setOption('lineWrapping', this.wrap);
      this.ui.wrap.classList.toggle('on', this.wrap);
      this.applyFont();
    }

    applyFont() {
      this.cm.getWrapperElement().style.fontSize = this.fontSize + 'px';
      this.ui.zoom.textContent = Math.round((this.fontSize / 13.5) * 100) + ' %';
      this.cm.refresh();
    }

    zoom(dir) {
      this.fontSize = dir === 0 ? 13.5 : Math.min(32, Math.max(8, this.fontSize + dir * 1));
      prefs.set('fontSize', this.fontSize);
      this.applyFont();
    }

    toggleWrap() {
      this.wrap = !this.wrap;
      prefs.set('wrap', this.wrap);
      this.cm.setOption('lineWrapping', this.wrap);
      this.ui.wrap.classList.toggle('on', this.wrap);
      this.cm.refresh();
      this.cm.focus();
    }

    // ---------- État : fichier actif ----------
    setActive(on) {
      this.active = !!on;
      this.els.status.classList.toggle('hidden', !on);
      this.els.crumb.classList.toggle('hidden', !on);
      if (on) { this.scheduleStatus(); this.scheduleCrumb(); }
    }

    setFile(relPath, ext) {
      this.file = { rel: String(relPath || '').replace(/\\/g, '/'), ext: String(ext || '').toLowerCase() };
      this.symbols = null;
      this.scheduleStatus();
      this.scheduleCrumb();
    }

    // ---------- Barre d'état ----------
    scheduleStatus() {
      if (this._statusRaf || !this.active) return;
      this._statusRaf = requestAnimationFrame(() => { this._statusRaf = 0; this.updateStatus(); });
    }

    updateStatus() {
      const cm = this.cm;
      const cur = cm.getCursor();
      const tab = cm.getOption('tabSize') || 4;
      const col = root.CodeMirror ? root.CodeMirror.countColumn(cm.getLine(cur.line) || '', cur.ch, tab) : cur.ch;
      this.ui.pos.textContent = `Ln ${cur.line + 1}, Col ${col + 1}`;
      const sel = cm.getSelection();
      if (sel) {
        const nl = sel.split('\n').length;
        this.ui.sel.textContent = `${sel.length} car.` + (nl > 1 ? ` · ${nl} lignes` : '') + ' sélectionné' + (sel.length > 1 ? 's' : '');
      } else this.ui.sel.textContent = '';
      const n = cm.lineCount();
      this.ui.lines.textContent = `${n} ligne${n > 1 ? 's' : ''}`;
      this.ui.indent.textContent = cm.getOption('indentWithTabs') ? `Tabulations : ${tab}` : `Espaces : ${tab}`;
      this.ui.lang.textContent = LANG_LABEL[this.file.ext] || (this.file.ext ? this.file.ext.toUpperCase() : 'Texte');
      this.updateCrumbSymbols();
    }

    // ---------- Fil d'Ariane ----------
    scheduleCrumb() {
      clearTimeout(this._crumbTimer);
      this._crumbTimer = setTimeout(() => this.renderCrumb(), 250);
    }

    getSymbols() {
      if (this.symbols) return this.symbols;
      const cm = this.cm;
      this.symbols = extractSymbols((i) => cm.getLine(i), cm.lineCount(), this.file.ext, cm.getOption('tabSize') || 4);
      return this.symbols;
    }

    renderCrumb() {
      const box = this.els.crumb;
      const parts = this.file.rel ? this.file.rel.split('/') : [];
      box.innerHTML = parts.map((p, i) => `<span class="bc-part${i === parts.length - 1 ? ' bc-file' : ''}">${esc(p)}</span>`).join('<span class="bc-sep">›</span>')
        + '<span class="bc-symbols"></span>';
      this.updateCrumbSymbols();
    }

    updateCrumbSymbols() {
      const holder = this.els.crumb.querySelector('.bc-symbols');
      if (!holder) return;
      const syms = this.cm.lineCount() <= 30000 ? this.getSymbols() : null;
      if (!syms || !syms.length) { holder.innerHTML = ''; return; }
      const path = symbolPath(syms, this.cm.getCursor().line);
      holder.innerHTML = path.map((s) =>
        `<span class="bc-sep">›</span><button class="bc-sym" data-line="${s.line}" title="Aller à la ligne ${s.line + 1}"><span class="sym-kind sym-${s.kind}">${KIND_BADGE[s.kind] || '·'}</span>${esc(s.label)}</button>`).join('');
      holder.querySelectorAll('.bc-sym').forEach((b) => { b.onclick = () => this.goto(Number(b.dataset.line)); });
    }

    // ---------- Aller à une ligne / un symbole ----------
    goto(line, focus = true) {
      const cm = this.cm;
      cm.setCursor({ line, ch: cm.getLine(line).search(/\S|$/) });
      const h = cm.getScrollInfo().clientHeight;
      cm.scrollTo(null, cm.charCoords({ line, ch: 0 }, 'local').top - h / 3);
      if (focus) cm.focus();
    }

    openPicker() {
      if (!this.active) return;
      const pk = this.picker;
      const syms = this.cm.lineCount() <= 30000
        ? extractSymbols((i) => this.cm.getLine(i), this.cm.lineCount(), this.file.ext, this.cm.getOption('tabSize') || 4)
        : null;
      pk.all = syms || [];
      pk.noSupport = syms === null;
      pk.restore = { cursor: this.cm.getCursor(), scroll: this.cm.getScrollInfo() };
      pk.open = true;
      pk.root.classList.remove('hidden');
      pk.input.value = '';
      this.filterPicker();
      pk.input.focus();
    }

    filterPicker() {
      const pk = this.picker;
      const q = pk.input.value.trim();
      let items = pk.all.map((s) => ({ s, score: q ? fuzzyScore(q, s.label) : 0 }));
      if (q) items = items.filter((x) => x.score >= 0).sort((a, b) => b.score - a.score || a.s.line - b.s.line);
      pk.items = items.slice(0, 300).map((x) => x.s);
      pk.sel = 0;
      this.renderPicker();
      if (pk.items.length) this.previewPicker();
    }

    renderPicker() {
      const pk = this.picker;
      if (!pk.items.length) {
        pk.list.innerHTML = `<div class="sym-empty">${pk.noSupport ? 'Navigation par symboles non disponible pour ce type de fichier.' : (pk.all.length ? 'Aucun résultat.' : 'Aucun symbole reconnu dans ce fichier.')}</div>`;
        return;
      }
      pk.list.innerHTML = pk.items.map((s, i) =>
        `<div class="sym-item${i === pk.sel ? ' sel' : ''}" data-i="${i}" style="padding-left:${10 + Math.min(4, Math.floor(s.indent / 2)) * 12}px">` +
        `<span class="sym-kind sym-${s.kind}">${KIND_BADGE[s.kind] || '·'}</span><span class="sym-label">${esc(s.label)}</span><span class="sym-line">${s.line + 1}</span></div>`).join('');
      pk.list.querySelectorAll('.sym-item').forEach((n) => {
        n.onmousedown = (e) => { e.preventDefault(); pk.sel = Number(n.dataset.i); this.commitPicker(); };
      });
    }

    movePicker(d) {
      const pk = this.picker;
      if (!pk.items.length) return;
      pk.sel = Math.max(0, Math.min(pk.items.length - 1, pk.sel + d));
      pk.list.querySelectorAll('.sym-item').forEach((n, i) => n.classList.toggle('sel', i === pk.sel));
      const el = pk.list.children[pk.sel];
      if (el) el.scrollIntoView({ block: 'nearest' });
      this.previewPicker();
    }

    previewPicker() { // le fichier défile en direct pendant que tu navigues dans la liste
      const s = this.picker.items[this.picker.sel];
      if (s) this.goto(s.line, false);
    }

    commitPicker() {
      const s = this.picker.items[this.picker.sel];
      this.closePicker(false);
      if (s) this.goto(s.line, true);
    }

    closePicker(cancel) {
      const pk = this.picker;
      if (!pk.open) return;
      pk.open = false;
      pk.root.classList.add('hidden');
      if (cancel && pk.restore) {
        this.cm.setCursor(pk.restore.cursor);
        this.cm.scrollTo(pk.restore.scroll.left, pk.restore.scroll.top);
      }
      this.cm.focus();
    }
  }

  // ===================================================================
  // 5. SÉPARATEUR ÉDITEUR / TERMINAL
  // ===================================================================
  function initSplitter(panel, handle) {
    const saved = Number(prefs.get('termHeight', 0));
    if (saved) panel.style.setProperty('--term-h', saved + 'px');
    handle.addEventListener('mousedown', (e) => {
      if (panel.classList.contains('collapsed')) return;
      e.preventDefault();
      const startY = e.clientY;
      const startH = panel.offsetHeight;
      const parentH = panel.parentElement.clientHeight;
      panel.classList.add('resizing');
      document.body.classList.add('is-resizing-v');
      const move = (ev) => {
        const h = Math.max(90, Math.min(parentH - 200, startH - (ev.clientY - startY)));
        panel.style.setProperty('--term-h', h + 'px');
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        panel.classList.remove('resizing');
        document.body.classList.remove('is-resizing-v');
        prefs.set('termHeight', panel.offsetHeight);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    handle.addEventListener('dblclick', () => { // double-clic : taille par défaut
      panel.style.removeProperty('--term-h');
      prefs.set('termHeight', 0);
    });
  }

  root.EditorNav = Object.assign({
    attach: (cm, els) => new EditorNav(cm, els),
    initSplitter
  }, api);
})(typeof window !== 'undefined' ? window : globalThis);
