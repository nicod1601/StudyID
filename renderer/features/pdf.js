/**
 * Mode Cours : documents PDF (rendu via pdf.js) et détection automatique des
 * exercices.
 *
 * Optimisation clé : le PDF n'est lu et parsé qu'UNE fois à l'ouverture. Le
 * zoom se contente de redessiner les pages déjà en mémoire (state.pdfDoc), sans
 * relire le disque ni relancer la détection d'exercices.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { simpleMarkdown } from '../core/markdown.js';
import { statusLabel } from './editor.js';
import { updateIaContextChip } from './ia.js';

const BASE_SCALE = 1.1;       // échelle de référence (= 100 % affiché)
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;

let pdfScale = BASE_SCALE;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

// Décode une chaîne base64 en octets pour pdf.js.
export function base64ToUint8Array(base64)
{
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function renderDocList()
{
  const listEl = el('docList');

  if (!state.currentCourse)
  {
    listEl.innerHTML = '<div class="empty-hint">Choisis une matière à gauche.</div>';
    return;
  }

  // On récupère les documents AVANT de vider : on vide juste avant de
  // reconstruire, pour que le rendu reste correct même si plusieurs appels se
  // chevauchent (sinon les ajouts asynchrones s'empilent → liste dupliquée).
  const docs = await window.studyide.listDocuments(state.currentCourse);
  listEl.innerHTML = '';

  if (!docs.length)
  {
    listEl.innerHTML = '<div class="empty-hint">Aucun PDF pour cette matière.<br>Clique sur "+ Importer un PDF".</div>';
    return;
  }

  for (const doc of docs)
  {
    const card = document.createElement('div');
    card.className = 'doc-card' + (state.currentDoc?.id === doc.id ? ' selected' : '');
    card.innerHTML = `
      <div class="name">📄 ${escapeHtml(doc.fileName)}</div>
      <div class="meta"><span>${doc.seeded ? 'Fourni avec l\'appli' : 'Importé'}</span><button class="del-ex" title="Supprimer">✕</button></div>`;

    card.onclick = (e) =>
    {
      if (e.target.classList.contains('del-ex')) return;
      openDocument(doc);
    };

    card.querySelector('.del-ex').onclick = async (e) =>
    {
      e.stopPropagation();
      if (!confirm(`Supprimer "${doc.fileName}" (et son fichier) ?`)) return;
      await window.studyide.deleteDocument({ id: doc.id, deleteFile: true });
      if (state.currentDoc?.id === doc.id) { state.currentDoc = null; clearPdfViewport(); }
      renderDocList();
    };

    listEl.appendChild(card);
  }
}

function clearPdfViewport()
{
  el('pdfViewport').innerHTML = '<div class="pdf-empty" id="pdfEmpty">Sélectionne un document PDF à gauche.</div>';
  el('docTabInfo').textContent = 'Aucun document ouvert';
  el('pdfExList').innerHTML = '';
  state.currentPdfExercises = [];
  state.pdfDoc = null;
}

async function openDocument(doc)
{
  state.currentDoc = doc;
  renderDocList();
  el('docTabInfo').textContent = doc.fileName;

  const viewport = el('pdfViewport');
  viewport.innerHTML = '<div class="pdf-empty">⏳ Chargement du PDF…</div>';

  const res = await window.studyide.readPdfBase64(doc.filePath);
  if (!res.ok)
  {
    viewport.innerHTML = `<div class="pdf-empty">Erreur : ${escapeHtml(res.error)}</div>`;
    return;
  }

  state.pdfDoc = await pdfjsLib.getDocument({ data: base64ToUint8Array(res.base64) }).promise;
  await renderAllPages();

  // Détection des exercices : une seule fois par document (le process principal
  // ignore l'appel si des exercices sont déjà enregistrés).
  const pageTexts = await extractAllText();
  await window.studyide.saveDetectedExercises(
  {
    documentId: doc.id,
    courseCode: state.currentCourse,
    exercises: detectExercises(pageTexts)
  });

  state.currentPdfExercises = await window.studyide.listPdfExercises(doc.id);
  renderPdfExerciseList();
  updateIaContextChip();
}

// Redessine toutes les pages du document courant à l'échelle actuelle.
async function renderAllPages()
{
  const viewport = el('pdfViewport');
  viewport.innerHTML = '';
  for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++)
  {
    const page = await state.pdfDoc.getPage(pageNum);
    await renderPdfPage(page, pageNum, viewport);
  }
}

async function renderPdfPage(page, pageNum, viewport)
{
  const vp = page.getViewport({ scale: pdfScale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  canvas.dataset.pageNum = pageNum;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  viewport.appendChild(canvas);

  const tag = document.createElement('div');
  tag.className = 'page-number-tag';
  tag.textContent = `Page ${pageNum}`;
  viewport.appendChild(tag);
}

// Extrait le texte de toutes les pages (pour la détection + la recherche IA).
async function extractAllText()
{
  const texts = [];
  for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++)
  {
    const page = await state.pdfDoc.getPage(pageNum);
    texts.push(await extractPageLines(page));
  }
  return texts;
}

// Reconstruit des « lignes » de texte à partir des items positionnés de pdf.js
// (regroupe les items dont la coordonnée y est proche).
export async function extractPageLines(page)
{
  const content = await page.getTextContent();
  const items = content.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let current = null;
  for (const it of items)
  {
    if (!current || Math.abs(it.y - current.y) > 3)
    {
      current = { y: it.y, parts: [] };
      lines.push(current);
    }
    if (it.str.trim()) current.parts.push(it.str);
  }
  return lines.map((l) => l.parts.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Détecte les « Exercice n°X … » dans le texte et regroupe l'énoncé jusqu'au
// prochain exercice.
function detectExercises(pageTexts)
{
  const marker = /^Exercice\s*n?[o°ᵒ]?\s*(\d+)\s*(.*)$/i;
  const allLines = []; // { text, page }
  pageTexts.forEach((lines, idx) =>
  {
    for (const line of lines) allLines.push({ text: line, page: idx + 1 });
  });

  const found = []; // { number, title, page, lineIndex }
  allLines.forEach((entry, i) =>
  {
    const m = entry.text.match(marker);
    if (m) found.push({ number: m[1], title: (m[2] || '').trim(), page: entry.page, lineIndex: i });
  });

  const exercises = [];
  for (let i = 0; i < found.length; i++)
  {
    const start = found[i].lineIndex + 1;
    const end = i + 1 < found.length ? found[i + 1].lineIndex : allLines.length;
    const statementLines = allLines.slice(start, end).map((l) => l.text);
    exercises.push(
    {
      number: found[i].number,
      title: found[i].title,
      page: found[i].page,
      statement: statementLines.join('\n').slice(0, 4000)
    });
  }
  return exercises;
}

function renderPdfExerciseList()
{
  const listEl = el('pdfExList');
  listEl.innerHTML = '';

  if (!state.currentPdfExercises.length)
  {
    listEl.innerHTML = '<div class="empty-hint">Aucun exercice détecté automatiquement dans ce document.</div>';
    return;
  }

  for (const ex of state.currentPdfExercises)
  {
    const item = document.createElement('div');
    item.className = 'pdf-ex-item';
    item.innerHTML = `
      <div class="num">Exercice n°${escapeHtml(ex.number)} — page ${escapeHtml(ex.page)}</div>
      <div class="title">${escapeHtml(ex.title || '(sans titre)')}</div>
      <div class="meta-row">
        <span class="badge ${ex.status}">${statusLabel(ex.status)}</span>
        <span>${ex.solution ? '✅ solution dispo' : '📝 à compléter'}</span>
      </div>`;
    item.onclick = () => openPdfExerciseModal(ex);
    listEl.appendChild(item);
  }
}

function openPdfExerciseModal(ex)
{
  state.activePdfExId = ex.id;
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

// Ouvre un document à partir de son id (utilisé par la navigation depuis l'IA).
export async function openDocumentById(documentId)
{
  const doc = state.db?.documents?.[documentId];
  if (doc) await openDocument(doc);
}

// Ouvre la modale d'un exercice PDF à partir de son id (après ouverture du doc).
export function openPdfExerciseById(id)
{
  const ex = state.currentPdfExercises.find((e) => e.id === id);
  if (ex) openPdfExerciseModal(ex);
}

export function bindCoursEvents()
{
  el('importPdfBtn').onclick = async () =>
  {
    if (!state.currentCourse) { alert('Choisis d\'abord une matière à gauche.'); return; }
    const doc = await window.studyide.importPdfDialog(state.currentCourse);
    if (doc) { renderDocList(); openDocument(doc); }
  };

  el('zoomInBtn').onclick = () => changeZoom(SCALE_STEP);
  el('zoomOutBtn').onclick = () => changeZoom(-SCALE_STEP);

  el('closePdfExModalBtn').onclick = () =>
  {
    el('pdfExModalOverlay').classList.remove('open');
    state.activePdfExId = null;
    updateIaContextChip();
  };

  el('pdfExStatusSelect').onchange = async (e) =>
  {
    if (!state.activePdfExId) return;
    await window.studyide.updatePdfExerciseStatus({ id: state.activePdfExId, status: e.target.value });
    state.currentPdfExercises = await window.studyide.listPdfExercises(state.currentDoc.id);
    renderPdfExerciseList();
  };

  el('saveNotesBtn').onclick = async () =>
  {
    if (!state.activePdfExId) return;
    await window.studyide.updatePdfExerciseNotes({ id: state.activePdfExId, userNotes: el('pdfExUserNotes').value });
    state.currentPdfExercises = await window.studyide.listPdfExercises(state.currentDoc.id);
    el('pdfExModalOverlay').classList.remove('open');
    renderPdfExerciseList();
  };
}

// Ajuste l'échelle et redessine les pages SANS relire ni re-parser le PDF.
function changeZoom(delta)
{
  pdfScale = Math.min(Math.max(pdfScale + delta, MIN_SCALE), MAX_SCALE);
  el('zoomLabel').textContent = Math.round(pdfScale / BASE_SCALE * 100) + '%';
  if (state.pdfDoc) renderAllPages();
}
