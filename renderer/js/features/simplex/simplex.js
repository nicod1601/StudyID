// Section Simplexe : solveur pas à pas, entraînement avec exercices générés, mode guidé.
// Le calcul est dans engine.js (window.Simplex) ; ce fichier ne s'occupe que de l'affichage.

const SX_EXAMPLES = {
  'Maximisation (2 variables)': 'max 3x1 + 2x2\n2x1 + x2 <= 18\n2x1 + 3x2 <= 42\n3x1 + x2 <= 24',
  'Minimisation (deux phases)': 'min 2x1 + 3x2\nx1 + x2 >= 4\nx1 + 3x2 >= 6',
  'Avec une égalité': 'max x1 + 2x2\nx1 + x2 = 4\nx1 <= 3',
  'Solution non bornée': 'max x1 + x2\nx1 - x2 <= 1',
  'Problème impossible': 'max x1\nx1 <= 1\nx1 >= 3',
  'Optimum multiple': 'max 2x1 + 4x2\nx1 + 2x2 <= 4\nx1 <= 3'
};
const SX_LEVELS = { 1: 'Facile : 2 variables, contraintes ≤', 2: 'Moyen : 3 variables, contraintes ≤', 3: 'Difficile : minimisation, deux phases' };

const sx = { ready: false, tab: 'solve', res: null, shown: 0, ex: null, mode: 'answer', k: 0, guidedOk: true };

function initSimplexMode() {
  if (sx.ready) return;
  sx.ready = true;
  const sel = el('sxExamples');
  sel.innerHTML = '<option value="">Exemples…</option>' + Object.keys(SX_EXAMPLES).map((k) => `<option>${escapeHtml(k)}</option>`).join('');
  el('sxLevel').innerHTML = Object.entries(SX_LEVELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  el('sxInput').value = localStorage.getItem('studyide.sxInput') || SX_EXAMPLES['Maximisation (2 variables)'];
  bindSimplexEvents();
  if (typeof initBB === "function") initBB();
}

function sxFr(s) { return Simplex.Fr.of(s); }

// ---------------------------------------------------------------- Rendu d'un tableau
function sxTable(step, opts = {}) {
  const { showPivot = true } = opts;
  const pv = showPivot ? step.pivot : null;
  const head = step.cols.map((c, j) => `<th class="${pv && pv.c === j ? 'sx-enter' : ''}">${escapeHtml(c)}${pv && pv.c === j ? ' ▼' : ''}</th>`).join('');
  const costRow = step.cost.map((c) => `<td class="sx-cost">${c}</td>`).join('');
  const body = step.rows.map((r, i) => {
    const leaving = pv && pv.r === i;
    return `<tr class="${leaving ? 'sx-leave' : ''}"><th>${escapeHtml(step.basis[i])}${leaving ? ' ◀' : ''}</th><td class="sx-cost">${step.cB[i]}</td>`
      + r.a.map((v, j) => `<td class="${pv && pv.c === j ? 'sx-col' : ''}${leaving && pv.c === j ? ' sx-pivot' : ''}">${v}</td>`).join('') + `<td class="sx-b">${r.b}</td></tr>`;
  }).join('');
  const delta = step.delta.map((d) => `<td class="${sxFr(d).sign() > 0 ? 'sx-pos' : ''}">${d}</td>`).join('');
  return `<div class="sx-scroll"><table class="sx-table">
    <thead><tr><th class="sx-corner">cⱼ</th><td></td>${costRow}<td></td></tr>
    <tr><th>Base</th><th class="sx-cost">c<sub>B</sub></th>${head}<th>b</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th>Δⱼ = cⱼ − zⱼ</th><td></td>${delta}<td class="sx-b">z = ${step.z}</td></tr></tfoot>
  </table></div>`;
}

// Explication d'un pivot : colonne entrante, rapports, ligne sortante
function sxExplain(step) {
  if (!step.pivot) return step.note ? `<p class="sx-note">${escapeHtml(step.note)}</p>` : '';
  const { r, c, enter, leave } = step.pivot;
  const dMax = step.delta[c];
  const ratios = step.rows.map((row, i) => ({ i, a: sxFr(row.a[c]), b: sxFr(row.b) })).filter((x) => x.a.sign() > 0)
    .map((x) => `${escapeHtml(step.basis[x.i])} : ${x.b}/${x.a} = <b>${x.b.div(x.a)}</b>`);
  return `<p class="sx-note">${step.note ? escapeHtml(step.note) + '<br>' : ''}
    <b>Entrante :</b> ${escapeHtml(enter)} (Δ = ${dMax}, le plus grand positif). 
    <b>Rapports b/a :</b> ${ratios.join(' · ')} → le plus petit sort : <b>${escapeHtml(leave)}</b>. 
    <b>Pivot :</b> ${step.rows[r].a[c]}</p>`;
}

function sxStepsHtml(res, upTo) {
  const out = [];
  let phase = 0;
  res.steps.slice(0, upTo).forEach((st, i) => {
    if (st.phase !== phase) {
      phase = st.phase;
      const hasTwo = res.steps.some((s) => s.phase === 1) && res.steps.some((s) => s.phase === 2);
      if (hasTwo) out.push(`<h4 class="sx-phase">Phase ${phase}${phase === 1 ? ' — on minimise la somme des variables artificielles' : ' — on revient à la fonction objectif'}</h4>`);
    }
    out.push(`<div class="sx-step"><div class="sx-step-title">Tableau ${i + 1}</div>${sxTable(st)}${sxExplain(st)}</div>`);
  });
  return out.join('');
}

function sxResultHtml(res) {
  if (res.status === 'infeasible') return `<div class="sx-result err"><b>Problème impossible</b><br>Après la phase 1, la somme des artificielles reste strictement positive : aucune solution ne vérifie toutes les contraintes.</div>`;
  if (res.status === 'unbounded') return `<div class="sx-result err"><b>Solution non bornée</b><br>La variable ${escapeHtml(res.unboundedVar)} peut entrer en base sans que rien ne la limite : la fonction objectif peut ${res.type === 'max' ? 'croître' : 'décroître'} indéfiniment.</div>`;
  const sol = res.vars.map((v, i) => `${escapeHtml(v)}* = <b>${res.x[i]}</b>`).join(' &nbsp; ');
  const notes = [];
  if (res.alternative) notes.push('Un Δⱼ nul pour une variable hors base : il existe <b>d\'autres solutions optimales</b> (optimum multiple).');
  if (res.degenerate) notes.push('Dégénérescence rencontrée (ex æquo dans les rapports ou b = 0).');
  return `<div class="sx-result ok"><b>Solution optimale</b><br>${sol}<br><span class="sx-z">z* = ${res.z}</span> <span class="sx-approx">≈ ${res.z.toNumber().toFixed(4).replace(/\.?0+$/, '')}</span>
    ${notes.map((n) => `<div class="sx-note">${n}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- Onglet « Résoudre »
function sxSolve() {
  const text = el('sxInput').value;
  try { localStorage.setItem('studyide.sxInput', text); } catch (e) { /* ignoré */ }
  const out = el('sxOut');
  try {
    const prob = Simplex.parseProblem(text);
    sx.res = Simplex.solve(prob);
    sx.res.prob = prob;
    sx.shown = 1;
    sxRenderSolve();
  } catch (e) {
    sx.res = null;
    out.innerHTML = `<div class="sx-result err">⚠ ${escapeHtml(e.message)}</div>`;
  }
}

function sxRenderSolve() {
  const res = sx.res;
  const total = res.steps.length;
  const std = res.standard.map((s) => escapeHtml(s)).join('\n');
  el('sxOut').innerHTML = `
    <div class="sx-block"><h4>Forme standard</h4>
      <pre class="sx-pre">${escapeHtml(Simplex.problemToText(res.prob).split('\n')[0].replace(/^max|^min/, (m) => m + ' '))}\n${std}</pre>
      <div class="sx-hint">e<sub>i</sub> : variable d'écart ou de surplus · a<sub>i</sub> : variable artificielle (phase 1)</div></div>
    ${sxStepsHtml(res, sx.shown)}
    <div class="sx-nav">
      ${sx.shown < total ? `<button class="btn-run" id="sxNext">Tableau suivant ▸</button><button class="btn-ghost" id="sxAll">Tout afficher</button>` : ''}
      <span class="sx-hint">${Math.min(sx.shown, total)} / ${total} tableaux</span>
    </div>
    ${sx.shown >= total ? sxResultHtml(res) : ''}`;
  const n = el('sxNext'); if (n) n.onclick = () => { sx.shown++; sxRenderSolve(); };
  const a = el('sxAll'); if (a) a.onclick = () => { sx.shown = total; sxRenderSolve(); };
}

// ---------------------------------------------------------------- Onglet « S'entraîner »
function sxNewExercise() {
  sx.ex = Simplex.generate(Number(el('sxLevel').value), Date.now() & 0x7fffffff);
  sx.mode = 'answer'; sx.k = 0;
  sxRenderTrain();
}

function sxRenderTrain() {
  const host = el('sxTrain');
  if (!sx.ex) { host.innerHTML = '<div class="empty-hint">Choisis un niveau puis « Nouvel exercice ».</div>'; return; }
  const modes = [['answer', '✍ Je réponds'], ['guided', '🧭 Pas à pas guidé'], ['solution', '📖 Correction']];
  host.innerHTML = `
    <div class="sx-block"><h4>Énoncé <small>(x ≥ 0)</small></h4><pre class="sx-pre">${escapeHtml(sx.ex.text)}</pre>
      <button class="btn-ghost" id="sxToSolver">Ouvrir dans le solveur</button></div>
    <div class="sx-modes">${modes.map(([k, l]) => `<button class="sx-mode${sx.mode === k ? ' active' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
    <div id="sxTrainBody"></div>`;
  el('sxToSolver').onclick = () => { el('sxInput').value = sx.ex.text; sxTab('solve'); sxSolve(); };
  host.querySelectorAll('.sx-mode').forEach((b) => { b.onclick = () => { sx.mode = b.dataset.m; sx.k = 0; sxRenderTrain(); }; });
  const body = el('sxTrainBody');
  if (sx.mode === 'answer') sxRenderAnswer(body);
  else if (sx.mode === 'guided') sxRenderGuided(body);
  else body.innerHTML = sxStepsHtml(sx.ex.result, sx.ex.result.steps.length) + sxResultHtml(sx.ex.result);
}

function sxAnswerFields(prefix) {
  const r = sx.ex.result;
  return `<div class="sx-answer">
    ${r.vars.map((v) => `<label>${escapeHtml(v)}* <input id="${prefix}${v}" autocomplete="off" placeholder="ex : 3/2"></label>`).join('')}
    <label>z* <input id="${prefix}z" autocomplete="off" placeholder="ex : 33"></label>
  </div><div id="${prefix}fb" class="sx-feedback"></div>`;
}

function sxCheckAnswer(prefix) {
  const r = sx.ex.result;
  let allOk = true;
  const mark = (id, expected) => {
    const inp = el(prefix + id);
    let ok = false;
    try { ok = Simplex.Fr.parse(inp.value).cmp(expected) === 0; } catch (e) { ok = false; }
    inp.classList.toggle('ok', ok); inp.classList.toggle('ko', !ok);
    if (!ok) allOk = false;
  };
  r.vars.forEach((v, i) => mark(v, r.x[i]));
  mark('z', r.z);
  el(prefix + 'fb').innerHTML = allOk
    ? '✅ Bravo, la solution est exacte.'
    : '❌ Il y a une erreur (champs en rouge). Vérifie tes calculs, ou passe par le mode guidé.';
  el(prefix + 'fb').className = 'sx-feedback ' + (allOk ? 'ok' : 'ko');
  return allOk;
}

function sxRenderAnswer(body) {
  body.innerHTML = `<p class="sx-hint">Résous l'exercice sur papier, puis entre la solution (fractions ou décimaux).</p>${sxAnswerFields('sxA_')}
    <div class="sx-nav"><button class="btn-run" id="sxCheck">Vérifier</button><button class="btn-ghost" id="sxShow">Voir la correction</button></div>`;
  el('sxCheck').onclick = () => sxCheckAnswer('sxA_');
  el('sxShow').onclick = () => { sx.mode = 'solution'; sxRenderTrain(); };
}

// Mode guidé : l'élève choisit lui-même variable entrante et sortante à chaque tableau
function sxRenderGuided(body) {
  const res = sx.ex.result, steps = res.steps;
  const k = Math.min(sx.k, steps.length - 1);
  const hist = steps.slice(0, k).map((st, i) => `<div class="sx-step done"><div class="sx-step-title">Tableau ${i + 1} ✓</div>${sxTable(st)}${sxExplain(st)}</div>`).join('');
  const cur = steps[k];
  if (!cur.pivot) { // dernier tableau : lecture de la solution
    body.innerHTML = `${hist}<div class="sx-step"><div class="sx-step-title">Tableau ${k + 1} — optimal</div>${sxTable(cur)}</div>
      <p class="sx-hint">Tous les Δⱼ sont ≤ 0. Lis la solution dans le tableau.</p>${sxAnswerFields('sxG_')}
      <div class="sx-nav"><button class="btn-run" id="sxGCheck">Vérifier</button></div>`;
    el('sxGCheck').onclick = () => sxCheckAnswer('sxG_');
    return;
  }
  const phase = res.steps.some((s) => s.phase === 1) ? `<span class="sx-badge">Phase ${cur.phase}</span> ` : '';
  const opts = (arr) => '<option value="">—</option>' + arr.map((x) => `<option>${escapeHtml(x)}</option>`).join('');
  body.innerHTML = `${hist}<div class="sx-step"><div class="sx-step-title">${phase}Tableau ${k + 1}</div>${sxTable(cur, { showPivot: false })}
    ${cur.note ? `<p class="sx-note">${escapeHtml(cur.note)}</p>` : ''}
    <div class="sx-guess">
      <label>Variable entrante <select id="sxEnter">${opts(cur.cols.filter((c) => !cur.basis.includes(c)))}</select></label>
      <label>Variable sortante <select id="sxLeave">${opts(cur.basis)}</select></label>
      <button class="btn-run" id="sxGo">Valider</button>
      <button class="btn-ghost" id="sxReveal">Voir la réponse</button>
    </div><div id="sxGfb" class="sx-feedback"></div></div>`;
  const fb = el('sxGfb');
  const advance = () => { sx.k = k + 1; sxRenderGuided(body); };
  el('sxGo').onclick = () => {
    const e = el('sxEnter').value, l = el('sxLeave').value;
    if (!e || !l) { fb.className = 'sx-feedback ko'; fb.textContent = 'Choisis les deux variables.'; return; }
    if (e !== cur.pivot.enter) { fb.className = 'sx-feedback ko'; fb.innerHTML = '❌ Variable entrante incorrecte. Rappel : on choisit le plus grand Δⱼ strictement positif.'; return; }
    if (l !== cur.pivot.leave) { fb.className = 'sx-feedback ko'; fb.innerHTML = '❌ L\'entrante est bonne, mais pas la sortante. Rappel : on calcule b/a pour les a > 0 de la colonne entrante et on prend le plus petit rapport.'; return; }
    fb.className = 'sx-feedback ok'; fb.innerHTML = '✅ Correct. Fais le pivot sur papier puis compare avec le tableau suivant.';
    setTimeout(advance, 700);
  };
  el('sxReveal').onclick = () => { fb.className = 'sx-feedback'; fb.innerHTML = `Entrante <b>${escapeHtml(cur.pivot.enter)}</b>, sortante <b>${escapeHtml(cur.pivot.leave)}</b>.`; el('sxEnter').value = cur.pivot.enter; el('sxLeave').value = cur.pivot.leave; };
}

// ---------------------------------------------------------------- Onglets / événements
function sxTab(tab) {
  sx.tab = tab;
  document.querySelectorAll('.sx-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  el('sxPaneSolve').classList.toggle('hidden', tab !== 'solve');
  el('sxPaneTrain').classList.toggle('hidden', tab !== 'train');
  el('sxPaneBB').classList.toggle('hidden', tab !== 'bb');
  if (tab === 'train' && !sx.ex) sxNewExercise();
  if (tab === 'bb' && !bbs.res) bbRun();
}

function bindSimplexEvents() {
  document.querySelectorAll('.sx-tab').forEach((b) => { b.onclick = () => sxTab(b.dataset.tab); });
  el('sxSolveBtn').onclick = sxSolve;
  el('sxClearBtn').onclick = () => { el('sxInput').value = ''; el('sxOut').innerHTML = ''; el('sxInput').focus(); };
  el('sxInput').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sxSolve(); } });
  el('sxExamples').onchange = (e) => { const t = SX_EXAMPLES[e.target.value]; if (t) { el('sxInput').value = t; sxSolve(); } e.target.value = ''; };
  el('sxNewBtn').onclick = sxNewExercise;
  el('sxLevel').onchange = sxNewExercise;
  sxSolve();
}
