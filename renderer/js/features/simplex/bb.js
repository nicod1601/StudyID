// Onglet « Branch & Bound » : arbre construit automatiquement, calculs expliqués, astuces, mode quiz.
const BB_EXAMPLES = {
  'Sac à dos 4 objets (feuille TD)': { domain: 'binary', text: 'max 16x1 + 22x2 + 12x3 + 8x4\n5x1 + 7x2 + 4x3 + 3x4 <= 14' },
  'Sac à dos 5 objets': { domain: 'binary', text: 'max 10x1 + 13x2 + 7x3 + 8x4 + 4x5\n6x1 + 8x2 + 5x3 + 6x4 + 3x5 <= 16' },
  'PLNE entier (2 variables)': { domain: 'integer', text: 'max 5x1 + 4x2\n6x1 + 4x2 <= 24\nx1 + 2x2 <= 6' },
  'PLNE entier (minimisation)': { domain: 'integer', text: 'min 3x1 + 4x2\n2x1 + x2 >= 7\nx1 + 3x2 >= 9' }
};
const BB_TIPS = [
  'Sac à dos : classe les objets par ratio valeur/poids décroissant. La relaxation prend les objets dans cet ordre, le dernier est pris en fraction.',
  'La variable fractionnaire est toujours le premier objet qui ne rentre pas entièrement : x = reste / poids.',
  'Si les coefficients de la fonction objectif sont entiers, z est entier : on peut arrondir la borne (⌊43,71⌋ = 43, ⌊42,86⌋ = 42).',
  'Arrêt par la borne : si ⌊borne⌋ ≤ meilleure solution entière connue (en max), inutile de développer ce nœud.',
  'Trois raisons d\'arrêter un nœud : solution entière, irréalisable, ou borne pas meilleure que l\'incumbent.',
  'Explorer en priorité la branche qui garde le plus d\'objets intéressants (x = 1) donne vite une bonne solution et élague davantage.',
  'Un nœud irréalisable en binaire : la somme des poids des objets fixés à 1 dépasse la capacité.',
  'L\'optimum final ne dépend pas de l\'ordre d\'exploration, seule la taille de l\'arbre change.'
];
const bbs = { res: null, shown: 0, quiz: false, answers: {}, sel: 1 };

function bbOptions() {
  return { domain: el('bbDomain').value, first: el('bbFirst').value, strategy: el('bbStrategy').value, branch: el('bbBranch').value };
}

function bbRun() {
  const out = el('bbOut');
  try {
    bbs.res = BB.run(el('bbInput').value, bbOptions());
  } catch (e) { out.innerHTML = `<div class="sx-error">${escapeHtml(e.message)}</div>`; bbs.res = null; return; }
  bbs.quiz = el('bbQuiz').checked;
  bbs.answers = {};
  bbs.shown = bbs.quiz ? 1 : bbs.res.nodes.length;
  bbs.sel = 1;
  bbRender();
}

function bbNodeText(n) {
  const r = bbs.res;
  if (n.status === 'skipped') return '<div class="bb-sol">Arrêt (non calculé)</div>';
  if (n.status === 'infeasible') return '<div class="bb-sol">Irréalisable</div>';
  const x = '(' + n.x.map((v) => (v.d === 1n ? v.toString() : BB.dec(v))).join(', ') + ')';
  return `<div class="bb-sol">${x}</div><div class="bb-z">z = ${BB.dec(n.z)}</div>`;
}
const BB_BADGE = {
  branch: ['Branche', 'b-branch'], 'integer-best': ['Solution ✓', 'b-best'], integer: ['Entière · Arrêt', 'b-stop'],
  infeasible: ['Arrêt', 'b-stop'], pruned: ['Arrêt', 'b-stop'], skipped: ['Arrêt', 'b-stop'], error: ['Erreur', 'b-stop']
};

function bbTree(id) {
  const n = bbs.res.nodes[id - 1];
  if (id > bbs.shown) return '';
  const hidden = bbs.quiz && !bbs.answers[id] && id !== 1 ? false : false;
  const revealed = !bbs.quiz || bbs.answers[id] || id < bbs.shown;
  const b = revealed ? BB_BADGE[n.status] : ['?', 'b-unk'];
  const kids = n.children.filter((c) => c <= bbs.shown).map((c) => {
    const ch = bbs.res.nodes[c - 1];
    return `<li><span class="bb-edge">${escapeHtml(ch.label)}</span>${bbTree(c)}</li>`;
  }).join('');
  return `<div class="bb-node ${b[1]} ${bbs.sel === id ? 'sel' : ''}" data-id="${id}"><div class="bb-num">${id}</div>${revealed ? bbNodeText(n) : '<div class="bb-sol">…</div>'}<div class="bb-badge">${b[0]}</div></div>${kids ? `<ul>${kids}</ul>` : ''}`;
}

function bbDetail() {
  const n = bbs.res.nodes[bbs.sel - 1];
  if (!n) return '';
  const hide = bbs.quiz && !bbs.answers[n.id] && n.id >= bbs.shown;
  if (hide) return '<div class="bb-detail"><b>Nœud ' + n.id + '</b> : trouve la décision, puis la correction s\'affiche.</div>';
  const lines = n.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  return `<div class="bb-detail"><h4>Nœud ${n.id}${n.label ? ' — ' + escapeHtml(n.label) : ' — problème de départ'}</h4>
    ${lines ? `<div class="bb-sub">Explication</div><ul>${lines}</ul>` : ''}
    ${n.calc ? `<div class="bb-calc">${escapeHtml(n.calc)}</div>` : ''}
    <div class="bb-rule">${escapeHtml(n.rule)}</div>
    <div class="actions"><button class="btn-ghost" id="bbOpenLp">Ouvrir ce PL dans « Résoudre »</button></div></div>`;
}

function bbQuizBox() {
  if (!bbs.quiz) return '';
  const r = bbs.res, id = bbs.shown;
  if (id > r.nodes.length || bbs.answers[id] === undefined && id > r.nodes.length) return '';
  const n = r.nodes[id - 1];
  if (!n || bbs.answers[id]) return '';
  const wanted = { branch: 'branch', 'integer-best': 'int', integer: 'int', infeasible: 'infeas', pruned: 'bound', skipped: 'bound', error: 'branch' }[n.status];
  const btn = (k, t) => `<button class="btn-ghost bb-ans" data-k="${k}" data-ok="${wanted === k ? 1 : 0}">${t}</button>`;
  return `<div class="bb-quiz"><b>Nœud ${id}${n.label ? ' (' + escapeHtml(n.label) + ')' : ''}</b> — après avoir résolu la relaxation, que fais-tu ?
    <div class="actions">${btn('branch', 'Brancher')}${btn('int', 'Arrêt : solution entière')}${btn('infeas', 'Arrêt : irréalisable')}${btn('bound', 'Arrêt : borne trop faible')}</div>
    <div id="bbFeedback"></div></div>`;
}

function bbRatios() {
  const kn = bbs.res.knapsack;
  if (!kn) return '';
  const rows = kn.items.map((it) => `<tr><td>${escapeHtml(it.name)}</td><td>${it.v}</td><td>${it.a}</td><td>${BB.dec(it.ratio)}</td><td><b>${it.priority}</b></td></tr>`).join('');
  return `<div class="bb-ratios"><div class="bb-sub">Ratios valeur / poids (capacité ${kn.b})</div><table class="sx-table"><thead><tr><th>Objet</th><th>Valeur</th><th>Poids</th><th>Ratio</th><th>Priorité</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function bbRender() {
  const r = bbs.res;
  if (!r) return;
  const total = r.nodes.length;
  const done = bbs.shown >= total && (!bbs.quiz || bbs.answers[total]);
  const opt = r.optimal;
  const summary = done ? `<div class="bb-summary">${opt ? `Optimum : <b>z = ${opt.z}</b> avec ${r.prob.vars.map((v, i) => v + ' = ' + opt.x[i]).join(', ')} (nœud ${opt.node}). ${r.solved} relaxations résolues, ${total} nœuds.` : 'Aucune solution entière réalisable.'}</div>` : '';
  const nav = `<div class="actions bb-nav"><button class="btn-ghost" id="bbPrev">◀</button><span>Étape ${Math.min(bbs.shown, total)} / ${total}</span><button class="btn-ghost" id="bbNext">▶</button><button class="btn-ghost" id="bbAll">Tout afficher</button><button class="btn-ghost" id="bbCsv">CSV</button></div>`;
  el('bbOut').innerHTML = `${bbRatios()}${nav}${bbQuizBox()}<div class="bb-tree"><ul><li>${bbTree(1)}</li></ul></div>${summary}${bbDetail()}
    <details class="bb-tips" open><summary>💡 Astuces</summary><ul>${BB_TIPS.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul></details>`;
  bbBind();
}

function bbBind() {
  const r = bbs.res;
  document.querySelectorAll('.bb-node').forEach((d) => { d.onclick = () => { bbs.sel = +d.dataset.id; bbRender(); }; });
  const nx = el('bbNext'), pv = el('bbPrev');
  if (nx) nx.onclick = () => {
    if (bbs.quiz && !bbs.answers[bbs.shown]) return;
    if (bbs.shown < r.nodes.length) { bbs.shown++; bbs.sel = bbs.shown; bbRender(); }
  };
  if (pv) pv.onclick = () => { if (bbs.shown > 1) { bbs.shown--; bbs.sel = bbs.shown; bbRender(); } };
  el('bbAll').onclick = () => { bbs.shown = r.nodes.length; r.nodes.forEach((n) => { bbs.answers[n.id] = true; }); bbRender(); };
  el('bbCsv').onclick = bbCsv;
  const lp = el('bbOpenLp');
  if (lp) lp.onclick = () => { el('sxInput').value = r.nodes[bbs.sel - 1].lpText; sxTab('solve'); sxSolve(); };
  document.querySelectorAll('.bb-ans').forEach((b) => {
    b.onclick = () => {
      const ok = b.dataset.ok === '1';
      if (ok) { bbs.answers[bbs.shown] = true; bbs.sel = bbs.shown; bbRender(); return; }
      el('bbFeedback').innerHTML = '<span class="bb-bad">✗ Pas tout à fait. Compare z (arrondi) à la meilleure solution connue et regarde si les variables sont entières.</span>';
    };
  });
}

function bbCsv() {
  const r = bbs.res;
  const rows = [['noeud', 'pere', 'decision', 'x', 'z', 'statut']].concat(r.nodes.map((n) => [n.id, n.parent || '', n.label || '', n.x ? n.x.map(String).join(' ') : '', n.z ? BB.dec(n.z) : '', n.rule]));
  const csv = rows.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = 'branch-and-bound.csv';
  a.click();
}

function initBB() {
  el('bbExamples').innerHTML = '<option value="">Exemples…</option>' + Object.keys(BB_EXAMPLES).map((k) => `<option>${escapeHtml(k)}</option>`).join('');
  el('bbExamples').onchange = (e) => {
    const ex = BB_EXAMPLES[e.target.value];
    if (ex) { el('bbInput').value = ex.text; el('bbDomain').value = ex.domain; bbRun(); }
    e.target.value = '';
  };
  el('bbRunBtn').onclick = bbRun;
  ['bbDomain', 'bbFirst', 'bbStrategy', 'bbBranch', 'bbQuiz'].forEach((i) => { el(i).onchange = () => { if (bbs.res) bbRun(); }; });
  el('bbInput').value = BB_EXAMPLES['Sac à dos 4 objets (feuille TD)'].text;
}
