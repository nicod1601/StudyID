// Mode Cours : détection des exercices dans un PDF.

// Détection des exercices : faite une seule fois par document, puis servie depuis la base.
async function loadPdfExercises(doc, pdf, session) {
  let list = await window.studyide.listPdfExercises(doc.id);
  if (session !== pdfSession) return;
  if (!list.length && !doc.exercisesScanned) {
    const pageTexts = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      pageTexts.push(await extractPageLines(page));
      if (session !== pdfSession) return;
      await nextIdle(); // laisse respirer l'interface
    }
    await window.studyide.saveDetectedExercises({ documentId: doc.id, courseCode: currentCourse, exercises: detectExercises(pageTexts) });
    doc.exercisesScanned = true;
    list = await window.studyide.listPdfExercises(doc.id);
    if (session !== pdfSession) return;
  }
  currentPdfExercises = list;
  renderPdfExerciseList();
  updateIaContextChip();
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
