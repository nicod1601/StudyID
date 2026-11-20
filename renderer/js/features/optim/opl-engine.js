// Interpréteur d'un sous-ensemble d'OPL (le langage d'IBM ILOG CPLEX) : fichiers .mod et .dat.
// Pris en charge : dvar (int, int+, float, float+, boolean, tableaux, bornes « in a..b »), range, ensembles,
// données scalaires/tableaux (.mod ou .dat), maximize/minimize, subject to { … }, forall, sum, étiquettes,
// blocs execute (writeln, var, for, if, while…). Résolution : simplexe en fractions exactes + branch & bound.
// Aucune dépendance au DOM : testable avec Node. Aucun eval : les blocs execute sont interprétés ici.

(function (root) {
  'use strict';

  const S = (typeof module !== 'undefined' && module.exports) ? require('../simplex/engine.js') : root.Simplex;
  const { Fr } = S;
  const ZERO = new Fr(0n), ONE = new Fr(1n);

  class OplError extends Error {
    constructor(msg, line, where) { super(line ? `Ligne ${line} : ${msg}` : msg); this.line = line || 0; this.where = where || 'mod'; }
  }

  // ------------------------------------------------------------------ Expressions linéaires
  class Lin {
    constructor(m, k) { this.m = m || new Map(); this.k = k || ZERO; }
    static c(x) { return new Lin(new Map(), Fr.of(x)); }
    static v(name) { return new Lin(new Map([[name, ONE]]), ZERO); }
    isConst() { return this.m.size === 0; }
    add(o) {
      const m = new Map(this.m);
      o.m.forEach((c, k) => { const s = (m.get(k) || ZERO).add(c); if (s.isZero()) m.delete(k); else m.set(k, s); });
      return new Lin(m, this.k.add(o.k));
    }
    neg() { return this.scale(ONE.neg()); }
    sub(o) { return this.add(o.neg()); }
    scale(f) {
      if (f.isZero()) return Lin.c(0);
      const m = new Map(); this.m.forEach((c, k) => m.set(k, c.mul(f)));
      return new Lin(m, this.k.mul(f));
    }
  }

  // ------------------------------------------------------------------ Analyse lexicale
  const OPS3 = ['...'];
  const OPS2 = ['<=', '>=', '==', '!=', '&&', '||', '..', '++', '--', '+=', '-=', '*=', '/=', '=<', '=>'];

  function tokenize(src, where) {
    const toks = []; let i = 0, line = 1; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '\n') { line++; i++; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      if (src.startsWith('//', i)) { while (i < n && src[i] !== '\n') i++; continue; }
      if (src.startsWith('/*', i)) {
        const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2;
        line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue;
      }
      const start = i;
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || '') && src[i + 1] !== '.')) {
        const m = /^(\d+\.(?!\.)\d*|\.\d+|\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        i += m[0].length; toks.push({ t: 'num', v: m[0], line, s: start, e: i }); continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_]\w*/.exec(src.slice(i));
        i += m[0].length; toks.push({ t: 'id', v: m[0], line, s: start, e: i }); continue;
      }
      if (ch === '"') {
        let j = i + 1, out = '';
        while (j < n && src[j] !== '"') {
          if (src[j] === '\\' && j + 1 < n) { const nx = src[j + 1]; out += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx; j += 2; }
          else out += src[j++];
        }
        if (j >= n) throw new OplError('Chaîne de caractères non terminée.', line, where);
        i = j + 1; toks.push({ t: 'str', v: out, line, s: start, e: i }); continue;
      }
      const o3 = src.substr(i, 3), o2 = src.substr(i, 2);
      if (OPS3.includes(o3)) { i += 3; toks.push({ t: 'op', v: o3, line, s: start, e: i }); continue; }
      if (OPS2.includes(o2)) { i += 2; toks.push({ t: 'op', v: o2, line, s: start, e: i }); continue; }
      if ('+-*/%^<>=!(){}[];,:.|&#'.includes(ch)) { i++; toks.push({ t: 'op', v: ch, line, s: start, e: i }); continue; }
      throw new OplError(`Caractère inattendu « ${ch} ».`, line, where);
    }
    toks.push({ t: 'eof', v: '', line, s: n, e: n });
    return toks;
  }

  // Littéral numérique exact (accepte 1.5e3)
  function numFr(text) {
    const m = /^(.*?)(?:[eE]([+-]?\d+))?$/.exec(text);
    let f = Fr.parse(m[1]);
    if (m[2]) { const e = Number(m[2]); const p = new Fr(10n ** BigInt(Math.abs(e))); f = e >= 0 ? f.mul(p) : f.div(p); }
    return f;
  }

  // ------------------------------------------------------------------ Analyseur syntaxique
  const TYPES = ['int', 'float', 'string', 'boolean'];

  class Parser {
    constructor(src, where) { this.src = src; this.where = where || 'mod'; this.toks = tokenize(src, this.where); this.p = 0; }
    get tok() { return this.toks[this.p]; }
    peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
    err(msg, tok) { return new OplError(msg, (tok || this.tok).line, this.where); }
    isOp(v) { return this.tok.t === 'op' && this.tok.v === v; }
    isId(v) { return this.tok.t === 'id' && this.tok.v === v; }
    accept(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    acceptId(v) { if (this.isId(v)) { this.p++; return true; } return false; }
    expect(v) {
      if (!this.accept(v)) {
        const got = this.tok.t === 'eof' ? 'la fin du fichier' : `« ${this.tok.v} »`;
        throw this.err(`« ${v} » attendu, trouvé ${got}.`);
      }
    }
    ident() {
      if (this.tok.t !== 'id') throw this.err(`Nom attendu, trouvé « ${this.tok.v || 'fin de fichier'} ».`);
      return this.toks[this.p++].v;
    }

    // ---------- expressions
    parseOr() {
      let l = this.parseAnd();
      while (this.isOp('||')) { const line = this.tok.line; this.p++; l = { t: 'bin', op: '||', l, r: this.parseAnd(), line }; }
      return l;
    }
    parseAnd() {
      let l = this.parseCmp();
      while (this.isOp('&&')) { const line = this.tok.line; this.p++; l = { t: 'bin', op: '&&', l, r: this.parseCmp(), line }; }
      return l;
    }
    parseCmp() {
      let l = this.parseAdd();
      while (this.tok.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(this.tok.v)) {
        const line = this.tok.line, op = this.toks[this.p++].v;
        l = { t: 'bin', op, l, r: this.parseAdd(), line };
      }
      return l;
    }
    parseAdd() {
      let l = this.parseMul();
      while (this.tok.t === 'op' && (this.tok.v === '+' || this.tok.v === '-')) {
        const line = this.tok.line, op = this.toks[this.p++].v;
        l = { t: 'bin', op, l, r: this.parseMul(), line };
      }
      return l;
    }
    parseMul() {
      let l = this.parseUnary();
      for (;;) {
        const t = this.tok;
        if (t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%') || (t.t === 'id' && (t.v === 'mod' || t.v === 'div'))) {
          this.p++; l = { t: 'bin', op: t.v, l, r: this.parseUnary(), line: t.line };
        } else return l;
      }
    }
    parseUnary() {
      const t = this.tok;
      if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) { this.p++; return { t: 'un', op: t.v, e: this.parseUnary(), line: t.line }; }
      return this.parsePow();
    }
    parsePow() {
      const b = this.parsePostfix();
      if (this.isOp('^')) { const line = this.tok.line; this.p++; return { t: 'bin', op: '^', l: b, r: this.parseUnary(), line }; }
      return b;
    }
    parsePostfix() {
      let e = this.parsePrimary();
      for (;;) {
        if (this.isOp('[')) {
          const line = this.tok.line; this.p++;
          const idx = [this.parseOr()];
          while (this.accept(',')) idx.push(this.parseOr());
          this.expect(']');
          e = { t: 'idx', base: e, idx, line };
        } else if (this.isOp('.') && this.peek().t === 'id') {
          const line = this.tok.line; this.p++;
          const name = this.ident();
          let args = null;
          if (this.accept('(')) { args = this.parseArgs(); }
          e = { t: 'member', base: e, name, args, line };
        } else return e;
      }
    }
    parseArgs() {
      const args = [];
      if (!this.isOp(')')) { do { args.push(this.parseOr()); } while (this.accept(',')); }
      this.expect(')');
      return args;
    }
    parsePrimary() {
      const t = this.tok;
      if (t.t === 'num') { this.p++; return { t: 'num', v: numFr(t.v), line: t.line }; }
      if (t.t === 'str') { this.p++; return { t: 'str', v: t.v, line: t.line }; }
      if (t.t === 'op' && t.v === '(') { this.p++; const e = this.parseOr(); this.expect(')'); return e; }
      if (t.t === 'op' && t.v === '[') return this.parseArrayLit();
      if (t.t === 'op' && t.v === '{') return this.parseSetLit();
      if (t.t === 'id') {
        if (t.v === 'sum' || t.v === 'prod') {
          this.p++; this.expect('(');
          const { binds, cond } = this.parseBindings();
          this.expect(')');
          return { t: t.v, binds, cond, body: this.parseMul(), line: t.line };
        }
        this.p++;
        if (this.isOp('(')) { this.p++; return { t: 'call', name: t.v, args: this.parseArgs(), line: t.line }; }
        if (t.v === 'true' || t.v === 'false') return { t: 'bool', v: t.v === 'true', line: t.line };
        return { t: 'id', name: t.v, line: t.line };
      }
      throw this.err(`Expression attendue, trouvé ${t.t === 'eof' ? 'la fin du fichier' : '« ' + t.v + ' »'}.`);
    }
    // « a..b » ou ensemble : utilisé après « in » et dans les déclarations
    parseRangeOrExpr() {
      const a = this.parseAdd();
      if (this.isOp('..')) { const line = this.tok.line; this.p++; return { t: 'rangeLit', lo: a, hi: this.parseAdd(), line }; }
      return a;
    }
    parseBindings() {
      const binds = [];
      do {
        const name = this.ident();
        if (!this.acceptId('in')) throw this.err('« in » attendu (ex : i in 1..n).');
        binds.push({ name, set: this.parseRangeOrExpr() });
      } while (this.accept(','));
      let cond = null;
      if (this.accept(':')) cond = this.parseOr();
      return { binds, cond };
    }
    parseElem() {
      const t = this.tok;
      if (t.t === 'op' && (t.v === '-' || t.v === '+')) { this.p++; return { t: 'un', op: t.v, e: this.parseElem(), line: t.line }; }
      if (t.t === 'op' && t.v === '[') return this.parseArrayLit();
      if (t.t === 'op' && t.v === '{') return this.parseSetLit();
      if (t.t === 'op' && t.v === '<') throw this.err('Les tuples ne sont pas pris en charge dans cette version.');
      if (t.t === 'num' || t.t === 'str' || t.t === 'id') return this.parseRangeOrAtom();
      throw this.err(`Valeur attendue, trouvé « ${t.v || 'fin de fichier'} ».`);
    }
    parseRangeOrAtom() {
      const a = this.parsePrimary();
      if (this.isOp('..')) { const line = this.tok.line; this.p++; return { t: 'rangeLit', lo: a, hi: this.parseElem(), line }; }
      return a;
    }
    parseArrayLit() {
      const line = this.tok.line; this.expect('[');
      const items = [];
      while (!this.isOp(']')) {
        if (this.tok.t === 'eof') throw this.err('« ] » manquant.');
        items.push(this.parseElem()); this.accept(',');
      }
      this.expect(']');
      return { t: 'arr', items, line };
    }
    parseSetLit() {
      const line = this.tok.line; this.expect('{');
      const items = [];
      while (!this.isOp('}')) {
        if (this.tok.t === 'eof') throw this.err('« } » manquant.');
        items.push(this.parseElem()); this.accept(',');
      }
      this.expect('}');
      return { t: 'setlit', items, line };
    }

    // ---------- valeurs d'un fichier .dat : NOM = valeur ;
    parseDat() {
      const out = new Map();
      while (this.tok.t !== 'eof') {
        const line = this.tok.line, name = this.ident();
        this.expect('=');
        const v = this.parseElem();
        this.accept(';');
        out.set(name, { node: v, line });
      }
      return out;
    }

    // ---------- modèle .mod
    parseModel() {
      const m = { items: [], hasModel: false };
      while (this.tok.t !== 'eof') {
        const t = this.tok;
        if (this.accept(';')) continue;
        if (t.t === 'id') {
          if (t.v === 'execute') { m.items.push(this.parseExecute(m)); continue; }
          if (t.v === 'dvar') { this.p++; m.hasModel = true; m.items.push(this.parseDvar(t.line)); continue; }
          if (t.v === 'range') {
            this.p++; const name = this.ident(); this.expect('=');
            let value = null;
            if (this.accept('...')) value = null; else value = this.parseRangeOrExpr();
            this.expect(';'); m.items.push({ k: 'range', name, value, line: t.line }); continue;
          }
          if (t.v === 'maximize' || t.v === 'minimize') {
            this.p++; m.hasModel = true; const e = this.parseAdd(); this.expect(';');
            m.items.push({ k: 'objective', type: t.v === 'maximize' ? 'max' : 'min', expr: e, line: t.line }); continue;
          }
          if (t.v === 'subject' || t.v === 'constraints') {
            this.p++; if (t.v === 'subject') { if (!this.acceptId('to')) throw this.err('« subject to » attendu.'); }
            m.hasModel = true; this.expect('{');
            const items = []; while (!this.isOp('}')) { if (this.tok.t === 'eof') throw this.err('« } » manquant à la fin de « subject to ».'); items.push(this.parseItem()); }
            this.expect('}'); this.accept(';');
            m.items.push({ k: 'constraints', items, line: t.line }); continue;
          }
          if (t.v === 'tuple' || t.v === 'setof' || t.v === 'sorted' || t.v === 'dexpr' || t.v === 'cumulFunction' || t.v === 'interval' || t.v === 'sequence')
            throw this.err(`« ${t.v} » n'est pas encore pris en charge.`);
          if (t.v === 'using' || t.v === 'assert' || t.v === 'int' && this.peek().t === 'op' && this.peek().v === '+' && false) { while (!this.isOp(';') && this.tok.t !== 'eof') this.p++; this.p++; continue; }
          if (TYPES.includes(t.v)) { m.items.push(this.parseData(t.v)); continue; }
        }
        if (t.t === 'op' && t.v === '{') { m.items.push(this.parseSetDecl()); continue; }
        throw this.err(`Instruction non reconnue : « ${t.v || 'fin de fichier'} ». Attendu : dvar, range, int/float/string, maximize/minimize, subject to, execute.`);
      }
      return m;
    }

    parseDims() {
      const dims = [];
      while (this.isOp('[')) { this.p++; dims.push(this.parseRangeOrExpr()); this.expect(']'); }
      return dims;
    }
    parseData(type) {
      const line = this.tok.line; this.p++;
      this.accept('+');
      const name = this.ident();
      const dims = this.parseDims();
      this.expect('=');
      let value = null;
      if (this.accept('...')) value = null; else value = this.parseElemOrExpr();
      this.expect(';');
      return { k: 'data', type, name, dims, value, line };
    }
    parseElemOrExpr() {
      if (this.isOp('[') || this.isOp('{')) return this.parseElem();
      return this.parseRangeOrExpr();
    }
    parseSetDecl() {
      const line = this.tok.line; this.expect('{');
      const type = this.ident(); this.expect('}');
      const name = this.ident(); this.expect('=');
      let value = null;
      if (this.accept('...')) value = null; else value = this.parseElemOrExpr();
      this.expect(';');
      return { k: 'set', type, name, value, line };
    }
    parseDvar(line) {
      const type = this.ident();
      if (!['int', 'float', 'boolean'].includes(type)) throw this.err(`Type de variable inconnu : « ${type} » (int, int+, float, float+ ou boolean).`);
      const plus = this.accept('+');
      const name = this.ident();
      const dims = this.parseDims();
      let range = null;
      if (this.acceptId('in')) range = this.parseRangeOrExpr();
      this.expect(';');
      return { k: 'dvar', type, plus, name, dims, range, line };
    }

    // ---------- contraintes
    parseItem() {
      const t = this.tok;
      if (this.accept('{')) {
        const items = []; while (!this.isOp('}')) { if (this.tok.t === 'eof') throw this.err('« } » manquant.'); items.push(this.parseItem()); }
        this.expect('}'); this.accept(';');
        return { k: 'block', items, line: t.line };
      }
      if (t.t === 'id' && t.v === 'forall') {
        this.p++; this.expect('(');
        const { binds, cond } = this.parseBindings();
        this.expect(')');
        return { k: 'forall', binds, cond, item: this.parseItem(), line: t.line };
      }
      if (t.t === 'id' && t.v === 'if') {
        this.p++; this.expect('('); const cond = this.parseOr(); this.expect(')');
        const then = this.parseItem(); let els = null;
        if (this.acceptId('else')) els = this.parseItem();
        return { k: 'if', cond, then, els, line: t.line };
      }
      let label = null;
      if (t.t === 'id' && this.peek().t === 'op' && this.peek().v === ':') { label = t.v; this.p += 2; }
      const first = this.parseAdd();
      const parts = [first];
      while (this.tok.t === 'op' && ['<=', '>=', '==', '=', '<', '>', '=<', '=>'].includes(this.tok.v)) {
        let op = this.toks[this.p++].v;
        op = { '<=': '<=', '=<': '<=', '<': '<=', '>=': '>=', '=>': '>=', '>': '>=', '==': '=', '=': '=' }[op];
        parts.push(op, this.parseAdd());
      }
      if (parts.length < 3) throw this.err('Contrainte incomplète : il manque <=, >= ou ==.');
      this.expect(';');
      return { k: 'ct', label, parts, line: t.line };
    }

    // ---------- blocs execute
    parseExecute() {
      const line = this.tok.line; this.p++;
      if (this.tok.t === 'id') this.p++; // execute NOM { … }
      this.expect('{');
      const body = [];
      while (!this.isOp('}')) { if (this.tok.t === 'eof') throw this.err('« } » manquant à la fin du bloc execute.'); body.push(this.parseStmt()); }
      this.expect('}');
      return { k: 'execute', body, line };
    }
    endStmt() { if (this.accept(';') || this.isOp('}')) return; this.expect(';'); }
    parseStmt() {
      const t = this.tok;
      if (this.accept(';')) return { s: 'nop' };
      if (this.accept('{')) {
        const body = []; while (!this.isOp('}')) { if (this.tok.t === 'eof') throw this.err('« } » manquant.'); body.push(this.parseStmt()); }
        this.expect('}'); return { s: 'block', body };
      }
      if (t.t === 'id') {
        if (t.v === 'var' || TYPES.includes(t.v)) {
          this.p++; const name = this.ident(); let e = null;
          if (this.accept('=')) e = this.parseOr();
          this.endStmt(); return { s: 'var', name, e, line: t.line };
        }
        if (t.v === 'break' || t.v === 'continue') { this.p++; this.endStmt(); return { s: t.v }; }
        if (t.v === 'if') {
          this.p++; this.expect('('); const c = this.parseOr(); this.expect(')');
          const th = this.parseStmt(); let el = null;
          if (this.acceptId('else')) el = this.parseStmt();
          return { s: 'if', c, th, el };
        }
        if (t.v === 'while') {
          this.p++; this.expect('('); const c = this.parseOr(); this.expect(')');
          return { s: 'while', c, body: this.parseStmt(), line: t.line };
        }
        if (t.v === 'for') {
          this.p++; this.expect('(');
          this.acceptId('var');
          if (this.tok.t === 'id' && this.peek().t === 'id' && this.peek().v === 'in') {
            const name = this.ident(); this.p++;
            const set = this.parseRangeOrExpr(); this.expect(')');
            return { s: 'forin', name, set, body: this.parseStmt(), line: t.line };
          }
          const name = this.ident(); this.expect('='); const init = this.parseOr(); this.expect(';');
          const cond = this.parseOr(); this.expect(';');
          const inc = this.parseSimple(); this.expect(')');
          return { s: 'for', name, init, cond, inc, body: this.parseStmt(), line: t.line };
        }
      }
      const st = this.parseSimple(); this.endStmt();
      return st;
    }
    // affectation, i++, ou appel de fonction
    parseSimple() {
      const line = this.tok.line;
      const target = this.parsePostfix();
      if (this.tok.t === 'op' && ['=', '+=', '-=', '*=', '/='].includes(this.tok.v)) {
        const op = this.toks[this.p++].v;
        return { s: 'assign', target, op, e: this.parseOr(), line };
      }
      if (this.isOp('++') || this.isOp('--')) {
        const op = this.toks[this.p++].v;
        return { s: 'assign', target, op: op === '++' ? '+=' : '-=', e: { t: 'num', v: ONE, line }, line };
      }
      return { s: 'expr', e: target, line };
    }
  }

  // ------------------------------------------------------------------ Évaluation
  class Env {
    constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
    lookup(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return e; return null; }
    get(n) { const e = this.lookup(n); return e ? e.vars.get(n) : undefined; }
    def(n, v) { this.vars.set(n, v); }
    set(n, v) { const e = this.lookup(n); (e || this).vars.set(n, v); }
  }

  const isSet = (v) => v && v.kind === 'set';
  const keyOf = (v) => String(v instanceof Lin ? v.k.toString() : v);

  function fmtNum(f) {
    if (f.d === 1n) return String(f.n);
    const x = f.toNumber();
    return String(parseFloat(x.toFixed(6)));
  }
  function show(v) {
    if (v instanceof Lin) {
      if (!v.isConst()) return '(expression)';
      return fmtNum(v.k);
    }
    if (isSet(v)) return '{' + v.items.map((x) => (typeof x === 'string' ? JSON.stringify(x) : x)).join(' ') + '}';
    if (v instanceof Map) return '[' + [...v.values()].map(show).join(' ') + ']';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }

  class Interp {
    constructor(where) { this.where = where || 'mod'; }
    err(msg, node) { return new OplError(msg, node && node.line, this.where); }

    num(v, node) {
      if (!(v instanceof Lin)) throw this.err('Un nombre est attendu ici.', node);
      return v;
    }
    cst(v, node, what) {
      const x = this.num(v, node);
      if (!x.isConst()) throw this.err(`${what || 'Cette valeur'} doit être une constante (elle ne peut pas contenir de variable de décision).`, node);
      return x.k;
    }
    int(v, node, what) {
      const f = this.cst(v, node, what);
      if (f.d !== 1n) throw this.err(`${what || 'Cette valeur'} doit être un entier (reçu ${fmtNum(f)}).`, node);
      return Number(f.n);
    }

    // Éléments d'un ensemble ou d'un intervalle
    items(v, node) {
      if (isSet(v)) return v.items;
      throw this.err('Un ensemble ou un intervalle (ex : 1..n) est attendu ici.', node);
    }

    ev(n, env) {
      switch (n.t) {
        case 'num': return Lin.c(n.v);
        case 'str': return n.v;
        case 'bool': return n.v;
        case 'id': {
          const e = env.lookup(n.name);
          if (!e) throw this.err(`Identifiant inconnu : « ${n.name} ». Est-il déclaré dans le .mod, et défini dans le .dat ?`, n);
          return e.vars.get(n.name);
        }
        case 'un': {
          const v = this.ev(n.e, env);
          if (n.op === '!') return !v;
          const x = this.num(v, n);
          return n.op === '-' ? x.neg() : x;
        }
        case 'bin': return this.bin(n, env);
        case 'rangeLit': {
          const a = this.int(this.ev(n.lo, env), n, 'La borne d\'intervalle'), b = this.int(this.ev(n.hi, env), n, 'La borne d\'intervalle');
          const items = []; for (let i = a; i <= b; i++) items.push(i);
          return { kind: 'set', items };
        }
        case 'setlit': {
          const items = [];
          n.items.forEach((x) => {
            const v = this.ev(x, env);
            if (isSet(v)) items.push(...v.items);
            else items.push(typeof v === 'string' ? v : this.int(v, x, 'Un élément d\'ensemble'));
          });
          return { kind: 'set', items };
        }
        case 'arr': return new Map(n.items.map((x, i) => [String(i), this.ev(x, env)]));
        case 'idx': {
          let v = this.ev(n.base, env);
          for (const ix of n.idx) {
            const k = this.ev(ix, env);
            if (!(v instanceof Map)) throw this.err('Ce n\'est pas un tableau : l\'indexation [ ] est impossible.', n);
            const key = keyOf(k);
            if (!v.has(key)) throw this.err(`Indice hors limites : [${key}].`, n);
            v = v.get(key);
          }
          return v;
        }
        case 'sum': case 'prod': return this.sumProd(n, env);
        case 'call': return this.call(n, env);
        case 'member': return this.member(n, env);
        default: throw this.err('Expression non prise en charge.', n);
      }
    }

    bin(n, env) {
      if (n.op === '&&') return !!this.ev(n.l, env) && !!this.ev(n.r, env);
      if (n.op === '||') return !!this.ev(n.l, env) || !!this.ev(n.r, env);
      const a = this.ev(n.l, env), b = this.ev(n.r, env);
      if (['==', '!=', '<', '>', '<=', '>='].includes(n.op)) {
        let c;
        if (typeof a === 'string' || typeof b === 'string') c = a === b ? 0 : (String(a) < String(b) ? -1 : 1);
        else c = this.cst(a, n, 'Une comparaison').cmp(this.cst(b, n, 'Une comparaison'));
        return n.op === '==' ? c === 0 : n.op === '!=' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '>' ? c > 0 : n.op === '<=' ? c <= 0 : c >= 0;
      }
      if (n.op === '+' && (typeof a === 'string' || typeof b === 'string')) return show(a) + show(b);
      const x = this.num(a, n), y = this.num(b, n);
      switch (n.op) {
        case '+': return x.add(y);
        case '-': return x.sub(y);
        case '*':
          if (x.isConst()) return y.scale(x.k);
          if (y.isConst()) return x.scale(y.k);
          throw this.err('Produit de deux variables de décision : le modèle n\'est pas linéaire (CPLEX en programmation linéaire/entière).', n);
        case '/': {
          if (!y.isConst()) throw this.err('Division par une variable de décision : modèle non linéaire.', n);
          if (y.k.isZero()) throw this.err('Division par zéro.', n);
          return x.scale(ONE.div(y.k));
        }
        case '%': case 'mod': return Lin.c(new Fr(BigInt(this.int(x, n) % this.int(y, n))));
        case 'div': {
          const d = this.int(y, n); if (d === 0) throw this.err('Division par zéro.', n);
          return Lin.c(new Fr(BigInt(Math.trunc(this.int(x, n) / d))));
        }
        case '^': {
          const e = this.int(y, n, 'L\'exposant');
          if (!x.isConst()) { if (e === 1) return x; throw this.err('Puissance d\'une variable : modèle non linéaire.', n); }
          let r = ONE; for (let i = 0; i < Math.abs(e); i++) r = r.mul(x.k);
          return Lin.c(e >= 0 ? r : ONE.div(r));
        }
        default: throw this.err(`Opérateur « ${n.op} » non pris en charge.`, n);
      }
    }

    // Parcourt le produit cartésien des ensembles de « binds » (avec condition éventuelle)
    iterate(binds, cond, env, fn) {
      const rec = (i, e) => {
        if (i === binds.length) { if (!cond || this.ev(cond, e)) fn(e); return; }
        const b = binds[i];
        const items = this.items(this.ev(b.set, e), b.set);
        for (const it of items) { const ne = new Env(e); ne.def(b.name, typeof it === 'string' ? it : Lin.c(it)); rec(i + 1, ne); }
      };
      rec(0, env);
    }

    sumProd(n, env) {
      if (n.t === 'sum') {
        let acc = Lin.c(0);
        this.iterate(n.binds, n.cond, env, (e) => { acc = acc.add(this.num(this.ev(n.body, e), n.body)); });
        return acc;
      }
      let acc = Lin.c(1);
      this.iterate(n.binds, n.cond, env, (e) => {
        const v = this.num(this.ev(n.body, e), n.body);
        if (acc.isConst()) acc = v.scale(acc.k);
        else if (v.isConst()) acc = acc.scale(v.k);
        else throw this.err('Produit de variables : modèle non linéaire.', n);
      });
      return acc;
    }

    call(n, env) {
      const args = n.args.map((a) => this.ev(a, env));
      const c = (i) => this.cst(args[i], n.args[i], `L'argument ${i + 1} de ${n.name}`);
      const toLin = (x) => Lin.c(Fr.parse(String(parseFloat(x.toPrecision(15)))));
      switch (n.name) {
        case 'abs': return Lin.c(c(0).sign() < 0 ? c(0).neg() : c(0));
        case 'min': return Lin.c(c(0).cmp(c(1)) <= 0 ? c(0) : c(1));
        case 'max': return Lin.c(c(0).cmp(c(1)) >= 0 ? c(0) : c(1));
        case 'ceil': { const f = c(0); let q = f.n / f.d; if (f.n % f.d !== 0n && f.n > 0n) q += 1n; return Lin.c(new Fr(q)); }
        case 'floor': { const f = c(0); let q = f.n / f.d; if (f.n % f.d !== 0n && f.n < 0n) q -= 1n; return Lin.c(new Fr(q)); }
        case 'sqrt': return toLin(Math.sqrt(c(0).toNumber()));
        case 'pow': return toLin(Math.pow(c(0).toNumber(), c(1).toNumber()));
        case 'card': case 'size': return Lin.c(new Fr(BigInt(isSet(args[0]) ? args[0].items.length : args[0] instanceof Map ? args[0].size : 0)));
        case 'item': { const s = this.items(args[0], n.args[0]); const i = this.int(args[1], n.args[1]); if (i < 0 || i >= s.length) throw this.err('item : indice hors limites.', n); return typeof s[i] === 'string' ? s[i] : Lin.c(s[i]); }
        case 'ord': { const s = this.items(args[0], n.args[0]); const v = typeof args[1] === 'string' ? args[1] : this.int(args[1], n.args[1]); return Lin.c(s.indexOf(v)); }
        case 'ftoi': case 'round': case 'trunc': { const f = c(0); return Lin.c(new Fr(f.n / f.d)); }
        case 'string': return show(args[0]);
        default: throw this.err(`Fonction inconnue : « ${n.name} ».`, n);
      }
    }

    member(n, env) {
      if (n.base.t === 'id' && n.base.name === 'cplex') {
        const cp = env.get('cplex');
        if (n.name === 'getObjValue') return Lin.c(cp.objective === null ? 0 : cp.objective);
        if (n.name === 'getBestObjValue') return Lin.c(cp.objective === null ? 0 : cp.objective);
        if (n.name === 'getCplexStatus' || n.name === 'getSolStatus') return cp.status;
        throw this.err(`cplex.${n.name} n'est pas pris en charge.`, n);
      }
      throw this.err(`Accès « .${n.name} » non pris en charge.`, n);
    }

    // ----- blocs execute
    // Renvoie 'break' ou 'continue' quand l'instruction doit interrompre la boucle englobante
    exec(stmts, env, out) {
      for (const st of stmts) { const sig = this.stmt(st, env, out); if (sig) return sig; }
      return null;
    }
    stmt(st, env, out) {
      switch (st.s) {
        case 'nop': return null;
        case 'break': case 'continue': return st.s;
        case 'block': return this.exec(st.body, new Env(env), out);
        case 'var': env.def(st.name, st.e ? this.ev(st.e, env) : Lin.c(0)); return null;
        case 'expr': {
          const e = st.e;
          if (e.t === 'call' && (e.name === 'writeln' || e.name === 'write')) {
            const text = e.args.map((a) => show(this.ev(a, env))).join('');
            if (e.name === 'writeln') { out.cur += text; out.lines.push(out.cur); out.cur = ''; } else out.cur += text;
            return null;
          }
          this.ev(e, env); return null;
        }
        case 'assign': this.assign(st, env); return null;
        case 'if': return this.ev(st.c, env) ? this.stmt(st.th, env, out) : (st.el ? this.stmt(st.el, env, out) : null);
        case 'while': {
          let g = 0;
          while (this.ev(st.c, env)) {
            const sig = this.stmt(st.body, env, out);
            if (sig === 'break') break;
            if (++g > 1e6) throw this.err('Boucle while trop longue.', st);
          }
          return null;
        }
        case 'forin': {
          const items = this.items(this.ev(st.set, env), st.set);
          for (const it of items) {
            const e = new Env(env); e.def(st.name, typeof it === 'string' ? it : Lin.c(it));
            if (this.stmt(st.body, e, out) === 'break') break;
          }
          return null;
        }
        case 'for': {
          const e = new Env(env); e.def(st.name, this.ev(st.init, env));
          let g = 0;
          while (this.ev(st.cond, e)) {
            if (this.stmt(st.body, e, out) === 'break') break;
            this.assign(st.inc, e);
            if (++g > 1e6) throw this.err('Boucle for trop longue.', st);
          }
          return null;
        }
        default: throw this.err('Instruction non prise en charge.', st);
      }
    }
    assign(st, env) {
      let value = this.ev(st.e, env);
      const t = st.target;
      const combine = (cur) => {
        if (st.op === '=') return value;
        if (typeof cur === 'string' && st.op === '+=') return cur + show(value);
        const a = this.num(cur, st), b = this.num(value, st);
        return st.op === '+=' ? a.add(b) : st.op === '-=' ? a.sub(b)
          : st.op === '*=' ? Lin.c(this.cst(a, st).mul(this.cst(b, st))) : Lin.c(this.cst(a, st).div(this.cst(b, st)));
      };
      if (t.t === 'id') {
        if (!env.lookup(t.name)) throw this.err(`Variable inconnue : « ${t.name} » (déclare-la avec var).`, st);
        env.set(t.name, combine(env.get(t.name))); return;
      }
      if (t.t === 'idx') {
        let m = this.ev(t.base, env);
        const keys = t.idx.map((x) => keyOf(this.ev(x, env)));
        for (let i = 0; i < keys.length - 1; i++) { m = m.get(keys[i]); if (!(m instanceof Map)) throw this.err('Indice invalide.', st); }
        if (!(m instanceof Map)) throw this.err('Ce n\'est pas un tableau.', st);
        const k = keys[keys.length - 1];
        if (!m.has(k)) throw this.err(`Indice hors limites : [${k}].`, st);
        m.set(k, combine(m.get(k))); return;
      }
      throw this.err('Affectation impossible ici.', st);
    }
  }

  // ------------------------------------------------------------------ Construction du modèle
  function dimItems(ip, dimNode, env) {
    return ip.items(ip.ev(dimNode, env), dimNode);
  }

  // Remplit un tableau multidimensionnel à partir d'un littéral
  function bindArray(ip, dimSets, valNode, env, name) {
    const lit = ip.ev(valNode, env);
    const build = (d, v) => {
      if (d === dimSets.length) return v;
      if (!(v instanceof Map)) throw ip.err(`« ${name} » attend un tableau à ${dimSets.length} dimension(s).`, valNode);
      const keys = dimSets[d];
      if (v.size !== keys.length) throw ip.err(`« ${name} » : ${keys.length} valeur(s) attendue(s) sur la dimension ${d + 1}, ${v.size} fournie(s).`, valNode);
      const out = new Map(); const vals = [...v.values()];
      keys.forEach((k, i) => out.set(String(k), build(d + 1, vals[i])));
      return out;
    };
    return build(0, lit);
  }

  function makeVarArray(dimSets, mk) {
    const rec = (d, path) => {
      if (d === dimSets.length) return mk(path);
      const m = new Map();
      dimSets[d].forEach((k) => m.set(String(k), rec(d + 1, [...path, k])));
      return m;
    };
    return rec(0, []);
  }

  function build(modText, datText) {
    let ast;
    try { ast = new Parser(modText, 'mod').parseModel(); } catch (e) { if (e instanceof OplError) throw e; throw e; }
    const dat = datText && datText.trim() ? new Parser(datText, 'dat').parseDat() : new Map();

    const ipMod = new Interp('mod'), ipDat = new Interp('dat');
    const env = new Env();
    const out = { lines: [], cur: '' };
    const cplex = { objective: null, status: 'Unknown' };
    env.def('cplex', cplex);

    const vars = [];          // {name, type, lb, ub}
    const varEnv = [];        // pour l'affichage : {name, dims, ref}
    let objective = null;
    const ctItems = [];
    const executes = [];      // {body, pre}
    let sawModel = false;

    const fromDat = (name, line) => {
      const d = dat.get(name);
      if (!d) throw new OplError(`Donnée manquante : « ${name} » est déclarée avec « ... » mais n'est pas définie dans le fichier .dat.`, line, 'mod');
      return d;
    };

    for (const it of ast.items) {
      if (it.k === 'range') {
        let v;
        if (it.value) v = ipMod.ev(it.value, env);
        else { const d = fromDat(it.name, it.line); v = ipDat.ev(d.node, env); }
        if (!isSet(v)) throw new OplError(`« ${it.name} » doit être un intervalle (a..b).`, it.line, 'mod');
        env.def(it.name, v);
      } else if (it.k === 'set') {
        let v;
        if (it.value) v = ipMod.ev(it.value, env);
        else v = ipDat.ev(fromDat(it.name, it.line).node, env);
        if (!isSet(v)) throw new OplError(`« ${it.name} » doit être un ensemble { … }.`, it.line, 'mod');
        env.def(it.name, v);
      } else if (it.k === 'data') {
        const ip = it.value ? ipMod : ipDat;
        const node = it.value || fromDat(it.name, it.line).node;
        const line = it.line;
        let val;
        try {
          if (it.dims.length) {
            const sets = it.dims.map((d) => dimItems(ipMod, d, env));
            val = bindArray(ip, sets, node, env, it.name);
          } else val = ip.ev(node, env);
        } catch (e) { if (e instanceof OplError && !e.line) e.line = line; throw e; }
        if (!it.dims.length && it.type === 'int' && val instanceof Lin && val.isConst() && val.k.d !== 1n)
          throw new OplError(`« ${it.name} » est déclaré int mais vaut ${fmtNum(val.k)}.`, it.line, 'mod');
        env.def(it.name, val);
      } else if (it.k === 'dvar') {
        sawModel = true;
        const sets = it.dims.map((d) => dimItems(ipMod, d, env));
        let lo = null, hi = null;
        if (it.type === 'boolean') { lo = ZERO; hi = ONE; }
        else if (it.plus) lo = ZERO;
        if (it.range) {
          if (it.range.t !== 'rangeLit') throw new OplError('Bornes attendues sous la forme « in a..b ».', it.line, 'mod');
          lo = ipMod.cst(ipMod.ev(it.range.lo, env), it.range);
          hi = ipMod.cst(ipMod.ev(it.range.hi, env), it.range);
        }
        const ref = makeVarArray(sets, (path) => {
          const nm = it.name + path.map((p) => `[${p}]`).join('');
          if (vars.some((v) => v.name === nm)) throw new OplError(`Variable « ${it.name} » déclarée deux fois.`, it.line, 'mod');
          vars.push({ name: nm, type: it.type === 'float' ? 'float' : 'int', lb: lo, ub: hi });
          return Lin.v(nm);
        });
        env.def(it.name, ref);
        varEnv.push({ name: it.name, ref, dims: sets.length });
      } else if (it.k === 'objective') {
        sawModel = true;
        if (objective) throw new OplError('Un seul objectif (maximize/minimize) est possible.', it.line, 'mod');
        objective = { type: it.type, expr: it.expr };
      } else if (it.k === 'constraints') {
        sawModel = true; ctItems.push(...it.items);
      } else if (it.k === 'execute') {
        executes.push({ body: it.body, pre: !sawModel });
      }
    }
    return { env, ipMod, vars, varEnv, objective, ctItems, executes, out, cplex, ast };
  }

  // Aplatit les contraintes en lignes { name, lin, op } (lin op 0)
  function expandConstraints(M) {
    const rows = [];
    let counter = 0;
    const ip = M.ipMod;
    const walk = (item, env, idxPath) => {
      switch (item.k) {
        case 'block': item.items.forEach((x) => walk(x, env, idxPath)); return;
        case 'forall':
          ip.iterate(item.binds, item.cond, env, (e) => {
            const path = [...idxPath, ...item.binds.map((b) => keyOf(e.lookup(b.name).vars.get(b.name)))];
            walk(item.item, e, path);
          });
          return;
        case 'if': if (ip.ev(item.cond, env)) walk(item.then, env, idxPath); else if (item.els) walk(item.els, env, idxPath); return;
        case 'ct': {
          const vals = item.parts.map((p, i) => (i % 2 === 0 ? ip.num(ip.ev(p, env), p) : p));
          const base = item.label || `ct${++counter}`;
          const nm = idxPath.length ? `${base}[${idxPath.join(',')}]` : base;
          for (let j = 0; j + 2 < vals.length; j += 2) {
            const lin = vals[j].sub(vals[j + 2]), op = vals[j + 1];
            const name = vals.length > 3 ? `${nm}_${j / 2 + 1}` : nm;
            if (lin.isConst()) {
              const sg = lin.k.sign();
              const ok = op === '<=' ? sg <= 0 : op === '>=' ? sg >= 0 : sg === 0;
              if (!ok) rows.push({ name, lin, op, trivialFalse: true, line: item.line });
            } else rows.push({ name, lin, op, line: item.line });
          }
          return;
        }
        default: throw new OplError('Élément de contrainte non pris en charge.', item.line, 'mod');
      }
    };
    M.ctItems.forEach((it) => walk(it, M.env, []));
    return rows;
  }

  // ------------------------------------------------------------------ Résolution : PL + branch & bound
  function buildLP(vars, rows, obj, lbs, ubs, shift) {
    const cols = []; // {v, s}
    const info = vars.map(() => ({ off: ZERO, cols: [] }));
    const extra = [];
    let infeasible = false;
    vars.forEach((v, i) => {
      const lb = lbs[i], ub = ubs[i];
      if (lb !== null && ub !== null && lb.cmp(ub) > 0) { infeasible = true; return; }
      if (lb !== null) {
        info[i].off = lb; info[i].cols.push({ col: cols.length, s: ONE }); cols.push(i);
        if (ub !== null) extra.push({ col: cols.length - 1, b: ub.sub(lb) });
      } else if (ub !== null) {
        info[i].off = ub; info[i].cols.push({ col: cols.length, s: ONE.neg() }); cols.push(i);
      } else {
        info[i].cols.push({ col: cols.length, s: ONE }); cols.push(i);
        info[i].cols.push({ col: cols.length, s: ONE.neg() }); cols.push(i);
      }
    });
    if (infeasible) return { infeasible: true };
    const nC = cols.length;
    const idx = new Map(vars.map((v, i) => [v.name, i]));
    const rowOf = (lin) => {
      const a = new Array(nC).fill(ZERO); let k = lin.k;
      lin.m.forEach((c, name) => {
        const i = idx.get(name); const inf = info[i];
        k = k.add(c.mul(inf.off));
        inf.cols.forEach(({ col, s }) => { a[col] = a[col].add(c.mul(s)); });
      });
      return { a, k };
    };
    const cons = rows.map((r, ri) => {
      const { a, k } = rowOf(r.lin);
      let rhs = k.neg();
      if (shift && shift.row === ri) rhs = rhs.add(shift.delta);
      return { a, op: r.op, b: rhs };
    });
    extra.forEach((e) => { const a = new Array(nC).fill(ZERO); a[e.col] = ONE; cons.push({ a, op: '<=', b: e.b }); });
    if (!cons.length) cons.push({ a: new Array(Math.max(nC, 1)).fill(ZERO), op: '<=', b: ONE });
    const o = rowOf(obj.lin);
    const names = cols.map((_, j) => 'y' + (j + 1));
    if (!names.length) names.push('y1');
    return { prob: { type: obj.type, vars: names, c: o.a.length ? o.a : [ZERO], cons }, info, objConst: o.k, nC };
  }

  function solveLP(vars, rows, obj, lbs, ubs, shift) {
    const lp = buildLP(vars, rows, obj, lbs, ubs, shift);
    if (lp.infeasible) return { status: 'infeasible' };
    if (!lp.nC) { // aucune variable
      return { status: 'optimal', x: vars.map((v, i) => lbs[i] || ubs[i] || ZERO), z: lp.objConst };
    }
    const r = S.solve(lp.prob, { record: false });
    if (r.status !== 'optimal') return { status: r.status };
    const x = vars.map((v, i) => lp.info[i].cols.reduce((acc, { col, s }) => acc.add(r.x[col].mul(s)), lp.info[i].off));
    return { status: 'optimal', x, z: r.z.add(lp.objConst) };
  }

  function solveModel(M, rows, limits) {
    const { vars } = M;
    const obj = M.objective ? { type: M.objective.type, lin: M.ipMod.num(M.ipMod.ev(M.objective.expr, M.env), M.objective.expr) } : { type: 'max', lin: Lin.c(0) };
    const trivial = rows.find((r) => r.trivialFalse);
    if (trivial) return { status: 'infeasible', reason: `La contrainte constante « ${trivial.name} » est fausse.` };
    const lbs = vars.map((v) => v.lb), ubs = vars.map((v) => v.ub);
    const isInt = vars.map((v) => v.type === 'int');
    const better = (a, b) => (obj.type === 'max' ? a.cmp(b) > 0 : a.cmp(b) < 0);

    const root = solveLP(vars, rows, obj, lbs, ubs);
    if (root.status !== 'optimal') return { status: root.status };
    const stats = { nodes: 1, relaxation: root.z, mip: isInt.some(Boolean) };
    if (!stats.mip) return { status: 'optimal', x: root.x, z: root.z, stats, rows, obj };

    let best = null;
    const stack = [{ lbs, ubs, sol: root }];
    const maxNodes = (limits && limits.maxNodes) || 20000;
    while (stack.length) {
      const node = stack.pop();
      const sol = node.sol;
      if (best && !better(sol.z, best.z)) continue; // borne : inutile d'explorer
      let frac = -1;
      for (let i = 0; i < vars.length; i++) if (isInt[i] && sol.x[i].d !== 1n) { frac = i; break; }
      if (frac < 0) { if (!best || better(sol.z, best.z)) best = sol; continue; }
      const xv = sol.x[frac];
      let fl = xv.n / xv.d; if (xv.n < 0n && xv.n % xv.d !== 0n) fl -= 1n; // plancher
      const floor = new Fr(fl), ceil = new Fr(fl + 1n);
      const children = [];
      { const u = node.ubs.slice(); u[frac] = floor; children.push({ lbs: node.lbs, ubs: u }); }
      { const l = node.lbs.slice(); l[frac] = ceil; children.push({ lbs: l, ubs: node.ubs }); }
      const solved = [];
      for (const ch of children) {
        if (++stats.nodes > maxNodes) return { status: 'limit', stats, message: `Arrêt après ${maxNodes} nœuds : le problème en nombres entiers est trop gros pour cette version.` };
        const s = solveLP(vars, rows, obj, ch.lbs, ch.ubs);
        if (s.status === 'optimal' && (!best || better(s.z, best.z))) solved.push({ ...ch, sol: s });
      }
      // on explore d'abord la meilleure relaxation (dernière poussée = première traitée)
      solved.sort((a, b) => (obj.type === 'max' ? a.sol.z.cmp(b.sol.z) : b.sol.z.cmp(a.sol.z)));
      stack.push(...solved);
    }
    if (!best) return { status: 'infeasible', stats, reason: 'Aucune solution entière n\'existe.' };
    return { status: 'optimal', x: best.x, z: best.z, stats, rows, obj };
  }

  // ------------------------------------------------------------------ Point d'entrée
  function fmtVarValue(v) {
    if (v instanceof Map) return '[' + [...v.values()].map(fmtVarValue).join(' ') + ']';
    return fmtNum(v instanceof Lin ? v.k : v);
  }

  function run(modText, datText) {
    const result = { ok: false, status: 'error', console: [], variables: [], constraints: [], objective: null, stats: null };
    try {
      const M = build(modText, datText);
      const post = (list) => list.forEach((b) => M.ipMod.exec(b.body, new Env(M.env), M.out));
      post(M.executes.filter((e) => e.pre)); // blocs execute placés avant le modèle
      const rows = expandConstraints(M);
      const sol = solveModel(M, rows);
      result.status = sol.status; result.stats = sol.stats || null;
      if (M.out.cur) { M.out.lines.push(M.out.cur); M.out.cur = ''; }
      result.console.push(...M.out.lines); M.out.lines = [];
      if (sol.status === 'optimal') {
        const val = new Map(M.vars.map((v, i) => [v.name, sol.x[i]]));
        // remplace les variables par leurs valeurs, pour l'affichage et les blocs execute
        const sub = (ref) => (ref instanceof Map ? new Map([...ref].map(([k, v]) => [k, sub(v)])) : Lin.c(val.get([...ref.m.keys()][0])));
        M.varEnv.forEach((v) => {
          const solved = sub(v.ref);
          result.variables.push({ name: v.name, text: fmtVarValue(solved), value: solved });
          M.env.set(v.name, solved);
        });
        M.cplex.objective = sol.z; M.cplex.status = 'Optimal';
        result.objective = sol.z;
        result.constraints = rows.map((r) => {
          let act = ZERO; r.lin.m.forEach((c, nm) => { act = act.add(c.mul(val.get(nm))); });
          const rhs = r.lin.k.neg(); const slack = r.op === '<=' ? rhs.sub(act) : r.op === '>=' ? act.sub(rhs) : ZERO;
          return { name: r.name, activity: fmtNum(act), op: r.op, rhs: fmtNum(rhs), slack: fmtNum(slack), binding: slack.isZero(), dual: null };
        });
        if (!sol.stats.mip && rows.length <= 60) { // prix duaux par perturbation (PL pur)
          const delta = new Fr(1n, 1000n);
          const lbs = M.vars.map((v) => v.lb), ubs = M.vars.map((v) => v.ub);
          rows.forEach((r, i) => {
            const s = solveLP(M.vars, rows, sol.obj, lbs, ubs, { row: i, delta });
            if (s.status === 'optimal') result.constraints[i].dual = fmtNum(s.z.sub(sol.z).div(delta));
          });
        }
        M.out.lines = []; M.out.cur = '';
        post(M.executes.filter((e) => !e.pre));
        if (M.out.cur) M.out.lines.push(M.out.cur);
        result.post = M.out.lines;
      } else if (sol.status === 'infeasible') result.message = sol.reason || 'Le problème n\'a aucune solution : les contraintes sont incompatibles.';
      else if (sol.status === 'unbounded') result.message = 'Le problème est non borné : la fonction objectif peut croître (ou décroître) sans limite.';
      else result.message = sol.message || '';
      result.ok = true;
    } catch (e) {
      if (e instanceof OplError) { result.error = { message: e.message, line: e.line, where: e.where }; }
      else result.error = { message: 'Erreur interne : ' + e.message, line: 0, where: 'mod' };
    }
    return result;
  }

  root.Opl = { run, fmtNum, Parser, OplError };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Opl;
})(typeof window !== 'undefined' ? window : globalThis);
