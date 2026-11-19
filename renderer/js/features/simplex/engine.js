// Moteur du simplexe : fractions exactes, parseur de programmes linéaires, méthode du tableau
// (une phase, ou deux phases quand il faut des variables artificielles), génération d'exercices.
// Aucune dépendance au DOM : le fichier se teste directement avec Node.

(function (root) {
  'use strict';

  // ---------------------------------------------------------------- Fractions exactes
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };

  class Fr {
    constructor(n, d = 1n) {
      if (d === 0n) throw new Error('Division par zéro');
      if (d < 0n) { n = -n; d = -d; }
      const g = gcd(n, d) || 1n;
      this.n = n / g; this.d = d / g;
    }
    static of(x) {
      if (x instanceof Fr) return x;
      if (typeof x === 'bigint') return new Fr(x);
      return Fr.parse(String(x));
    }
    static parse(str) {
      const s = String(str).trim().replace(',', '.').replace('−', '-');
      let m;
      if ((m = s.match(/^([+-]?\d+)\s*\/\s*(\d+)$/))) return new Fr(BigInt(m[1]), BigInt(m[2]));
      if ((m = s.match(/^([+-]?)(\d*)\.(\d+)$/))) return new Fr((m[1] === '-' ? -1n : 1n) * BigInt((m[2] || '0') + m[3]), 10n ** BigInt(m[3].length));
      if (/^[+-]?\d+$/.test(s)) return new Fr(BigInt(s));
      throw new Error('Nombre invalide : « ' + str + ' »');
    }
    add(o) { o = Fr.of(o); return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Fr.of(o); return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Fr.of(o); return new Fr(this.n * o.n, this.d * o.d); }
    div(o) { o = Fr.of(o); return new Fr(this.n * o.d, this.d * o.n); }
    neg() { return new Fr(-this.n, this.d); }
    cmp(o) { o = Fr.of(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
    sign() { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; }
    isZero() { return this.n === 0n; }
    toNumber() { return Number(this.n) / Number(this.d); }
    toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
  }
  const ZERO = new Fr(0n), ONE = new Fr(1n);

  // ---------------------------------------------------------------- Parseur
  // Exemple :   max 3x1 + 2x2
  //             2x1 + x2 <= 18
  //             x1 + x2 >= 2
  function parseExpr(text) {
    const s = text.replace(/\s+/g, '').replace(/−/g, '-').replace(/·/g, '*');
    const coefs = new Map();
    let konst = ZERO, used = 0, m;
    const re = /([+-]?)(\d+(?:[.,]\d+)?(?:\/\d+)?)?\*?([A-Za-z]\w*)?/g;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      if (!m[2] && !m[3]) { // un signe isolé
        if (m[1] && re.lastIndex >= s.length) throw new Error('Expression incomplète : « ' + text.trim() + ' »');
        used += m[0].length; continue;
      }
      used += m[0].length;
      let k = m[2] ? Fr.parse(m[2]) : ONE;
      if (m[1] === '-') k = k.neg();
      if (m[3]) coefs.set(m[3], (coefs.get(m[3]) || ZERO).add(k)); else konst = konst.add(k);
    }
    if (used !== s.length) throw new Error('Expression non comprise : « ' + text.trim() + ' »');
    return { coefs, konst };
  }

  function parseProblem(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
    if (!lines.length) throw new Error('Écris d\'abord le programme linéaire.');
    const head = lines[0].match(/^(max(?:imiser|imize|imum)?|min(?:imiser|imize|imum)?)\b\s*(?:z\s*=)?\s*(.*)$/i);
    if (!head) throw new Error('La première ligne doit commencer par « max » ou « min » (ex : max 3x1 + 2x2).');
    const type = head[1].toLowerCase().startsWith('max') ? 'max' : 'min';
    const obj = parseExpr(head[2].replace(/^z\s*=/i, ''));
    const raw = [];
    for (const l of lines.slice(1)) {
      const line = l.replace(/^s\.?c\.?\s*[:.]?\s*/i, '').replace(/^sous\s+contraintes?\s*:?\s*/i, '');
      if (!line) continue;
      const m = line.match(/^(.*?)(<=|>=|≤|≥|=<|=>|<|>|=)(.*)$/);
      if (!m) throw new Error('Contrainte non comprise : « ' + l + ' » (il manque <=, >= ou =).');
      const op = { '<=': '<=', '≤': '<=', '=<': '<=', '<': '<=', '>=': '>=', '≥': '>=', '=>': '>=', '>': '>=', '=': '=' }[m[2]];
      // « x1, x2 >= 0 » : condition de signe, déjà supposée
      if (op === '>=' && /^0+$/.test(m[3].trim()) && /^[A-Za-z]\w*(\s*[,;]\s*[A-Za-z]\w*)*$/.test(m[1].trim())) {
        m[1].split(/[,;]/).forEach((k) => obj.coefs.has(k.trim()) || obj.coefs.set(k.trim(), ZERO));
        continue;
      }
      const L = parseExpr(m[1]), R = parseExpr(m[3]);
      const coefs = new Map(L.coefs);
      for (const [k, v] of R.coefs) coefs.set(k, (coefs.get(k) || ZERO).sub(v));
      const b = R.konst.sub(L.konst);
      raw.push({ coefs, op, b });
    }
    if (!raw.length) throw new Error('Ajoute au moins une contrainte.');
    let vars = [];
    const add = (k) => { if (!vars.includes(k)) vars.push(k); };
    obj.coefs.forEach((_, k) => add(k));
    raw.forEach((r) => r.coefs.forEach((_, k) => add(k)));
    if (vars.every((v) => /^[A-Za-z]\d+$/.test(v) && v[0] === vars[0][0])) vars.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (vars.length > 8) throw new Error('8 variables au maximum.');
    return {
      type, vars,
      c: vars.map((v) => obj.coefs.get(v) || ZERO),
      cons: raw.map((r) => ({ a: vars.map((v) => r.coefs.get(v) || ZERO), op: r.op, b: r.b }))
    };
  }

  // Affichage d'un terme/programme
  function termStr(k, name, first) {
    if (k.isZero()) return '';
    const neg = k.sign() < 0, abs = neg ? k.neg() : k;
    const body = (abs.cmp(ONE) === 0 ? '' : abs.toString()) + name;
    return first ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body;
  }
  function linStr(coefs, names) {
    let out = '';
    coefs.forEach((k, i) => { out += termStr(k, names[i], !out); });
    return out || '0';
  }
  function problemToText(p) {
    const opS = { '<=': '≤', '>=': '≥', '=': '=' };
    return [`${p.type} z = ${linStr(p.c, p.vars)}`,
      ...p.cons.map((r) => `${linStr(r.a, p.vars)} ${opS[r.op]} ${r.b}`),
      `${p.vars.join(', ')} ≥ 0`].join('\n');
  }

  // ---------------------------------------------------------------- Simplexe (tableaux)
  function solve(prob) {
    const n = prob.vars.length;
    const sgn = prob.type === 'max' ? ONE : ONE.neg();
    // on se ramène toujours à un max : min f = - max(-f)
    const cmax = prob.c.map((x) => x.mul(sgn));

    // 1) second membre positif
    const rows = prob.cons.map((c) => {
      let { a, b, op } = c;
      if (b.sign() < 0) { a = a.map((x) => x.neg()); b = b.neg(); op = op === '<=' ? '>=' : op === '>=' ? '<=' : '='; }
      return { a, b, op };
    });

    // 2) colonnes : x, écarts/surplus (e_i), artificielles (a_i)
    const names = [...prob.vars];
    const kinds = prob.vars.map(() => 'x');
    const A = rows.map((r) => r.a.slice());
    const basis = [];
    const addCol = (name, kind, rowIdx, val) => {
      names.push(name); kinds.push(kind);
      A.forEach((row, i) => row.push(i === rowIdx ? val : ZERO));
      return names.length - 1;
    };
    rows.forEach((r, i) => {
      if (r.op === '<=') basis[i] = addCol('e' + (i + 1), 'slack', i, ONE);
      else if (r.op === '>=') { addCol('e' + (i + 1), 'surplus', i, ONE.neg()); basis[i] = addCol('a' + (i + 1), 'art', i, ONE); }
      else basis[i] = addCol('a' + (i + 1), 'art', i, ONE);
    });
    const b = rows.map((r) => r.b);
    const N = names.length;
    const hasArt = kinds.includes('art');
    const standard = rows.map((r, i) => {
      const lhs = [];
      names.forEach((nm, j) => { if (!A[i][j].isZero()) lhs.push(termStr(A[i][j], nm, !lhs.length)); });
      return lhs.join('') + ' = ' + r.b;
    });

    const steps = [];
    const info = { degenerate: false };
    const isBasic = (j) => basis.includes(j);

    function deltas(cost, active) {
      return cost.map((cj, j) => {
        if (!active[j]) return null;
        let z = ZERO;
        basis.forEach((bj, i) => { z = z.add(cost[bj].mul(A[i][j])); });
        return cj.sub(z);
      });
    }
    const zValue = (cost) => basis.reduce((acc, bj, i) => acc.add(cost[bj].mul(b[i])), ZERO);

    function snapshot(phase, cost, active, pivot, note) {
      const d = deltas(cost, active);
      const cols = []; names.forEach((_, j) => { if (active[j]) cols.push(j); });
      steps.push({
        phase, note: note || '',
        cols: cols.map((j) => names[j]),
        cost: cols.map((j) => cost[j].toString()),
        cB: basis.map((bj) => cost[bj].toString()),
        basis: basis.map((bj) => names[bj]),
        rows: A.map((row, i) => ({ a: cols.map((j) => row[j].toString()), b: b[i].toString() })),
        delta: cols.map((j) => d[j].toString()),
        z: zValue(cost).toString(),
        pivot: pivot ? { r: pivot.r, c: cols.indexOf(pivot.c), enter: names[pivot.c], leave: names[basis[pivot.r]] } : null
      });
    }

    function doPivot(r, c) {
      const p = A[r][c];
      A[r] = A[r].map((x) => x.div(p)); b[r] = b[r].div(p);
      A.forEach((row, i) => {
        if (i === r || row[c].isZero()) return;
        const f = row[c];
        A[i] = row.map((x, j) => x.sub(f.mul(A[r][j])));
        b[i] = b[i].sub(f.mul(b[r]));
      });
      basis[r] = c;
    }

    // Boucle de pivots d'une phase. Règle de Dantzig (plus grand Δ), ex æquo : plus petit indice.
    function run(phase, cost, active) {
      for (let guard = 0; guard < 200; guard++) {
        const d = deltas(cost, active);
        let c = -1;
        d.forEach((v, j) => { if (v && v.sign() > 0 && (c < 0 || v.cmp(d[c]) > 0)) c = j; });
        if (c < 0) { snapshot(phase, cost, active, null, 'Tous les Δj sont ≤ 0 : la phase est terminée.'); return 'optimal'; }
        let r = -1, best = null, ties = 0;
        A.forEach((row, i) => {
          if (row[c].sign() <= 0) return;
          const q = b[i].div(row[c]);
          if (best === null || q.cmp(best) < 0) { best = q; r = i; ties = 0; }
          else if (q.cmp(best) === 0) { ties++; if (basis[i] < basis[r]) r = i; }
        });
        if (r < 0) { snapshot(phase, cost, active, null, `Colonne de ${names[c]} sans coefficient positif : aucun rapport possible.`); return { unbounded: names[c] }; }
        if (ties || best.isZero()) info.degenerate = true;
        snapshot(phase, cost, active, { r, c });
        doPivot(r, c);
      }
      throw new Error('Trop d\'itérations (cyclage ?).');
    }

    let status = 'optimal', unboundedVar = null;
    const allActive = names.map(() => true);

    if (hasArt) {
      const cost1 = names.map((_, j) => (kinds[j] === 'art' ? ONE.neg() : ZERO));
      const res1 = run(1, cost1, allActive);
      if (zValue(cost1).sign() < 0) status = 'infeasible';
      else {
        // artificielles restées en base à 0 : on les fait sortir
        for (let i = 0; i < basis.length; i++) {
          if (kinds[basis[i]] !== 'art') continue;
          const j = names.findIndex((_, k) => kinds[k] !== 'art' && !A[i][k].isZero());
          if (j >= 0) { snapshot(1, cost1, allActive, { r: i, c: j }, `${names[basis[i]]} est restée en base à 0 : on la fait sortir en pivotant sur ${names[j]}.`); doPivot(i, j); }
          else { A.splice(i, 1); b.splice(i, 1); basis.splice(i, 1); i--; } // ligne redondante
        }
      }
      void res1;
    }

    let finalActive = names.map((_, j) => kinds[j] !== 'art');
    let cost2 = names.map((_, j) => (j < n ? cmax[j] : ZERO));
    if (status === 'optimal') {
      const res = run(2, cost2, finalActive);
      if (res !== 'optimal') { status = 'unbounded'; unboundedVar = res.unbounded; }
    }

    const out = { status, steps, standard, vars: prob.vars, type: prob.type, degenerate: info.degenerate, unboundedVar };
    if (status === 'optimal') {
      const x = prob.vars.map(() => ZERO);
      basis.forEach((bj, i) => { if (bj < n) x[bj] = b[i]; });
      out.x = x;
      out.z = zValue(cost2).mul(sgn);
      const d = deltas(cost2, finalActive);
      out.alternative = d.some((v, j) => v && v.isZero() && !isBasic(j));
    }
    return out;
  }

  // ---------------------------------------------------------------- Exercices aléatoires
  function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // level : 1 = 2 variables, ≤ ; 2 = 3 variables, ≤ ; 3 = min avec ≥ (deux phases)
  function generate(level, seed = Date.now()) {
    const rnd = mulberry(seed);
    const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    for (let tries = 0; tries < 60; tries++) {
      const nv = level === 1 ? 2 : 3, nc = level === 1 ? ri(2, 3) : 3;
      const vars = Array.from({ length: nv }, (_, i) => 'x' + (i + 1));
      let text;
      if (level < 3) {
        const c = vars.map(() => ri(1, 9));
        const lines = [];
        for (let i = 0; i < nc; i++) {
          const a = vars.map(() => ri(0, 5));
          if (a.every((v) => v === 0)) a[ri(0, nv - 1)] = ri(1, 4);
          lines.push({ a, b: ri(6, 30) });
        }
        vars.forEach((_, j) => { if (lines.every((l) => l.a[j] === 0)) lines[0].a[j] = ri(1, 3); });
        text = 'max ' + linStr(c.map(Fr.of), vars) + '\n' + lines.map((l) => linStr(l.a.map(Fr.of), vars) + ' <= ' + l.b).join('\n');
      } else {
        const c = vars.map(() => ri(1, 8));
        const lines = [];
        for (let i = 0; i < nc; i++) { const a = vars.map(() => ri(1, 5)); lines.push({ a, b: ri(4, 20), op: i === 0 || rnd() < 0.6 ? '>=' : '<=' }); }
        text = 'min ' + linStr(c.map(Fr.of), vars) + '\n' + lines.map((l) => linStr(l.a.map(Fr.of), vars) + ' ' + l.op + ' ' + l.b).join('\n');
      }
      const prob = parseProblem(text);
      let res; try { res = solve(prob); } catch (e) { continue; }
      if (res.status !== 'optimal' || res.steps.filter((s) => s.pivot).length < (level === 1 ? 2 : 3) || res.steps.length > 14) continue;
      return { text, level, problem: prob, result: res };
    }
    const text = 'max 3x1 + 2x2\n2x1 + x2 <= 18\n2x1 + 3x2 <= 42\n3x1 + x2 <= 24';
    const prob = parseProblem(text);
    return { text, level, problem: prob, result: solve(prob) };
  }

  root.Simplex = { Fr, parseProblem, problemToText, solve, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Simplex;
})(typeof window !== 'undefined' ? window : globalThis);
