// Moteur Branch & Bound : construit l'arbre comme sur une feuille de TD (numéro d'exploration, solution de la
// relaxation, valeur de la borne, décision « Arrêt » / « solution réalisable » / « irréalisable ») et fournit
// pour chaque nœud le calcul expliqué. S'appuie sur le simplexe en fractions exactes (engine.js).
// Aucune dépendance au DOM : testable avec Node.

(function (root) {
  'use strict';

  const S = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Simplex;
  const { Fr } = S;
  const ZERO = new Fr(0n), ONE = new Fr(1n);

  const isInt = (f) => f.d === 1n;
  const floorFr = (f) => { let q = f.n / f.d; if (f.n < 0n && f.n % f.d !== 0n) q -= 1n; return new Fr(q); };
  const ceilFr = (f) => (isInt(f) ? f : floorFr(f).add(ONE));
  const dec = (f) => String(parseFloat(f.toNumber().toFixed(2)));        // 43.71
  const show = (f) => (isInt(f) ? f.toString() : `${f} ≈ ${dec(f)}`);   // 3/7 ≈ 0.43

  // ------------------------------------------------------------------ Relaxation d'un nœud
  function solveNode(prob, lb, ub) {
    const n = prob.vars.length;
    const cons = prob.cons.map((c) => ({ a: c.a, op: c.op, b: c.b }));
    const unit = (i) => prob.vars.map((_, j) => (j === i ? ONE : ZERO));
    for (let i = 0; i < n; i++) {
      if (ub[i] !== null && lb[i].cmp(ub[i]) > 0) return { status: 'infeasible' };
      if (ub[i] !== null) cons.push({ a: unit(i), op: '<=', b: ub[i] });
      if (lb[i].sign() > 0) cons.push({ a: unit(i), op: '>=', b: lb[i] });
    }
    const r = S.solve({ type: prob.type, vars: prob.vars, c: prob.c, cons }, { record: false });
    return r.status === 'optimal' ? { status: 'optimal', x: r.x, z: r.z } : { status: r.status };
  }

  // ------------------------------------------------------------------ Sac à dos : relaxation par ratios
  // Reconnu si : max, une seule contrainte ≤, coefficients > 0, variables binaires.
  function detectKnapsack(prob, domain) {
    if (domain !== 'binary' || prob.type !== 'max' || prob.cons.length !== 1) return null;
    const c = prob.cons[0];
    if (c.op !== '<=' || c.b.sign() < 0) return null;
    if (!c.a.every((a) => a.sign() > 0) || !prob.c.every((v) => v.sign() >= 0)) return null;
    const items = prob.vars.map((name, i) => ({ i, name, a: c.a[i], v: prob.c[i], ratio: prob.c[i].div(c.a[i]) }));
    const order = items.slice().sort((p, q) => q.ratio.cmp(p.ratio) || p.i - q.i);
    order.forEach((it, k) => { it.priority = k + 1; });
    return { b: c.b, items, order };
  }

  // Explique le calcul de la relaxation d'un nœud (comme les commentaires de la feuille)
  function explainKnapsack(kn, prob, lb, ub) {
    const lines = [];
    const fixed1 = kn.items.filter((it) => lb[it.i].sign() > 0);
    const fixed0 = kn.items.filter((it) => ub[it.i] !== null && ub[it.i].isZero());
    const x = prob.vars.map(() => ZERO);
    let rem = kn.b;
    if (fixed0.length) lines.push(`Variables fixées à 0 : ${fixed0.map((i) => i.name).join(', ')} (on les ignore).`);
    if (fixed1.length) {
      const w = fixed1.reduce((s, it) => s.add(it.a), ZERO);
      fixed1.forEach((it) => { x[it.i] = ONE; });
      lines.push(`Variables fixées à 1 : ${fixed1.map((i) => i.name).join(', ')} → poids ${fixed1.map((i) => i.a).join(' + ')} = ${w}.`);
      if (w.cmp(kn.b) > 0) {
        lines.push(`${fixed1.map((i) => i.a).join(' + ')} = ${w} > ${kn.b} : la capacité est dépassée, le nœud est irréalisable.`);
        return { lines, feasible: false };
      }
      rem = kn.b.sub(w);
      lines.push(`Capacité restante : ${kn.b} − ${w} = ${rem}.`);
    }
    const free = kn.order.filter((it) => !fixed1.includes(it) && !fixed0.includes(it));
    if (free.length) lines.push(`On remplit par priorité (ratio valeur/poids décroissant) : ${free.map((i) => i.name).join(' > ')}.`);
    let stop = false;
    for (const it of free) {
      if (stop || rem.isZero()) { lines.push(`${it.name} = 0 (plus de place).`); continue; }
      if (it.a.cmp(rem) <= 0) {
        x[it.i] = ONE; rem = rem.sub(it.a);
        lines.push(`${it.name} = 1 : poids ${it.a} ≤ reste, il reste ${rem}.`);
      } else {
        x[it.i] = rem.div(it.a);
        lines.push(`${it.a}·${it.name} ≤ ${rem}  ⇒  ${it.name} ≤ ${rem}/${it.a}  ⇒  ${it.name} = ${x[it.i]}${isInt(x[it.i]) ? '' : ` ≈ ${dec(x[it.i])}`} (variable fractionnaire).`);
        stop = true;
      }
    }
    return { lines, feasible: true, x };
  }

  // z = 16 + 22 + 12 × 1/2 = 44
  function zCalc(prob, x, z) {
    const parts = [];
    prob.vars.forEach((_, i) => {
      if (x[i].isZero() || prob.c[i].isZero()) return;
      parts.push(x[i].cmp(ONE) === 0 ? `${prob.c[i]}` : `${prob.c[i]} × ${x[i]}`);
    });
    return `z = ${parts.length ? parts.join(' + ') : '0'} = ${z}${isInt(z) ? '' : ` ≈ ${dec(z)}`}`;
  }

  function explainGeneric(prob, lb, ub, res) {
    const lines = [];
    const b = [];
    prob.vars.forEach((nm, i) => {
      if (ub[i] !== null && ub[i].cmp(lb[i]) === 0) b.push(`${nm} = ${lb[i]}`);
      else { if (lb[i].sign() > 0) b.push(`${nm} ≥ ${lb[i]}`); if (ub[i] !== null) b.push(`${nm} ≤ ${ub[i]}`); }
    });
    lines.push(`On résout la relaxation (variables continues)${b.length ? ' avec ' + b.join(', ') : ''}.`);
    if (res.status === 'optimal') {
      const tight = prob.cons.filter((c) => {
        let act = ZERO; c.a.forEach((a, i) => { act = act.add(a.mul(res.x[i])); }); return act.cmp(c.b) === 0;
      });
      if (tight.length) lines.push(`Contraintes saturées à l'optimum : ${tight.map((c) => linText(c.a, prob.vars) + ' ' + c.op + ' ' + c.b).join(' ; ')}.`);
    }
    return { lines };
  }

  function linText(coefs, names) {
    let out = '';
    coefs.forEach((k, i) => {
      if (k.isZero()) return;
      const neg = k.sign() < 0, a = neg ? k.neg() : k;
      out += (out ? (neg ? ' − ' : ' + ') : (neg ? '−' : '')) + (a.cmp(ONE) === 0 ? '' : a.toString()) + names[i];
    });
    return out || '0';
  }

  // ------------------------------------------------------------------ Algorithme
  // opts : { domain: 'binary' | 'integer', strategy: 'depth' | 'best', first: 'low' | 'high', branch: 'first' | 'most', maxNodes }
  function run(text, opts = {}) {
    const o = Object.assign({ domain: 'binary', strategy: 'depth', first: 'high', branch: 'first', maxNodes: 400 }, opts);
    const prob = S.parseProblem(text);
    const n = prob.vars.length;
    const isMax = prob.type === 'max';
    const better = (a, b) => (isMax ? a.cmp(b) > 0 : a.cmp(b) < 0);
    const objInteger = prob.c.every(isInt);
    const kn = detectKnapsack(prob, o.domain);
    // borne « entière » : si tous les coefficients de l'objectif sont entiers, z est entier
    const roundBound = (z) => (objInteger ? (isMax ? floorFr(z) : ceilFr(z)) : z);

    const rootLb = prob.vars.map(() => ZERO);
    const rootUb = prob.vars.map(() => (o.domain === 'binary' ? ONE : null));
    const nodes = [];
    let open = [{ parent: null, label: null, lb: rootLb, ub: rootUb, parentBound: null, depth: 0 }];
    let incumbent = null;
    let counter = 0;

    while (open.length) {
      if (nodes.length >= o.maxNodes) throw new Error(`Arrêt après ${o.maxNodes} nœuds : l'arbre est trop gros pour être affiché.`);
      // choix du prochain nœud
      let pick = open.length - 1;
      if (o.strategy === 'best') {
        pick = 0;
        open.forEach((nd, k) => {
          const a = nd.parentBound, b = open[pick].parentBound;
          if (a === null) { pick = k; return; }
          if (b !== null && (isMax ? a.cmp(b) > 0 : a.cmp(b) < 0)) pick = k;
        });
      }
      const nd = open.splice(pick, 1)[0];
      const node = { id: ++counter, parent: nd.parent, label: nd.label, depth: nd.depth, lb: nd.lb, ub: nd.ub, children: [], status: null, lines: [], rule: '' };
      nodes.push(node);
      if (node.parent) nodes[node.parent - 1].children.push(node.id);

      // élagage par la borne du père, sans résoudre
      if (incumbent && nd.parentBound !== null && !better(roundBound(nd.parentBound), incumbent.z)) {
        node.status = 'skipped';
        node.parentBound = nd.parentBound;
        node.rule = `Arrêt sans calcul : la borne du père (${show(nd.parentBound)}${objInteger && !isInt(nd.parentBound) ? ' → ' + roundBound(nd.parentBound) : ''}) ne peut pas battre la meilleure solution connue (${incumbent.z}).`;
        continue;
      }

      const res = solveNode(prob, nd.lb, nd.ub);
      const kex = kn ? explainKnapsack(kn, prob, nd.lb, nd.ub) : null;
      if (res.status === 'infeasible') {
        node.status = 'infeasible';
        node.lines = kex ? kex.lines : explainGeneric(prob, nd.lb, nd.ub, res).lines.concat(['Le système n\'a aucune solution.']);
        node.rule = 'Arrêt : solution irréalisable (les contraintes sont incompatibles avec les décisions prises).';
        continue;
      }
      if (res.status !== 'optimal') {
        node.status = 'error'; node.rule = 'Relaxation non bornée : le problème n\'est pas borné.';
        continue;
      }
      node.x = res.x; node.z = res.z;
      const ex = kex && kex.feasible && kex.x && kex.x.every((v, i) => v.cmp(res.x[i]) === 0) ? kex : null;
      node.lines = ex ? ex.lines : explainGeneric(prob, nd.lb, nd.ub, res).lines;
      node.calc = zCalc(prob, res.x, res.z);
      node.bound = roundBound(res.z);

      const frac = [];
      res.x.forEach((v, i) => { if (!isInt(v)) frac.push(i); });
      if (!frac.length) {
        if (!incumbent || better(res.z, incumbent.z)) {
          incumbent = { id: node.id, z: res.z, x: res.x };
          node.status = 'integer-best';
          node.rule = `Solution entière réalisable, z = ${res.z}${node.id > 1 ? ' : nouvelle meilleure solution (borne inférieure mise à jour)' : ''}.`;
        } else {
          node.status = 'integer';
          node.rule = `Solution entière réalisable (z = ${res.z}), mais pas meilleure que ${incumbent.z} : Arrêt.`;
        }
        continue;
      }
      if (incumbent && !better(node.bound, incumbent.z)) {
        node.status = 'pruned';
        node.rule = `Arrêt par la borne : z = ${show(res.z)}${objInteger && !isInt(res.z) ? ` → ${isMax ? '⌊' : '⌈'}${dec(res.z)}${isMax ? '⌋' : '⌉'} = ${node.bound}` : ''} ne peut pas battre la meilleure solution connue (${incumbent.z}).`;
        continue;
      }
      // branchement
      let k = frac[0];
      if (o.branch === 'most') {
        const half = new Fr(1n, 2n);
        const dist = (v) => { const f = v.sub(floorFr(v)); return f.cmp(half) > 0 ? f.sub(half) : half.sub(f); };
        k = frac.reduce((b, i) => (dist(res.x[i]).cmp(dist(res.x[b])) < 0 ? i : b), frac[0]);
      }
      const v = res.x[k], name = prob.vars[k];
      node.status = 'branch'; node.branchVar = k;
      const lo = floorFr(v), hi = ceilFr(v);
      let lowUb = nd.ub.slice(); lowUb[k] = lo;
      let highLb = nd.lb.slice(); highLb[k] = hi;
      const lowLabel = o.domain === 'binary' ? `${name} = 0` : `${name} ≤ ${lo}`;
      const highLabel = o.domain === 'binary' ? `${name} = 1` : `${name} ≥ ${hi}`;
      node.rule = `Variable fractionnaire : ${name} = ${v}. On crée deux sous-problèmes : ${lowLabel} et ${highLabel}.`;
      const low = { parent: node.id, label: lowLabel, lb: nd.lb, ub: lowUb, parentBound: res.z, depth: nd.depth + 1 };
      const high = { parent: node.id, label: highLabel, lb: highLb, ub: nd.ub, parentBound: res.z, depth: nd.depth + 1 };
      const [a, b] = o.first === 'high' ? [high, low] : [low, high];
      open.push(b, a);   // a sera traité avant b en profondeur
      node.order = [a.label, b.label];
    }

    // texte du PL d'un nœud, réutilisable dans le solveur du simplexe
    const lpText = (node) => {
      const lines = [text.trim().split('\n').filter((l) => !/^\s*(x\d*\s*,?\s*)+>=\s*0\s*$/.test(l)).join('\n')];
      prob.vars.forEach((nm, i) => {
        if (node.ub[i] !== null && node.ub[i].cmp(node.lb[i]) === 0) lines.push(`${nm} = ${node.lb[i]}`);
        else { if (node.ub[i] !== null) lines.push(`${nm} <= ${node.ub[i]}`); if (node.lb[i].sign() > 0) lines.push(`${nm} >= ${node.lb[i]}`); }
      });
      return lines.join('\n');
    };
    nodes.forEach((nd) => { nd.lpText = lpText(nd); });

    return {
      prob, options: o, nodes, incumbent, knapsack: kn, objInteger,
      solved: nodes.filter((nd) => nd.status !== 'skipped').length,
      optimal: incumbent ? { x: incumbent.x, z: incumbent.z, node: incumbent.id } : null
    };
  }

  root.BB = { run, floorFr, ceilFr, dec, show };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BB;
})(typeof window !== 'undefined' ? window : globalThis);
