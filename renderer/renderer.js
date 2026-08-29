let db = null;
let currentCourse = null;
let currentExercise = null;
let cm = null;
let dirty = false;
let currentMode = 'code';

// --- État mode Cours ---
let currentDoc = null;
let pdfDoc = null;
let pdfScale = 1.1;
let currentPdfExercises = [];
let activePdfExId = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

const el = (id) => document.getElementById(id);

async function init() {
  db = await window.studyide.getDB();
  renderCourseList();

  cm = CodeMirror(el('editorHost'), {
    value: '// Sélectionne ou crée un exercice pour commencer',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    autoCloseBrackets: true,
    matchBrackets: true,
    mode: 'python',
    readOnly: true
  });
  cm.on('change', () => {
    if (currentExercise) { dirty = true; updateSaveState(); }
  });

  const env = await window.studyide.checkEnv();
  el('dotPython').classList.toggle('ok', env.python);
  el('dotJava').classList.toggle('ok', env.java && env.javac);

  bindEvents();
  bindCoursEvents();
  bindIaEvents();
  bindIaBubbleEvents();
}

function renderCourseList() {
  const list = el('courseList');
  list.innerHTML = '';
  for (const course of db.courses) {
    const div = document.createElement('div');
    div.className = 'course-item' + (currentCourse === course.code ? ' active' : '');
    div.innerHTML = `<span class="code">${course.code}</span>${course.name}`;
    div.onclick = () => selectCourse(course.code);
    list.appendChild(div);
  }
}

function selectCourse(code) {
  currentCourse = code;
  currentExercise = null;
  currentDoc = null;
  renderCourseList();
  const course = db.courses.find((c) => c.code === code);
  el('courseTitle').textContent = `${course.code} — ${course.name}`;
  el('coursTitle').textContent = `${course.code} — ${course.name}`;
  renderExerciseList();
  loadExerciseIntoEditor(null);
  if (currentMode === 'cours') renderDocList();
  updateIaCourseIndicator();
}

function renderExerciseList() {
  const listEl = el('exerciseList');
  listEl.innerHTML = '';
  const exs = Object.values(db.exercises).filter((e) => e.courseCode === currentCourse);
  if (!exs.length) {
    listEl.innerHTML = '<div class="empty-hint">Aucun exercice pour cette matière.<br>Clique sur "+ Nouvel exercice".</div>';
    return;
  }
  exs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const ex of exs) {
    const card = document.createElement('div');
    card.className = 'exercise-card' + (currentExercise?.id === ex.id ? ' selected' : '');
    const icon = ex.language === 'java' ? '☕' : '🐍';
    card.innerHTML = `
      <div class="name">${icon} ${ex.name}</div>
      <div class="meta">
        <span class="badge ${ex.status}">${statusLabel(ex.status)}</span>
        <button class="del-ex" title="Supprimer">✕</button>
      </div>`;
    card.onclick = (e) => {
      if (e.target.classList.contains('del-ex')) return;
      currentExercise = ex;
      renderExerciseList();
      loadExerciseIntoEditor(ex);
    };
    card.querySelector('.del-ex').onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${ex.name}" (et son fichier) ?`)) {
        db = await window.studyide.deleteExercise({ id: ex.id, deleteFile: true });
        if (currentExercise?.id === ex.id) { currentExercise = null; loadExerciseIntoEditor(null); }
        renderExerciseList();
      }
    };
    listEl.appendChild(card);
  }
}

function statusLabel(s) {
  return { todo: 'À faire', 'in-progress': 'En cours', done: 'Terminé' }[s] || s;
}

async function loadExerciseIntoEditor(ex) {
  dirty = false;
  if (!ex) {
    cm.setValue('// Sélectionne ou crée un exercice pour commencer');
    cm.setOption('readOnly', true);
    el('tabInfo').textContent = 'Aucun fichier ouvert';
    el('runBtn').disabled = true;
    el('saveBtn').disabled = true;
    el('statusSelect').disabled = true;
    updateIaContextChip();
    return;
  }
  const res = await window.studyide.readFile(ex.filePath);
  cm.setOption('mode', ex.language === 'java' ? 'text/x-java' : 'python');
  cm.setValue(res.ok ? res.content : `// Impossible de lire le fichier : ${res.error}`);
  cm.setOption('readOnly', false);
  el('tabInfo').textContent = ex.filePath;
  el('runBtn').disabled = false;
  el('saveBtn').disabled = false;
  el('statusSelect').disabled = false;
  el('statusSelect').value = ex.status;
  updateSaveState();
  updateIaContextChip();
}

function updateSaveState() {
  el('saveBtn').textContent = dirty ? '💾 Enregistrer *' : '💾 Enregistrer';
}

async function saveCurrent() {
  if (!currentExercise) return;
  const res = await window.studyide.writeFile({ filePath: currentExercise.filePath, content: cm.getValue() });
  if (res.ok) { dirty = false; updateSaveState(); }
  else { alert('Erreur en enregistrant : ' + res.error); }
}

async function runCurrent() {
  if (!currentExercise) return;
  if (dirty) await saveCurrent();
  const outEl = el('outputContent');
  outEl.classList.remove('error');
  outEl.textContent = '⏳ Exécution en cours...';
  const result = await window.studyide.executeCode({
    filePath: currentExercise.filePath,
    language: currentExercise.language
  });
  if (result.ok) {
    outEl.classList.remove('error');
    outEl.textContent = result.output || '(aucune sortie)';
  } else {
    outEl.classList.add('error');
    outEl.textContent = (result.output ? result.output + '\n' : '') + '--- Erreur ---\n' + (result.error || 'Erreur inconnue.');
  }
}

function bindEvents() {
  el('saveBtn').onclick = saveCurrent;
  el('runBtn').onclick = runCurrent;
  el('clearOutputBtn').onclick = () => { el('outputContent').textContent = ''; el('outputContent').classList.remove('error'); };

  el('statusSelect').onchange = async (e) => {
    if (!currentExercise) return;
    db = await window.studyide.updateExerciseStatus({ id: currentExercise.id, status: e.target.value });
    currentExercise = db.exercises[currentExercise.id];
    renderExerciseList();
  };

  el('openWorkspaceBtn').onclick = async () => {
    const dir = await window.studyide.getWorkspaceDir();
    window.studyide.openExternal(dir);
  };

  // Modale nouvel exercice
  let chosenLang = 'python';
  el('newExerciseBtn').onclick = () => {
    if (!currentCourse) { alert('Choisis d’abord une matière à gauche.'); return; }
    el('newExName').value = '';
    chosenLang = 'python';
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === 'python'));
    el('modalOverlay').classList.add('open');
    el('newExName').focus();
  };
  el('cancelNewExBtn').onclick = () => el('modalOverlay').classList.remove('open');
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.onclick = () => {
      chosenLang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
    };
  });
  el('confirmNewExBtn').onclick = async () => {
    const name = el('newExName').value.trim();
    if (!name) { alert('Donne un nom à l’exercice.'); return; }
    const ex = await window.studyide.createExercise({ courseCode: currentCourse, name, language: chosenLang });
    db = await window.studyide.getDB();
    currentExercise = ex;
    el('modalOverlay').classList.remove('open');
    renderExerciseList();
    loadExerciseIntoEditor(ex);
  };
  el('newExName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('confirmNewExBtn').click();
  });

  // Ctrl+S pour sauvegarder
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrent();
    }
  });
}

// =====================================================================
// MODE COURS : documents PDF + détection automatique des exercices
// =====================================================================

function switchMode(mode) {
  currentMode = mode;
  el('modeCodeBtn').classList.toggle('active', mode === 'code');
  el('modeCoursBtn').classList.toggle('active', mode === 'cours');
  el('codeContent').classList.toggle('hidden', mode !== 'code');
  el('coursContent').classList.toggle('hidden', mode !== 'cours');
  if (mode === 'cours' && currentCourse) renderDocList();
  updateIaContextChip();
}

async function renderDocList() {
  const listEl = el('docList');
  listEl.innerHTML = '';
  if (!currentCourse) {
    listEl.innerHTML = '<div class="empty-hint">Choisis une matière à gauche.</div>';
    return;
  }
  const docs = await window.studyide.listDocuments(currentCourse);
  if (!docs.length) {
    listEl.innerHTML = '<div class="empty-hint">Aucun PDF pour cette matière.<br>Clique sur "+ Importer un PDF".</div>';
    return;
  }
  for (const doc of docs) {
    const card = document.createElement('div');
    card.className = 'doc-card' + (currentDoc?.id === doc.id ? ' selected' : '');
    card.innerHTML = `
      <div class="name">📄 ${doc.fileName}</div>
      <div class="meta"><span>${doc.seeded ? 'Fourni avec l\'appli' : 'Importé'}</span><button class="del-ex" title="Supprimer">✕</button></div>`;
    card.onclick = (e) => {
      if (e.target.classList.contains('del-ex')) return;
      openDocument(doc);
    };
    card.querySelector('.del-ex').onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${doc.fileName}" (et son fichier) ?`)) {
        await window.studyide.deleteDocument({ id: doc.id, deleteFile: true });
        if (currentDoc?.id === doc.id) { currentDoc = null; clearPdfViewport(); }
        renderDocList();
      }
    };
    listEl.appendChild(card);
  }
}

function clearPdfViewport() {
  el('pdfViewport').innerHTML = '<div class="pdf-empty" id="pdfEmpty">Sélectionne un document PDF à gauche.</div>';
  el('docTabInfo').textContent = 'Aucun document ouvert';
  el('pdfExList').innerHTML = '';
  currentPdfExercises = [];
}

async function openDocument(doc) {
  currentDoc = doc;
  renderDocList();
  el('docTabInfo').textContent = doc.fileName;
  const viewport = el('pdfViewport');
  viewport.innerHTML = '<div class="pdf-empty">⏳ Chargement du PDF…</div>';

  const res = await window.studyide.readPdfBase64(doc.filePath);
  if (!res.ok) {
    viewport.innerHTML = `<div class="pdf-empty">Erreur : ${res.error}</div>`;
    return;
  }
  const bytes = base64ToUint8Array(res.base64);
  pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;

  viewport.innerHTML = '';
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    await renderPdfPage(page, pageNum, viewport);
    pageTexts.push(await extractPageLines(page));
  }

  const detected = detectExercises(pageTexts);
  await window.studyide.saveDetectedExercises({
    documentId: doc.id,
    courseCode: currentCourse,
    exercises: detected
  });
  currentPdfExercises = await window.studyide.listPdfExercises(doc.id);
  renderPdfExerciseList();
  updateIaContextChip();
}

async function renderPdfPage(page, pageNum, viewport) {
  const vp = page.getViewport({ scale: pdfScale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  canvas.dataset.pageNum = pageNum;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  viewport.appendChild(canvas);
  const tag = document.createElement('div');
  tag.className = 'page-number-tag';
  tag.textContent = `Page ${pageNum}`;
  viewport.appendChild(tag);
}

// Reconstruit des "lignes" de texte à partir des items positionnés de pdf.js
// (regroupe les items dont la coordonnée y est proche).
async function extractPageLines(page) {
  const content = await page.getTextContent();
  const items = content.items.map((it) => ({
    str: it.str,
    x: it.transform[4],
    y: it.transform[5]
  }));
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  let current = null;
  for (const it of items) {
    if (!current || Math.abs(it.y - current.y) > 3) {
      current = { y: it.y, parts: [] };
      lines.push(current);
    }
    if (it.str.trim()) current.parts.push(it.str);
  }
  return lines.map((l) => l.parts.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Détecte les occurrences "Exercice n°X ..." dans le texte de chaque page
// et regroupe l'énoncé jusqu'à l'exercice suivant.
function detectExercises(pageTexts) {
  const marker = /^Exercice\s*n?[o°ᵒ]?\s*(\d+)\s*(.*)$/i;
  const found = []; // { number, title, page, startLineIdx (global) }
  const allLines = []; // { text, page }
  pageTexts.forEach((lines, idx) => {
    for (const line of lines) allLines.push({ text: line, page: idx + 1 });
  });

  allLines.forEach((entry, i) => {
    const m = entry.text.match(marker);
    if (m) {
      found.push({ number: m[1], title: (m[2] || '').trim(), page: entry.page, lineIndex: i });
    }
  });

  const exercises = [];
  for (let i = 0; i < found.length; i++) {
    const start = found[i].lineIndex + 1;
    const end = i + 1 < found.length ? found[i + 1].lineIndex : allLines.length;
    const statementLines = allLines.slice(start, end).map((l) => l.text);
    exercises.push({
      number: found[i].number,
      title: found[i].title,
      page: found[i].page,
      statement: statementLines.join('\n').slice(0, 4000)
    });
  }
  return exercises;
}

function renderPdfExerciseList() {
  const listEl = el('pdfExList');
  listEl.innerHTML = '';
  if (!currentPdfExercises.length) {
    listEl.innerHTML = '<div class="empty-hint">Aucun exercice détecté automatiquement dans ce document.</div>';
    return;
  }
  for (const ex of currentPdfExercises) {
    const item = document.createElement('div');
    item.className = 'pdf-ex-item';
    item.innerHTML = `
      <div class="num">Exercice n°${ex.number} — page ${ex.page}</div>
      <div class="title">${ex.title || '(sans titre)'}</div>
      <div class="meta-row">
        <span class="badge ${ex.status}">${statusLabel(ex.status)}</span>
        <span>${ex.solution ? '✅ solution dispo' : '📝 à compléter'}</span>
      </div>`;
    item.onclick = () => openPdfExerciseModal(ex);
    listEl.appendChild(item);
  }
}

function openPdfExerciseModal(ex) {
  activePdfExId = ex.id;
  updateIaContextChip();
  el('pdfExModalTitle').textContent = `Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''}`;
  el('pdfExStatusSelect').value = ex.status;
  el('pdfExStatement').innerHTML = ex.statement
    ? simpleMarkdown(ex.statement)
    : '<em>Pas de texte extrait automatiquement — regarde la page correspondante dans le PDF.</em>';
  el('pdfExSolution').innerHTML = ex.solution
    ? simpleMarkdown(ex.solution)
    : '<em>Pas encore de solution pour cet exercice. Ajoute tes propres notes ci-dessous !</em>';
  el('pdfExUserNotes').value = ex.userNotes || '';
  el('pdfExModalOverlay').classList.add('open');
}

function simpleMarkdown(text) {
  // Conversion markdown minimale : ```code```, `inline`, **gras**, tableaux, listes, sauts de ligne.
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let src = text;
  const codeBlocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(`<pre><code>${escape(code.trim())}</code></pre>`);
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
  });

  const lines = src.split('\n');
  const htmlLines = [];
  let inTable = false;
  for (let raw of lines) {
    let line = raw;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:-]+$/.test(line)) continue; // ligne de séparation ---|---
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!inTable) { htmlLines.push('<table>'); inTable = true; }
      htmlLines.push('<tr>' + cells.map((c) => `<td>${escape(c)}</td>`).join('') + '</tr>');
      continue;
    } else if (inTable) {
      htmlLines.push('</table>');
      inTable = false;
    }
    line = escape(line);
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/`(.+?)`/g, '<code>$1</code>');
    if (/^-\s+/.test(line)) line = '• ' + line.replace(/^-\s+/, '');
    htmlLines.push(line);
  }
  if (inTable) htmlLines.push('</table>');
  let html = htmlLines.join('<br>');
  html = html.replace(/@@CODEBLOCK(\d+)@@/g, (m, i) => codeBlocks[Number(i)]);
  return html;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bindCoursEvents() {
  el('modeCodeBtn').onclick = () => switchMode('code');
  el('modeCoursBtn').onclick = () => switchMode('cours');

  el('importPdfBtn').onclick = async () => {
    if (!currentCourse) { alert('Choisis d’abord une matière à gauche.'); return; }
    const doc = await window.studyide.importPdfDialog(currentCourse);
    if (doc) { renderDocList(); openDocument(doc); }
  };

  el('zoomInBtn').onclick = () => { pdfScale = Math.min(pdfScale + 0.15, 2.5); el('zoomLabel').textContent = Math.round(pdfScale / 1.1 * 100) + '%'; if (currentDoc) openDocument(currentDoc); };
  el('zoomOutBtn').onclick = () => { pdfScale = Math.max(pdfScale - 0.15, 0.5); el('zoomLabel').textContent = Math.round(pdfScale / 1.1 * 100) + '%'; if (currentDoc) openDocument(currentDoc); };

  el('closePdfExModalBtn').onclick = () => {
    el('pdfExModalOverlay').classList.remove('open');
    activePdfExId = null;
    updateIaContextChip();
  };

  el('pdfExStatusSelect').onchange = async (e) => {
    if (!activePdfExId) return;
    await window.studyide.updatePdfExerciseStatus({ id: activePdfExId, status: e.target.value });
    currentPdfExercises = await window.studyide.listPdfExercises(currentDoc.id);
    renderPdfExerciseList();
  };

  el('saveNotesBtn').onclick = async () => {
    if (!activePdfExId) return;
    await window.studyide.updatePdfExerciseNotes({ id: activePdfExId, userNotes: el('pdfExUserNotes').value });
    currentPdfExercises = await window.studyide.listPdfExercises(currentDoc.id);
    el('pdfExModalOverlay').classList.remove('open');
    renderPdfExerciseList();
  };
}

// =====================================================================
// MODE IA : recherche locale dans les documents + IA en ligne (Gemini, gratuit)
// =====================================================================

let iaSettings = null;
let iaOnline = false;
let iaIndexed = false;
let iaCorpus = []; // { type, courseCode, source, page, exerciseNumber?, text }

function updateIaCourseIndicator() {
  const label = el('iaCurrentCourse');
  if (!label) return;
  if (currentCourse) {
    const course = db.courses.find((c) => c.code === currentCourse);
    label.textContent = `📘 Matière sélectionnée : ${course.code} — ${course.name}`;
  } else {
    label.textContent = '👈 Choisis une matière dans la liste à gauche';
  }
}

async function initIaMode() {
  el('iaScopeSelect').value = currentCourse ? 'current' : 'all';
  updateIaCourseIndicator();
  iaSettings = await window.studyide.getSettings();
  el('iaEngineSelect').value = iaSettings.iaEngine || 'auto';
  await checkIaConnectivity();
  await refreshLocalAiStatus();
  await buildSearchIndex();
}

let localAiStatusCache = { downloaded: false, downloading: false };
let selectedLocalModelId = 'fast';

async function refreshLocalAiStatus() {
  localAiStatusCache = await window.studyide.getLocalAIStatus();
  selectedLocalModelId = localAiStatusCache.modelId || 'fast';
  await renderLocalModelsList();
}

async function renderLocalModelsList() {
  const container = el('localModelsList');
  if (!container) return;
  const models = await window.studyide.listLocalAIModels();
  container.innerHTML = '';
  for (const m of models) {
    const card = document.createElement('div');
    card.className = 'model-option-card' + (m.id === selectedLocalModelId ? ' selected' : '');
    card.innerHTML = `
      <div class="mo-head">
        <span class="mo-label">${m.id === selectedLocalModelId ? '✅ ' : ''}${escapeHtml(m.label)}</span>
      </div>
      <div class="mo-desc">${escapeHtml(m.description)}</div>
      <div class="mo-actions">
        ${m.downloaded
          ? `<span class="mo-status">✅ Téléchargé</span><button class="mo-delete-btn" data-id="${m.id}">🗑 Supprimer</button>`
          : m.downloading
            ? `<span class="mo-status">⏳ Téléchargement…</span>`
            : `<button class="mo-download-btn" data-id="${m.id}">⬇ Télécharger</button>`}
      </div>`;
    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (!m.downloaded) { el('localAiStatus').textContent = 'Télécharge ce profil avant de le sélectionner.'; return; }
      selectedLocalModelId = m.id;
      renderLocalModelsList();
    };
    const dlBtn = card.querySelector('.mo-download-btn');
    if (dlBtn) dlBtn.onclick = (e) => { e.stopPropagation(); downloadModelProfile(m.id); };
    const delBtn = card.querySelector('.mo-delete-btn');
    if (delBtn) delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer le profil "${m.label}" ?`)) return;
      await window.studyide.deleteLocalAI(m.id);
      await renderLocalModelsList();
    };
    container.appendChild(card);
  }
}

async function downloadModelProfile(modelId) {
  el('localAiStatus').textContent = '⏳ Démarrage du téléchargement… (peut prendre plusieurs minutes selon ta connexion)';
  el('localAiProgressWrap').classList.remove('hidden');
  el('localAiProgressFill').style.width = '0%';
  const off = window.studyide.onLocalAIProgress((data) => {
    if (data.percent != null) {
      el('localAiProgressFill').style.width = data.percent + '%';
      el('localAiStatus').textContent = `⏳ Téléchargement… ${data.percent}% (${(data.received / 1e6).toFixed(0)} Mo / ${(data.total / 1e6).toFixed(0)} Mo)`;
    } else {
      el('localAiStatus').textContent = `⏳ Téléchargement… ${(data.received / 1e6).toFixed(0)} Mo`;
    }
  });
  const res = await window.studyide.downloadLocalAI(modelId);
  off();
  el('localAiProgressWrap').classList.add('hidden');
  if (!res.ok) {
    el('localAiStatus').textContent = `❌ Échec du téléchargement : ${res.error}`;
  } else {
    el('localAiStatus').textContent = '✅ Téléchargement terminé !';
    selectedLocalModelId = modelId;
  }
  await renderLocalModelsList();
}

async function checkIaConnectivity() {
  iaSettings = await window.studyide.getSettings();
  const dot = el('iaConnDot');
  const label = el('iaConnLabel');
  if (!navigator.onLine) {
    dot.classList.remove('ok');
    label.textContent = 'Hors ligne — recherche locale uniquement';
    iaOnline = false;
    return;
  }
  if (!iaSettings.geminiApiKey) {
    dot.classList.remove('ok');
    label.textContent = 'En ligne, mais pas de clé API configurée (Réglages)';
    iaOnline = false;
    return;
  }
  dot.classList.add('ok');
  label.textContent = 'En ligne — réponses IA + recherche web activées';
  iaOnline = true;
}

async function buildSearchIndex() {
  const statusEl = el('iaIndexStatus');
  statusEl.textContent = '⏳ Indexation de tes documents…';
  const docs = [];
  for (const course of db.courses) {
    const courseDocs = await window.studyide.listDocuments(course.code);
    docs.push(...courseDocs);
  }
  for (const doc of docs) {
    if (!doc.pages) {
      try {
        const res = await window.studyide.readPdfBase64(doc.filePath);
        if (!res.ok) continue;
        const bytes = base64ToUint8Array(res.base64);
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const pages = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const lines = await extractPageLines(page);
          pages.push(lines.join('\n'));
        }
        await window.studyide.savePageText({ documentId: doc.id, pages });
      } catch (e) {
        console.error('Indexation impossible pour', doc.fileName, e);
      }
    }
  }
  iaCorpus = await window.studyide.getSearchCorpus();
  iaIndexed = true;
  statusEl.textContent = `✅ ${docs.length} document(s) indexé(s), ${iaCorpus.length} passages disponibles pour la recherche.`;
}

// Recherche locale par mots-clés (score = nb d'occurrences pondéré)
function localSearch(query, scope) {
  const stopwords = new Set(['le','la','les','de','des','du','un','une','et','ou','à','a','en','dans','pour','sur','est','qu','que','qui','avec','ce','se','son','sa','ses','au','aux','par','plus','comment','pourquoi','quel','quelle','quels','quelles']);
  const terms = query.toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopwords.has(t));
  if (!terms.length) return [];

  const pool = scope === 'current' && currentCourse
    ? iaCorpus.filter((c) => c.courseCode === currentCourse)
    : iaCorpus;

  const scored = pool.map((chunk) => {
    const lower = chunk.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const matches = lower.split(t).length - 1;
      score += matches * (t.length > 5 ? 2 : 1);
    }
    return { chunk, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.chunk);
}

function excerptAround(text, terms, maxLen = 260) {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t.toLowerCase());
    if (idx !== -1) break;
  }
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + maxLen - 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

async function handleIaSend() {
  const input = el('iaInput');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  input.style.height = 'auto';
  appendUserMessage(question);

  const scope = el('iaScopeSelect').value;
  if (!iaIndexed) await buildSearchIndex();
  await checkIaConnectivity();
  localAiStatusCache = await window.studyide.getLocalAIStatus();

  const results = localSearch(question, scope);
  const engine = el('iaEngineSelect').value;
  const activeContext = el('iaUseContextCheckbox').checked ? getActiveContext() : null;

  if (engine === 'search') {
    answerOffline(question, results);
    return;
  }
  if (engine === 'gemini') {
    if (iaOnline) await answerOnline(question, results, activeContext);
    else { appendAssistantMessage({ modeLabel: '⚠️ Gemini indisponible', bodyHtml: 'Tu es hors ligne ou sans clé API. Voici la recherche locale à la place :' }); answerOffline(question, results); }
    return;
  }
  if (engine === 'local') {
    if (localAiStatusCache.downloaded) await answerLocal(question, results, activeContext);
    else { appendAssistantMessage({ modeLabel: '⚠️ Mini IA locale non installée', bodyHtml: 'Télécharge-la dans "⚙ Réglages". En attendant, voici la recherche locale :' }); answerOffline(question, results); }
    return;
  }
  // auto : Gemini si en ligne, sinon mini IA locale si dispo, sinon recherche seule
  if (iaOnline) { await answerOnline(question, results, activeContext); return; }
  if (localAiStatusCache.downloaded) { await answerLocal(question, results, activeContext); return; }
  answerOffline(question, results);
}

async function answerLocal(question, results, activeContext) {
  appendAssistantMessage({ modeLabel: '⏳ Mini IA locale — génération en cours (peut prendre 10-30s)…', bodyHtml: 'Réflexion…' });
  const thinkingMsg = el('iaMessages').lastElementChild;

  const contextBlock = results.length
    ? results.map((r, i) => `[Source ${i + 1} — ${r.courseCode} / ${r.source}${r.page ? ` p.${r.page}` : ''}]\n${r.text.slice(0, 1500)}`).join('\n\n')
    : '(aucun passage local pertinent trouvé)';
  const activeBlock = activeContext ? `\n\n--- Ce que l'étudiant a actuellement ouvert dans l'appli ---\n${activeContext.text}\n--- Fin ---` : '';

  const prompt = `Tu es une mini IA experte, embarquée dans une application d'un étudiant en BUT Informatique (Semestre 5), et tu réponds uniquement en français. ` +
    `Tu es particulièrement douée pour : expliquer clairement des notions de cours (algo, bases de données, management, économie, anglais...), écrire et corriger du code Java et Python propre et fonctionnel, et déboguer des erreurs pas à pas. ` +
    `Utilise en priorité les extraits de cours ci-dessous pour répondre. Si ce n'est pas suffisant, dis-le clairement puis complète avec tes connaissances. Structure ta réponse (étapes, listes, exemples de code dans des blocs \`\`\` si pertinent).\n\n` +
    `--- Extraits des cours ---\n${contextBlock}\n--- Fin des extraits ---${activeBlock}\n\n` +
    `Question : ${question}`;

  const res = await window.studyide.askLocalAI({ prompt });
  thinkingMsg.remove();

  if (!res.ok) {
    appendAssistantMessage({ modeLabel: '⚠️ Erreur mini IA locale', bodyHtml: `${escapeHtml(res.error)} Voici la recherche locale :` });
    answerOffline(question, results);
    return;
  }

  const localSourcesList = results.map((r) => ({
    name: `${r.courseCode} — ${r.source}${r.page ? ` (page ${r.page})` : ''}`
  }));
  if (activeContext) localSourcesList.unshift({ name: `🔗 Contexte utilisé : ${activeContext.label}` });
  appendAssistantMessage({
    modeLabel: '🧠 Mini IA locale — 100% hors ligne',
    bodyHtml: simpleMarkdown(res.text),
    sources: localSourcesList
  });
}

function appendUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'ia-msg user';
  wrap.innerHTML = `<div class="ia-bubble">${escapeHtml(text)}</div>`;
  el('iaMessages').appendChild(wrap);
  el('iaMessages').scrollTop = el('iaMessages').scrollHeight;
}

function appendAssistantMessage({ modeLabel, bodyHtml, sources }) {
  const wrap = document.createElement('div');
  wrap.className = 'ia-msg assistant';
  let html = `<div class="ia-badge-mode">${modeLabel}</div><div class="ia-bubble">${bodyHtml}</div>`;
  if (sources && sources.length) {
    html += `<div class="ia-sources"><div class="src-title">Sources</div>` +
      sources.map((s) => `
        <div class="ia-source-item">
          <div class="src-name">${escapeHtml(s.name)}</div>
          ${s.excerpt ? `<div class="src-excerpt">${escapeHtml(s.excerpt)}</div>` : ''}
          ${s.url ? `<a href="#" data-url="${s.url}" class="open-web-source">${escapeHtml(s.url)}</a>` : ''}
        </div>`).join('') +
      `</div>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.open-web-source').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); window.studyide.openUrl(a.dataset.url); };
  });
  // Ajoute un bouton "Insérer dans l'éditeur" sous chaque bloc de code de la réponse
  wrap.querySelectorAll('.ia-bubble pre code').forEach((codeEl) => {
    const btn = document.createElement('button');
    btn.className = 'ia-insert-code-btn';
    btn.textContent = currentExercise ? '📥 Insérer dans l\'éditeur' : '📥 Insérer (ouvre un exercice de code d\'abord)';
    btn.onclick = () => insertCodeIntoEditor(codeEl.textContent);
    codeEl.parentElement.insertAdjacentElement('afterend', btn);
  });
  el('iaMessages').appendChild(wrap);
  el('iaMessages').scrollTop = el('iaMessages').scrollHeight;
}

function answerOffline(question, results) {
  if (!results.length) {
    appendAssistantMessage({
      modeLabel: '🔌 Mode hors ligne — recherche locale',
      bodyHtml: `Je n'ai rien trouvé dans tes documents pour "${escapeHtml(question)}". Essaie d'autres mots-clés, ou importe le PDF concerné dans le mode Cours.`
    });
    return;
  }
  const terms = question.toLowerCase().split(/\s+/);
  const sources = results.map((r) => ({
    name: `${r.courseCode} — ${r.source}${r.page ? ` (page ${r.page})` : ''}${r.exerciseNumber ? ` — Exercice n°${r.exerciseNumber}` : ''}`,
    excerpt: excerptAround(r.text, terms)
  }));
  appendAssistantMessage({
    modeLabel: '🔌 Mode hors ligne — recherche locale (aucun texte généré par IA)',
    bodyHtml: `Voici les passages de tes documents qui correspondent le mieux à ta question. Connecte-toi et ajoute une clé API dans Réglages pour obtenir une réponse rédigée.`,
    sources
  });
}

async function answerOnline(question, results, activeContext) {
  appendAssistantMessage({ modeLabel: '⏳ Recherche en cours…', bodyHtml: 'Interrogation de l\'IA…' });
  const thinkingMsg = el('iaMessages').lastElementChild;

  const contextBlock = results.length
    ? results.map((r, i) => `[Source ${i + 1} — ${r.courseCode} / ${r.source}${r.page ? ` p.${r.page}` : ''}]\n${r.text.slice(0, 1200)}`).join('\n\n')
    : '(aucun passage local pertinent trouvé)';
  const activeBlock = activeContext ? `\n\n--- Ce que l'étudiant a actuellement ouvert dans l'appli ---\n${activeContext.text}\n--- Fin ---` : '';

  const prompt = `Tu es un assistant pédagogique pour un étudiant en BUT Informatique (Semestre 5). ` +
    `Réponds à sa question en priorité à partir des extraits de ses cours ci-dessous. ` +
    `Si les extraits ne suffisent pas, complète avec tes connaissances générales ou une recherche web, ` +
    `et indique clairement quand tu sors des documents fournis. Sois clair, structuré, avec des exemples si utile. ` +
    `Si l'étudiant a un fichier de code ouvert, tu peux proposer une version corrigée ou complétée dans un bloc de code.\n\n` +
    `--- Extraits des cours de l'étudiant ---\n${contextBlock}\n--- Fin des extraits ---${activeBlock}\n\n` +
    `Question de l'étudiant : ${question}`;

  try {
    const model = (iaSettings.geminiModel || 'gemini-2.0-flash').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(iaSettings.geminiApiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    });
    const data = await resp.json();
    thinkingMsg.remove();

    if (!resp.ok) {
      const errMsg = data?.error?.message || `Erreur HTTP ${resp.status}`;
      appendAssistantMessage({
        modeLabel: '⚠️ Erreur IA en ligne',
        bodyHtml: `Impossible d'obtenir une réponse (${escapeHtml(errMsg)}). Vérifie ta clé API dans Réglages. En attendant, voici la recherche locale :`
      });
      answerOffline(question, results);
      return;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || 'Pas de réponse.';
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks
      .filter((c) => c.web)
      .map((c) => ({ name: c.web.title || c.web.uri, url: c.web.uri }));

    const localSourcesList = results.map((r) => ({
      name: `${r.courseCode} — ${r.source}${r.page ? ` (page ${r.page})` : ''}`
    }));
    if (activeContext) localSourcesList.unshift({ name: `🔗 Contexte utilisé : ${activeContext.label}` });

    appendAssistantMessage({
      modeLabel: '🌐 En ligne — réponse générée (Gemini) + recherche web si nécessaire',
      bodyHtml: simpleMarkdown(text),
      sources: [...localSourcesList, ...webSources]
    });
  } catch (e) {
    thinkingMsg.remove();
    appendAssistantMessage({
      modeLabel: '⚠️ Connexion impossible',
      bodyHtml: `Erreur réseau (${escapeHtml(e.message)}). Passage en recherche locale :`
    });
    answerOffline(question, results);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bindIaEvents() {
  el('iaSendBtn').onclick = handleIaSend;
  el('iaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIaSend(); }
  });
  el('iaInput').addEventListener('input', () => {
    const ta = el('iaInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
  });
  el('iaScopeSelect').onchange = () => {};
  el('iaEngineSelect').onchange = async () => {
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, iaEngine: el('iaEngineSelect').value });
  };

  window.addEventListener('online', checkIaConnectivity);
  window.addEventListener('offline', checkIaConnectivity);

  el('iaSettingsBtn').onclick = async () => {
    const s = await window.studyide.getSettings();
    el('geminiKeyInput').value = s.geminiApiKey || '';
    el('geminiModelInput').value = s.geminiModel || 'gemini-2.5-flash';
    await refreshLocalAiStatus();
    el('iaSettingsOverlay').classList.add('open');
  };
  el('cancelIaSettingsBtn').onclick = () => el('iaSettingsOverlay').classList.remove('open');
  el('saveIaSettingsBtn').onclick = async () => {
    const prev = await window.studyide.getSettings();
    await window.studyide.setSettings({
      ...prev,
      geminiApiKey: el('geminiKeyInput').value.trim(),
      geminiModel: el('geminiModelInput').value.trim() || 'gemini-2.5-flash',
      localModelId: selectedLocalModelId
    });
    el('iaSettingsOverlay').classList.remove('open');
    checkIaConnectivity();
    refreshLocalAiStatus();
  };
  el('openAiStudioLink').onclick = () => window.studyide.openUrl('https://aistudio.google.com/apikey');
}

// =====================================================================
// Bulle IA flottante + tiroir + contexte actif (fichier/exercice ouvert)
// =====================================================================

let iaDrawerOpen = false;
let iaDrawerInitialized = false;

function getActiveContext() {
  // Priorité : exercice PDF précis ouvert > document PDF ouvert > exercice de code ouvert
  if (activePdfExId) {
    const ex = currentPdfExercises.find((e) => e.id === activePdfExId);
    if (ex) {
      const parts = [`Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''} (${currentDoc?.fileName || ''})`];
      if (ex.statement) parts.push('Énoncé : ' + ex.statement.slice(0, 1500));
      if (ex.solution) parts.push('Solution connue : ' + ex.solution.slice(0, 1500));
      return { label: `📄 Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''}`, text: parts.join('\n') };
    }
  }
  if (currentMode === 'cours' && currentDoc) {
    return { label: `📄 Document ouvert : ${currentDoc.fileName}`, text: `Document actuellement consulté : ${currentDoc.fileName}` };
  }
  if (currentExercise && cm) {
    const code = cm.getValue();
    return {
      label: `💻 Code ouvert : ${currentExercise.name} (${currentExercise.language})`,
      text: `Fichier actuellement ouvert dans l'éditeur (${currentExercise.language}), nommé ${currentExercise.name} :\n\`\`\`${currentExercise.language}\n${code.slice(0, 3000)}\n\`\`\``
    };
  }
  return null;
}

function updateIaContextChip() {
  const chip = el('iaContextChip');
  if (!chip) return;
  const ctx = getActiveContext();
  if (ctx) {
    chip.textContent = ctx.label;
    chip.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
  }
}

function openIaDrawer() {
  iaDrawerOpen = true;
  el('iaDrawer').classList.add('open');
  el('iaDrawerOverlay').classList.add('open');
  el('iaBubbleBtn').classList.add('active');
  updateIaContextChip();
  if (!iaDrawerInitialized) {
    iaDrawerInitialized = true;
    initIaMode();
  } else {
    checkIaConnectivity();
  }
}

function closeIaDrawer() {
  iaDrawerOpen = false;
  el('iaDrawer').classList.remove('open');
  el('iaDrawerOverlay').classList.remove('open');
  el('iaBubbleBtn').classList.remove('active');
}

function insertCodeIntoEditor(code) {
  if (!currentExercise || !cm) {
    alert("Ouvre d'abord un exercice de code (mode Code) pour pouvoir y insérer ce code.");
    return;
  }
  if (cm.getValue().trim() && !confirm('Remplacer le contenu actuel de l\'éditeur par ce code ?')) {
    return;
  }
  cm.setValue(code);
  dirty = true;
  updateSaveState();
}

function bindIaBubbleEvents() {
  el('iaBubbleBtn').onclick = () => { iaDrawerOpen ? closeIaDrawer() : openIaDrawer(); };
  el('iaCloseDrawerBtn').onclick = closeIaDrawer;
  el('iaDrawerOverlay').onclick = closeIaDrawer;
  el('iaToggleOptionsBtn').onclick = () => el('iaOptionsPanel').classList.toggle('hidden');
}

init();
