// Section OPL / CPLEX : éditeur de fichiers .mod et .dat, exécution, résultats, sauvegarde.
// Le langage et la résolution sont dans opl-engine.js (window.Opl).

CodeMirror.defineSimpleMode('opl', {
  start: [
    { regex: /\/\/.*/, token: 'comment' },
    { regex: /\/\*/, token: 'comment', next: 'comment' },
    { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
    { regex: /\b(?:dvar|range|maximize|minimize|subject|to|constraints|forall|sum|prod|in|execute|var|if|else|for|while|tuple|setof|true|false|mod|div)\b/, token: 'keyword' },
    { regex: /\b(?:int|float|boolean|string)\b/, token: 'type' },
    { regex: /\b(?:writeln|write|card|abs|min|max|ceil|floor|sqrt|item|ord|pow|cplex)\b/, token: 'builtin' },
    { regex: /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/, token: 'number' },
    { regex: /<=|>=|==|!=|&&|\|\||\.\.\.?|[-+*\/%=<>!]/, token: 'operator' },
    { regex: /[\{\[\(]/, indent: true },
    { regex: /[\}\]\)]/, dedent: true }
  ],
  comment: [
    { regex: /.*?\*\//, token: 'comment', next: 'start' },
    { regex: /.*/, token: 'comment' }
  ],
  meta: { lineComment: '//', electricInput: /^\s*\}$/ }
});

const OPL_EXAMPLES = {
  'Fromages (exemple simple, un seul fichier)': [{ name: 'fromages.mod', content:
`dvar int x; // aoc
dvar int y; // fromage 2

maximize 3000*x + 1000*y;

subject to {
  30*x + 15*y <= 21000; // contrainte horaire
  10000*x <= 4000000;
  7500*y <= 6000000;
}

execute {
  writeln(30, "*", x, " + ", 15, "*", y, " <= ", 21000);
}
` }],
  'Production avec données (.mod + .dat)': [
    { name: 'production.mod', content:
`{string} Produits = ...;
range Ressources = 1..2;

float profit[Produits] = ...;
float conso[Ressources][Produits] = ...;
float dispo[Ressources] = ...;

dvar float+ q[Produits];

maximize sum(p in Produits) profit[p] * q[p];

subject to {
  forall(r in Ressources)
    capacite: sum(p in Produits) conso[r][p] * q[p] <= dispo[r];
}

execute {
  for (var p in Produits) writeln(p, " : ", q[p]);
}
` },
    { name: 'production.dat', content:
`Produits = {"A", "B"};
profit = [3 2];
conso = [[2 1]
         [1 3]];
dispo = [18 24];
` }],
  'Sac à dos (variables binaires)': [
    { name: 'sac.mod', content:
`int n = ...;
int W = ...;
range Objets = 1..n;
int poids[Objets] = ...;
int valeur[Objets] = ...;

dvar boolean x[Objets];

maximize sum(i in Objets) valeur[i] * x[i];

subject to {
  poids_max: sum(i in Objets) poids[i] * x[i] <= W;
}
` },
    { name: 'sac.dat', content:
`n = 4;
W = 15;
poids = [12 2 1 4];
valeur = [4 2 1 10];
` }]
};

const opl = {
  ready: false, cm: null, dir: '', files: [], open: new Map(), tabs: [], active: null,
  mod: null, dat: null, result: null, resTab: 'console', running: false, errLine: null
};

const oplIsMod = (n) => /\.mod$/i.test(n);
const oplBase = (n) => n.replace(/\.[^.]+$/, '');

async function initOplMode() {
  if (opl.ready) { oplRefreshFiles(); opl.cm.refresh(); return; }
  opl.ready = true;
  if (window.Lazy && window.Lazy.editor) await window.Lazy.editor(); // barres de défilement, options d'éditeur (chargés une seule fois)
  opl.cm = CodeMirror(el('oplEditorHost'), {
    value: '', theme: 'dracula', mode: 'opl', lineNumbers: true, indentUnit: 2, tabSize: 2,
    autoCloseBrackets: true, matchBrackets: true, styleActiveLine: true, scrollbarStyle: 'simple', scrollPastEnd: true,
    extraKeys: {
      'Ctrl-S': () => oplSave(opl.active), 'Cmd-S': () => oplSave(opl.active),
      'Ctrl-Enter': () => oplRun(), 'Cmd-Enter': () => oplRun(), 'F5': () => oplRun(),
      Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('  ', 'end'))
    }
  });
  if (typeof applyEditorSettings === 'function') applyEditorSettings(opl.cm);
  new ResizeObserver(() => opl.cm && opl.cm.refresh()).observe(el('oplEditorHost'));
  opl.cm.on('change', () => { oplClearError(); oplRenderTabs(); oplRenderFiles(); });
  el('oplEditorHost').classList.add('empty');
  EditorNav.initSplitter(el('oplResults'), el('oplSplitter'), 'oplResultHeight');
  el('oplMaxBtn').onclick = () => EditorNav.toggleMaximize(el('oplResults'), el('oplMaxBtn'));
  bindOplEvents();

  let session = {};
  try { session = JSON.parse(localStorage.getItem('studyide.opl') || '{}'); } catch (e) { /* ignoré */ }
  opl.autosave = session.autosave !== false;
  el('oplAutosave').checked = opl.autosave;
  await oplRefreshFiles();
  const wanted = (session.tabs || []).filter((n) => opl.files.some((f) => f.name === n));
  for (const n of wanted) await oplOpenFile(n, n === session.active);
  if (session.mod && opl.files.some((f) => f.name === session.mod)) opl.mod = session.mod;
  if (session.dat !== undefined && (session.dat === null || opl.files.some((f) => f.name === session.dat))) opl.dat = session.dat;
  oplRenderPair();
  oplRenderResults();
}

function oplSaveSession() {
  try { localStorage.setItem('studyide.opl', JSON.stringify({ tabs: opl.tabs, active: opl.active, mod: opl.mod, dat: opl.dat, autosave: opl.autosave })); } catch (e) { /* ignoré */ }
}

// ---------------------------------------------------------------- Fichiers
async function oplRefreshFiles() {
  const r = await window.studyide.oplList();
  if (!r.ok) { notify('⚠ ' + r.error); return; }
  opl.dir = r.dir; opl.files = r.files;
  oplRenderFiles(); oplRenderPair();
}

function oplDirty(name) { const f = opl.open.get(name); return !!f && !f.doc.isClean(f.gen); }

function oplRenderFiles() {
  const host = el('oplFiles');
  if (!opl.files.length) {
    host.innerHTML = '<div class="empty-hint">Aucun fichier pour l\'instant.<br>Crée un modèle ou charge un exemple.</div>';
    return;
  }
  host.innerHTML = opl.files.map((f) => {
    const role = f.name === opl.mod ? '<span class="opl-role" title="Modèle exécuté">▶</span>' : f.name === opl.dat ? '<span class="opl-role" title="Données utilisées">◆</span>' : '';
    return `<div class="opl-file${f.name === opl.active ? ' active' : ''}" data-name="${escapeHtml(f.name)}">
      <span class="opl-ico">${oplIsMod(f.name) ? '🧮' : '📄'}</span>
      <span class="opl-fname">${escapeHtml(f.name)}</span>${oplDirty(f.name) ? '<span class="opl-dot" title="Modifié, non enregistré">●</span>' : ''}${role}
      <span class="opl-fbtns"><button data-act="rename" title="Renommer">✎</button><button data-act="delete" title="Supprimer">🗑</button></span>
    </div>`;
  }).join('');
}

function oplRenderTabs() {
  el('oplTabs').innerHTML = opl.tabs.map((n) => `<div class="opl-tab${n === opl.active ? ' active' : ''}" data-name="${escapeHtml(n)}">
    <span>${oplIsMod(n) ? '🧮' : '📄'} ${escapeHtml(n)}${oplDirty(n) ? ' <b class="opl-dot">●</b>' : ''}</span><button data-close="1" title="Fermer">×</button></div>`).join('');
  el('oplSaveBtn').disabled = !opl.active;
  el('oplSaveAsBtn').disabled = !opl.active;
}

function oplRenderPair() {
  const mods = opl.files.filter((f) => oplIsMod(f.name)), dats = opl.files.filter((f) => !oplIsMod(f.name));
  el('oplModSel').innerHTML = mods.length ? mods.map((f) => `<option${f.name === opl.mod ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('') : '<option value="">(aucun modèle)</option>';
  el('oplDatSel').innerHTML = '<option value="">(sans fichier de données)</option>' + dats.map((f) => `<option${f.name === opl.dat ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
  if (!opl.mod && mods.length) opl.mod = mods[0].name;
  el('oplModSel').value = opl.mod || '';
  el('oplDatSel').value = opl.dat || '';
  el('oplRunBtn').disabled = !opl.mod || opl.running;
}

async function oplOpenFile(name, activate = true) {
  if (!opl.open.has(name)) {
    const r = await window.studyide.oplRead(name);
    if (!r.ok) { notify('⚠ ' + r.error); return; }
    const doc = CodeMirror.Doc(r.content, 'opl');
    opl.open.set(name, { doc, gen: doc.changeGeneration() });
    opl.tabs.push(name);
  }
  if (activate) oplActivate(name);
  else oplRenderTabs();
}

function oplActivate(name) {
  const f = opl.open.get(name);
  if (!f) return;
  oplClearError();
  opl.cm.swapDoc(f.doc);
  opl.active = name;
  el('oplEditorHost').classList.remove('empty');
  // le fichier actif devient le modèle ou les données de l'exécution ; son « jumeau » suit
  if (oplIsMod(name)) {
    opl.mod = name;
    const twin = opl.files.find((x) => !oplIsMod(x.name) && oplBase(x.name) === oplBase(name));
    if (twin) opl.dat = twin.name;
  } else {
    opl.dat = name;
    if (!opl.mod) { const twin = opl.files.find((x) => oplIsMod(x.name) && oplBase(x.name) === oplBase(name)); if (twin) opl.mod = twin.name; }
  }
  oplRenderTabs(); oplRenderFiles(); oplRenderPair(); oplSaveSession();
  opl.cm.refresh(); opl.cm.focus();
}

function oplCloseTab(name) {
  if (oplDirty(name) && !confirm(`« ${name} » a des modifications non enregistrées. Fermer quand même ?`)) return;
  opl.open.delete(name);
  const i = opl.tabs.indexOf(name);
  opl.tabs.splice(i, 1);
  if (opl.active === name) {
    const next = opl.tabs[Math.min(i, opl.tabs.length - 1)];
    if (next) oplActivate(next);
    else { opl.active = null; opl.cm.swapDoc(CodeMirror.Doc('', 'opl')); el('oplEditorHost').classList.add('empty'); }
  }
  oplRenderTabs(); oplRenderFiles(); oplSaveSession();
}

async function oplSave(name) {
  const f = opl.open.get(name);
  if (!f) return true;
  const r = await window.studyide.oplWrite(name, f.doc.getValue());
  if (!r.ok) { notify('⚠ Enregistrement impossible : ' + r.error); return false; }
  f.doc.markClean();
  f.gen = f.doc.changeGeneration();
  oplRenderTabs(); oplRenderFiles();
  notify('💾 ' + name + ' enregistré');
  return true;
}

async function oplNewFile(kind) {
  const def = kind === 'mod' ? 'modele.mod' : 'donnees.dat';
  const input = prompt('Nom du fichier :', def);
  if (!input) return;
  const name = /\.(mod|dat)$/i.test(input.trim()) ? input.trim() : input.trim() + '.' + kind;
  const content = kind === 'mod'
    ? '// Modèle OPL\ndvar float+ x;\n\nmaximize x;\n\nsubject to {\n  x <= 10;\n}\n'
    : '// Données (une affectation par ligne : NOM = valeur;)\n';
  const r = await window.studyide.oplCreate(name, content);
  if (!r.ok) { notify('⚠ ' + r.error); return; }
  await oplRefreshFiles(); await oplOpenFile(r.name);
}

async function oplLoadExample(key) {
  const files = OPL_EXAMPLES[key];
  if (!files) return;
  let first = null;
  const created = [];
  for (const f of files) {
    const r = await window.studyide.oplCreate(f.name, f.content);
    if (!r.ok) { notify('⚠ ' + r.error); return; }
    created.push(r.name); if (!first) first = r.name;
  }
  await oplRefreshFiles();
  for (const n of created) await oplOpenFile(n, false);
  await oplOpenFile(first);
  if (created.length > 1) opl.dat = created[1];
  oplRenderPair(); oplRenderFiles();
  notify(`Exemple créé : ${created.join(', ')}`);
}

async function oplRename(name) {
  const input = prompt('Nouveau nom :', name);
  if (!input || input === name) return;
  if (oplDirty(name) && !(await oplSave(name))) return;
  const r = await window.studyide.oplRename(name, input.trim());
  if (!r.ok) { notify('⚠ ' + r.error); return; }
  const f = opl.open.get(name);
  if (f) { opl.open.delete(name); opl.open.set(r.name, f); opl.tabs = opl.tabs.map((t) => (t === name ? r.name : t)); }
  if (opl.active === name) opl.active = r.name;
  if (opl.mod === name) opl.mod = r.name;
  if (opl.dat === name) opl.dat = r.name;
  await oplRefreshFiles(); oplRenderTabs(); oplSaveSession();
}

async function oplDelete(name) {
  if (!confirm(`Supprimer définitivement « ${name} » ?`)) return;
  const r = await window.studyide.oplDelete(name);
  if (!r.ok) { notify('⚠ ' + r.error); return; }
  if (opl.open.has(name)) { opl.open.get(name).doc.markClean(); oplCloseTab(name); }
  if (opl.mod === name) opl.mod = null;
  if (opl.dat === name) opl.dat = null;
  await oplRefreshFiles(); oplSaveSession();
}

// ---------------------------------------------------------------- Exécution
function oplClearError() {
  if (opl.errLine) { opl.errLine.doc.removeLineClass(opl.errLine.handle, 'background', 'opl-err-line'); opl.errLine = null; }
}

async function oplText(name) {
  if (!name) return '';
  const f = opl.open.get(name);
  if (f) return f.doc.getValue();
  const r = await window.studyide.oplRead(name);
  if (!r.ok) throw new Error(r.error);
  return r.content;
}

async function oplRun() {
  if (opl.running || !opl.mod) { if (!opl.mod) notify('Crée ou ouvre d\'abord un fichier .mod.'); return; }
  opl.running = true; oplRenderPair();
  oplClearError();
  el('oplStatus').textContent = '⏳ Calcul…'; el('oplStatus').className = 'opl-status';
  try {
    if (opl.autosave) for (const n of [opl.mod, opl.dat]) if (n && oplDirty(n)) await oplSave(n);
    const [mod, dat] = [await oplText(opl.mod), await oplText(opl.dat)];
    await new Promise((r) => setTimeout(r, 30)); // laisse l'affichage « Calcul… » apparaître
    const t0 = performance.now();
    const res = Opl.run(mod, dat);
    res.ms = Math.round(performance.now() - t0);
    res.modName = opl.mod; res.datName = opl.dat;
    opl.result = res;
    opl.resTab = res.error ? 'console' : (res.status === 'optimal' ? 'solution' : 'console');
    if (res.status === 'optimal' && res.post && res.post.length) opl.resTab = 'console';
    if (res.error) oplShowError(res.error);
  } catch (e) {
    opl.result = { error: { message: e.message, line: 0, where: 'mod' } };
  }
  opl.running = false; oplRenderPair(); oplRenderResults();
  el('oplResults').classList.remove('collapsed');
}

function oplShowError(err) {
  const name = err.where === 'dat' ? opl.dat : opl.mod;
  if (!name || !err.line) return;
  oplOpenFile(name).then(() => {
    const doc = opl.open.get(name).doc, line = Math.min(err.line, doc.lineCount()) - 1;
    const handle = doc.addLineClass(line, 'background', 'opl-err-line');
    opl.errLine = { doc, handle };
    opl.cm.scrollIntoView({ line, ch: 0 }, 80);
    opl.cm.setCursor({ line, ch: 0 });
  });
}

// ---------------------------------------------------------------- Résultats
const OPL_STATUS = { optimal: 'Optimal', infeasible: 'Impossible', unbounded: 'Non borné', limit: 'Interrompu' };

function oplRenderResults() {
  const res = opl.result, body = el('oplResBody');
  document.querySelectorAll('.opl-rtab').forEach((b) => b.classList.toggle('active', b.dataset.tab === opl.resTab));
  const st = el('oplStatus');
  if (!res) { st.textContent = ''; body.innerHTML = '<div class="empty-hint">Écris un modèle puis clique sur ▶ Exécuter (F5).</div>'; return; }
  if (res.error) {
    st.textContent = '✖ Erreur'; st.className = 'opl-status err';
    body.innerHTML = `<div class="opl-err"><b>${res.error.where === 'dat' ? 'Fichier de données' : 'Modèle'}</b> — ${escapeHtml(res.error.message)}
      ${res.error.line ? `<br><button class="btn-ghost" id="oplGoErr">Aller à la ligne ${res.error.line}</button>` : ''}</div>`;
    const g = el('oplGoErr'); if (g) g.onclick = () => oplShowError(res.error);
    return;
  }
  const ok = res.status === 'optimal';
  st.textContent = ok ? `✔ Optimal · z = ${Opl.fmtNum(res.objective)}` : `✖ ${OPL_STATUS[res.status] || res.status}`;
  st.className = 'opl-status ' + (ok ? 'ok' : 'err');
  if (opl.resTab === 'console') body.innerHTML = oplConsoleHtml(res);
  else if (opl.resTab === 'solution') body.innerHTML = ok ? oplSolutionHtml(res) : oplConsoleHtml(res);
  else body.innerHTML = ok ? oplConstraintsHtml(res) : oplConsoleHtml(res);
}

function oplConsoleHtml(res) {
  const lines = [];
  if (res.status === 'optimal') {
    lines.push(`// solution (${res.stats && res.stats.mip ? 'optimal, entiers' : 'optimal'}) with objective ${Opl.fmtNum(res.objective)}`);
    res.variables.forEach((v) => lines.push(`${v.name} = ${v.text};`));
    if (res.console && res.console.length) lines.push('', ...res.console);
    if (res.post && res.post.length) lines.push('', ...res.post);
  } else {
    lines.push(`// No solution : ${OPL_STATUS[res.status] || res.status}`, res.message || '');
    if (res.console && res.console.length) lines.push('', ...res.console);
  }
  lines.push('', `// ${res.modName}${res.datName ? ' + ' + res.datName : ''} · ${res.ms} ms`);
  return `<pre class="opl-console">${escapeHtml(lines.join('\n'))}</pre>`;
}

function oplSolutionHtml(res) {
  const s = res.stats;
  const rows = res.variables.map((v) => `<tr><th>${escapeHtml(v.name)}</th><td>${escapeHtml(v.text)}</td></tr>`).join('');
  return `<div class="opl-sol">
    <div class="opl-obj">Valeur de l'objectif <b>${Opl.fmtNum(res.objective)}</b></div>
    <div class="opl-meta">${s && s.mip ? `Problème en nombres entiers · ${s.nodes} nœud(s) exploré(s) · relaxation continue : ${Opl.fmtNum(s.relaxation)}` : 'Programme linéaire (variables continues)'} · ${res.ms} ms</div>
    <table class="opl-table"><thead><tr><th>Variable</th><th>Valeur</th></tr></thead><tbody>${rows || '<tr><td colspan="2">Aucune variable</td></tr>'}</tbody></table></div>`;
}

function oplConstraintsHtml(res) {
  const hasDual = res.constraints.some((c) => c.dual !== null);
  const rows = res.constraints.map((c) => `<tr class="${c.binding ? 'bind' : ''}"><th>${escapeHtml(c.name)}</th><td>${c.activity}</td><td>${c.op === '=' ? '=' : c.op === '<=' ? '≤' : '≥'}</td><td>${c.rhs}</td><td>${c.slack}</td>${hasDual ? `<td>${c.dual === null ? '' : c.dual}</td>` : ''}</tr>`).join('');
  return `<table class="opl-table"><thead><tr><th>Contrainte</th><th>Valeur</th><th></th><th>Second membre</th><th>Marge</th>${hasDual ? '<th title="Variation de z si le second membre augmente de 1 (calculée par perturbation)">Prix dual</th>' : ''}</tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Aucune contrainte</td></tr>'}</tbody></table>
    <div class="opl-meta">Les lignes surlignées sont saturées (marge nulle).${hasDual ? ' Prix dual : variation de z pour +1 sur le second membre, valable tant que la base optimale ne change pas.' : ' Les prix duaux ne sont donnés que pour les modèles sans variable entière.'}</div>`;
}

// ---------------------------------------------------------------- Événements
function bindOplEvents() {
  el('oplFiles').addEventListener('click', (e) => {
    const row = e.target.closest('.opl-file'); if (!row) return;
    const name = row.dataset.name, act = e.target.closest('[data-act]');
    if (act) { act.dataset.act === 'rename' ? oplRename(name) : oplDelete(name); return; }
    oplOpenFile(name);
  });
  el('oplTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.opl-tab'); if (!tab) return;
    if (e.target.closest('[data-close]')) oplCloseTab(tab.dataset.name); else oplActivate(tab.dataset.name);
  });
  el('oplNewModBtn').onclick = () => oplNewFile('mod');
  el('oplNewDatBtn').onclick = () => oplNewFile('dat');
  el('oplImportBtn').onclick = async () => {
    const r = await window.studyide.oplImport();
    if (!r.ok) { notify('⚠ ' + r.error); return; }
    if (r.names.length) { await oplRefreshFiles(); await oplOpenFile(r.names[0]); notify(`${r.names.length} fichier(s) importé(s)`); }
  };
  el('oplFolderBtn').onclick = () => window.studyide.oplOpenFolder();
  el('oplSaveBtn').onclick = () => oplSave(opl.active);
  el('oplSaveAsBtn').onclick = async () => {
    const f = opl.open.get(opl.active); if (!f) return;
    const r = await window.studyide.oplExport(opl.active, f.doc.getValue());
    if (!r.ok) notify('⚠ ' + r.error); else if (r.saved) notify('Copie enregistrée : ' + r.path);
  };
  el('oplRunBtn').onclick = oplRun;
  el('oplModSel').onchange = (e) => { opl.mod = e.target.value || null; oplRenderFiles(); oplSaveSession(); };
  el('oplDatSel').onchange = (e) => { opl.dat = e.target.value || null; oplRenderFiles(); oplSaveSession(); };
  el('oplAutosave').onchange = (e) => { opl.autosave = e.target.checked; oplSaveSession(); };
  const ex = el('oplExamples');
  ex.innerHTML = '<option value="">📚 Exemples…</option>' + Object.keys(OPL_EXAMPLES).map((k) => `<option>${escapeHtml(k)}</option>`).join('');
  ex.onchange = (e) => { const k = e.target.value; e.target.value = ''; if (k) oplLoadExample(k); };
  document.querySelectorAll('.opl-rtab').forEach((b) => { b.onclick = () => { opl.resTab = b.dataset.tab; oplRenderResults(); }; });
}
