// =====================================================================
// StudyIDE — Recherche globale (barre de la sidebar, raccourci Ctrl+K)
//  Cherche en même temps dans : matières, exercices de code, documents PDF
//  et contenu des PDF (passages + exercices détectés). Insensible aux accents
//  et à la casse, tous les mots doivent être présents (ET).
//  S'appuie sur les globales de renderer.js (db, switchMode, selectCourse,
//  openExercise, openDocumentAt…), toutes lues au moment de l'appel.
// =====================================================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const input = $('sidebarSearch');
  if (!input) return;
  const wrap = $('sidebarSearchWrap');
  const panel = $('searchResults');
  const clearBtn = $('sidebarSearchClear');
  const kbd = $('sidebarSearchKbd');

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LIMITS = { course: 5, exercise: 6, doc: 5, passage: 8 };
  const GROUPS = [
    ['course', '📚 Matières'],
    ['exercise', '💻 Exercices de code'],
    ['doc', '📄 Documents'],
    ['passage', '🔎 Dans le contenu des cours']
  ];
  const STATUS = { todo: 'À faire', 'in-progress': 'En cours', done: 'Terminé' };

  let docs = [];          // tous les PDF de toutes les matières
  let corpus = [];        // passages indexés (avec .n = texte normalisé)
  let loadedAt = 0;
  let loading = null;
  let items = [];         // résultats affichés, dans l'ordre
  let active = -1;
  let seq = 0;            // ignore les rendus périmés

  // ---------- Données (chargées au premier focus, rafraîchies si > 30 s) ----------
  function ensureData() {
    if (loading) return loading;
    if (loadedAt && Date.now() - loadedAt < 30000) return Promise.resolve();
    loading = (async () => {
      try {
        const [lists, chunks] = await Promise.all([
          Promise.all(db.courses.map((c) => window.studyide.listDocuments(c.code))),
          window.studyide.getSearchCorpus()
        ]);
        docs = lists.flat();
        corpus = chunks.map((c) => ({ ...c, n: norm(c.text) }));
        loadedAt = Date.now();
      } catch (e) {
        console.error('Recherche : chargement impossible', e);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }
  // Appelable depuis le reste de l'appli après un import / une suppression de PDF
  window.SearchBar = { invalidate: () => { loadedAt = 0; } };

  // ---------- Recherche ----------
  const hasAll = (hay, terms) => terms.every((t) => hay.includes(t));
  function countOcc(hay, terms) {
    let total = 0;
    for (const t of terms) {
      let i = 0, k = 0;
      while ((i = hay.indexOf(t, i)) !== -1 && k < 20) { total++; k++; i += t.length; }
    }
    return total;
  }
  const courseName = (code) => (db.courses.find((c) => c.code === code) || {}).name || '';

  function search(query) {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    const out = [];

    if (!terms.length) {
      // Sans saisie : les derniers exercices ouverts / créés
      Object.values(db.exercises)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 5)
        .forEach((ex) => out.push({ kind: 'exercise', ex, title: ex.name, sub: `${ex.courseCode} · ${STATUS[ex.status] || ex.status}`, icon: ex.language === 'java' ? '☕' : '🐍', recent: true }));
      return { terms, out };
    }

    // Matières
    const cs = [];
    for (const c of db.courses) {
      const code = norm(c.code), name = norm(c.name);
      if (!hasAll(code + ' ' + name, terms)) continue;
      cs.push({ score: code.startsWith(terms[0]) ? 3 : name.startsWith(terms[0]) ? 2 : 1, kind: 'course', course: c, title: c.name, sub: c.code, icon: '📚' });
    }
    pushTop(out, cs, 'course');

    // Exercices de code
    const es = [];
    for (const ex of Object.values(db.exercises)) {
      const hay = norm(`${ex.name} ${ex.courseCode} ${courseName(ex.courseCode)} ${ex.language} ${STATUS[ex.status] || ''}`);
      if (!hasAll(hay, terms)) continue;
      es.push({ score: norm(ex.name).includes(terms[0]) ? 2 : 1, kind: 'exercise', ex, title: ex.name, sub: `${ex.courseCode} · ${STATUS[ex.status] || ex.status}`, icon: ex.language === 'java' ? '☕' : '🐍' });
    }
    pushTop(out, es, 'exercise');

    // Documents PDF
    const ds = [];
    for (const d of docs) {
      const hay = norm(`${d.fileName} ${d.courseCode} ${courseName(d.courseCode)}`);
      if (!hasAll(hay, terms)) continue;
      ds.push({ score: norm(d.fileName).includes(terms[0]) ? 2 : 1, kind: 'doc', doc: d, page: 1, title: d.fileName, sub: d.courseCode, icon: '📄' });
    }
    pushTop(out, ds, 'doc');

    // Contenu des PDF (au moins 2 caractères pour éviter le bruit)
    if (terms.join('').length >= 2) {
      const ps = [];
      for (const ch of corpus) {
        if (!hasAll(ch.n, terms)) continue;
        const isEx = ch.type === 'exercise';
        ps.push({
          score: countOcc(ch.n, terms) + (isEx ? 2 : 0),
          kind: 'passage', chunk: ch,
          title: isEx ? `Exercice n°${ch.exerciseNumber} — ${ch.source}` : ch.source,
          sub: `${ch.courseCode} · page ${ch.page || '?'}`,
          icon: isEx ? '📝' : '🔎',
          excerpt: excerpt(ch, terms)
        });
      }
      pushTop(out, ps, 'passage');
    }
    return { terms, out };
  }

  function pushTop(out, list, kind) {
    list.sort((a, b) => b.score - a.score);
    out.push(...list.slice(0, LIMITS[kind]));
  }

  function excerpt(ch, terms) {
    const src = ch.text.length === ch.n.length ? ch.text : ch.n; // garde la casse d'origine si les longueurs coïncident
    const idx = Math.max(0, ch.n.indexOf(terms[0]));
    const start = Math.max(0, idx - 60);
    const piece = src.slice(start, start + 190).replace(/\s+/g, ' ').trim();
    return (start > 0 ? '… ' : '') + piece + (start + 190 < src.length ? ' …' : '');
  }

  // Surligne les mots trouvés (texte échappé ; ignoré si la normalisation change la longueur)
  function highlight(text, terms) {
    if (!terms.length) return esc(text);
    const n = norm(text);
    if (n.length !== text.length) return esc(text);
    const marks = [];
    for (const t of terms) {
      let i = 0;
      while ((i = n.indexOf(t, i)) !== -1) { marks.push([i, i + t.length]); i += t.length; }
    }
    if (!marks.length) return esc(text);
    marks.sort((a, b) => a[0] - b[0]);
    let html = '', pos = 0;
    for (const [s, e] of marks) {
      if (e <= pos) continue;
      const from = Math.max(s, pos);
      html += esc(text.slice(pos, from)) + '<mark>' + esc(text.slice(from, e)) + '</mark>';
      pos = e;
    }
    return html + esc(text.slice(pos));
  }

  // ---------- Affichage ----------
  function render(terms, pending) {
    panel.innerHTML = '';
    if (!items.length) {
      panel.innerHTML = `<div class="sr-empty">${pending ? '⏳ Indexation des cours…' : terms.length ? 'Aucun résultat.' : 'Tape pour chercher dans tes cours, exercices et PDF.'}</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    let i = 0;
    const byKind = (k) => items.filter((it) => it.kind === k);
    const recent = !terms.length;
    for (const [kind, label] of GROUPS) {
      const list = byKind(kind);
      if (!list.length) continue;
      const h = document.createElement('div');
      h.className = 'sr-group';
      h.textContent = recent ? '🕘 Récents' : label;
      frag.appendChild(h);
      for (const it of list) {
        it.i = i;
        const row = document.createElement('div');
        row.className = 'sr-item' + (i === active ? ' active' : '');
        row.setAttribute('role', 'option');
        row.dataset.i = i;
        row.innerHTML =
          `<span class="sr-ico">${it.icon}</span>` +
          `<span class="sr-body"><span class="sr-title">${highlight(it.title, terms)}</span>` +
          `<span class="sr-sub">${esc(it.sub)}</span>` +
          (it.excerpt ? `<span class="sr-excerpt">${highlight(it.excerpt, terms)}</span>` : '') +
          '</span>';
        frag.appendChild(row);
        i++;
      }
    }
    panel.appendChild(frag);
    if (pending) {
      const p = document.createElement('div');
      p.className = 'sr-empty';
      p.textContent = '⏳ Indexation du contenu des PDF…';
      panel.appendChild(p);
    }
  }

  function setActive(n, scroll) {
    if (!items.length) return;
    active = (n + items.length) % items.length;
    panel.querySelectorAll('.sr-item').forEach((r) => r.classList.toggle('active', Number(r.dataset.i) === active));
    if (scroll) {
      const row = panel.querySelector('.sr-item.active');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  }

  function refresh() {
    const my = ++seq;
    const q = input.value;
    clearBtn.classList.toggle('hidden', !q);
    kbd.classList.toggle('hidden', !!q);
    const pending = !loadedAt;
    const { terms, out } = search(q);
    items = out;
    active = items.length ? 0 : -1;
    render(terms, pending);
    if (pending) ensureData().then(() => { if (my === seq && panel && !panel.classList.contains('hidden')) refresh(); });
  }

  function open() {
    if (!panel.classList.contains('hidden')) return;
    panel.classList.remove('hidden');
    wrap.classList.add('open');
    refresh();
    ensureData(); // rafraîchit en arrière-plan si les données ont plus de 30 s
  }
  function close() {
    panel.classList.add('hidden');
    wrap.classList.remove('open');
    seq++;
  }

  // ---------- Ouverture d'un résultat ----------
  function choose(it) {
    if (!it) return;
    close();
    input.value = '';
    input.blur();
    clearBtn.classList.add('hidden');
    kbd.classList.remove('hidden');
    if (it.kind === 'course') {
      if (currentMode !== 'code' && currentMode !== 'cours') switchMode('code');
      selectCourse(it.course.code);
    } else if (it.kind === 'exercise') {
      openExercise(it.ex);
    } else if (it.kind === 'doc') {
      openDocumentAt(it.doc, 1);
    } else if (it.kind === 'passage') {
      const d = docs.find((x) => x.courseCode === it.chunk.courseCode && x.fileName === it.chunk.source);
      if (d) openDocumentAt(d, it.chunk.page || 1);
      else selectCourse(it.chunk.courseCode);
    }
  }

  // ---------- Événements ----------
  input.addEventListener('focus', open);
  input.addEventListener('input', () => { open(); refresh(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); setActive(active + 1, true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1, true); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; refresh(); } else { close(); input.blur(); } }
  });
  clearBtn.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = ''; input.focus(); refresh(); });

  // mousedown (et non click) : le blur de l'input ne ferme pas la liste avant la sélection
  panel.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const row = e.target.closest('.sr-item');
    if (row) choose(items[Number(row.dataset.i)]);
  });
  panel.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.sr-item');
    if (row && Number(row.dataset.i) !== active) setActive(Number(row.dataset.i), false);
  });
  document.addEventListener('mousedown', (e) => { if (!wrap.contains(e.target)) close(); });

  // Ctrl/Cmd + K depuis n'importe où (sort du plein écran si besoin)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.body.classList.contains('editor-fullscreen')) toggleFullscreen();
      input.focus();
      input.select();
    }
  });
})();
