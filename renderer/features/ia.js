/**
 * Assistant IA + moteur de recherche partagé.
 *
 * Ce module contient deux choses :
 *  1. Le MOTEUR DE RECHERCHE sur tout l'espace StudyID (index, classement,
 *     tolérance aux fautes, regroupement, navigation). Il est exporté et réutilisé
 *     par la barre de recherche globale (search.js) ET par le tiroir IA.
 *  2. Le TIROIR IA (hors ligne, via Ollama) : gestion des modèles, chat avec
 *     contexte (résultats de l'index + fichier/document ouvert), bulle flottante.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { simpleMarkdown } from '../core/markdown.js';
import { patchSettings } from '../core/settings-client.js';
import { notifyIaResponseIfBackground } from '../core/notifications.js';
import { base64ToUint8Array, extractPageLines, openDocumentById, openPdfExerciseById } from './pdf.js';
import { insertCodeIntoEditor, statusLabel, loadExerciseIntoEditor, renderExerciseList } from './editor.js';
import { selectCourse } from './courses.js';
import { switchMode } from './nav.js';
import { openNotesDrawer } from './notes.js';

const MAX_RESULTS = 8;

// Mots ignorés dans les recherches (sans accents, car on normalise les termes) :
// articles/liaisons + mots de « commande » fréquents (trouve, fichier, où…) qui
// n'aident pas à identifier un résultat et ajoutent du bruit.
const STOPWORDS = new Set(
  ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'a', 'en', 'dans', 'pour',
   'sur', 'est', 'qu', 'que', 'qui', 'avec', 'ce', 'se', 'son', 'sa', 'ses', 'au', 'aux', 'par',
   'plus', 'comment', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles',
   'moi', 'mon', 'ma', 'mes', 'mis', 'met', 'mettre', 'fichier', 'fichiers', 'trouve', 'trouver',
   'trouves', 'cherche', 'chercher', 'cherches', 'range', 'rangee', 'rangees', 'dernier', 'derniere',
   'fait', 'faire', 'sais', 'savoir', 'rappelle', 'rappeler', 'truc', 'voila', 'suis', 'travaille',
   'travaillait', 'etais', 'arrete', 'arretee', 'nom', 'appelle', 'appelait']);

// Minuscule + suppression des accents, pour des comparaisons robustes.
function normalize(s)
{
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Découpe une chaîne en mots (lettres/chiffres uniquement).
function tokenize(s)
{
  return normalize(s).replace(/[^\p{L}0-9]+/gu, ' ').split(/\s+/).filter(Boolean);
}

// Distance d'édition (Damerau-Levenshtein), plafonnée : tolère les fautes de
// frappe, y compris l'inversion de deux lettres voisines (« tset » → « test »).
function editDistance(a, b)
{
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;

  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++)
  {
    for (let j = 1; j <= n; j++)
    {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
      {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return d[m][n];
}

// Extension de fichier mentionnée dans la requête (ex. « test.java »).
const CODE_EXT_RE = /\.(java|py|js|mjs|cjs|jsx|ts|tsx|html?|css|json|sh|bash|sql|php|rs|go|rb|ya?ml|c|cpp|h|md|txt|xml)\b/i;

// Déduit de la requête les TYPES de résultats pertinents, pour ne pas mélanger
// (un « .java » ne doit pas remonter de PDF, un « document » ne doit pas
// remonter de code). Retourne null si aucune intention claire → on cherche tout.
function detectIntent(query)
{
  const q = normalize(query);
  // Un fichier / une extension / un langage → uniquement des fichiers (jamais de PDF).
  if (CODE_EXT_RE.test(query) || /\b(fichier|code|classe|script|java|python|py)\b/.test(q)) return ['code', 'file'];
  // Un document / PDF / cours → uniquement le PDF lui-même (ni son contenu page par page, ni ses exercices).
  if (/\b(document|documents|pdf|cours|poly|polycopie|diapo|diapos|slide|slides|support)\b/.test(q)) return ['document'];
  // Recherche de contenu / notion → dans le texte des PDF (+ exercices + document).
  if (/\b(contenu|notion|notions|parle|parlait|mentionne|propos|chapitre|definition|explication|explique)\b/.test(q)) return ['docText', 'pdfExercise', 'document'];
  // Un exercice → exercices (code + PDF).
  if (/\b(exercice|exercices|exo|exos|td|tp)\b/.test(q)) return ['pdfExercise', 'code', 'file'];
  if (/\b(note|notes)\b/.test(q)) return ['note'];
  return null;
}

let iaIndexed = false;
let iaCorpus = []; // { type, courseCode, source, page, exerciseNumber?, text }
let localAiStatusCache = { downloaded: false, downloading: false };
let selectedLocalModelId = 'fast';
let iaDrawerOpen = false;
let iaDrawerInitialized = false;
let conversation = []; // historique [{ role:'user'|'assistant', content }] pour le suivi
const MAX_HISTORY = 6;

// =====================================================================
// Indicateurs d'état
// =====================================================================

export function updateIaCourseIndicator()
{
  const label = el('iaCurrentCourse');
  if (!label) return;
  if (state.currentCourse)
  {
    const course = state.db.courses.find((c) => c.code === state.currentCourse);
    label.textContent = `📘 Matière sélectionnée : ${course.code} — ${course.name}`;
  }
  else
  {
    label.textContent = '👈 Choisis une matière dans la liste à gauche';
  }
}

async function initIaMode()
{
  el('iaScopeSelect').value = state.currentCourse ? 'current' : 'all';
  updateIaCourseIndicator();
  await refreshLocalAiStatus();
  await updateIaReadiness();
  await buildSearchIndex();
}

async function refreshLocalAiStatus()
{
  localAiStatusCache = await window.studyide.getLocalAIStatus();
  selectedLocalModelId = localAiStatusCache.modelId || 'fast';
  await renderLocalModelsList();
  await renderModelSelect();
}

// Remplit le menu déroulant « Moteur » (au-dessus de Envoyer) avec les moteurs
// DÉJÀ téléchargés ; en choisir un le rend actif pour les réponses.
async function renderModelSelect()
{
  const select = el('iaModelSelect');
  if (!select) return;

  const models = await window.studyide.listLocalAIModels();
  const downloaded = models.filter((m) => m.downloaded);

  if (!downloaded.length)
  {
    select.innerHTML = '<option value="">Aucun moteur installé — télécharge-en un (⚙)</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = downloaded.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('');
  // Sélectionne le moteur actif (ou le premier téléchargé par défaut).
  select.value = downloaded.some((m) => m.id === selectedLocalModelId) ? selectedLocalModelId : downloaded[0].id;
  selectedLocalModelId = select.value;
}

async function renderLocalModelsList()
{
  const container = el('localModelsList');
  if (!container) return;

  const models = await window.studyide.listLocalAIModels();
  container.innerHTML = '';

  for (const m of models)
  {
    const card = document.createElement('div');
    card.className = 'model-option-card' + (m.id === selectedLocalModelId ? ' selected' : '') + (m.heavy ? ' heavy' : '');
    card.innerHTML = `
      <div class="mo-head">
        <span class="mo-label">${m.id === selectedLocalModelId ? '✅ ' : ''}${escapeHtml(m.label)}</span>
      </div>
      <div class="mo-desc">${escapeHtml(m.description)}</div>
      ${m.warning ? `<div class="mo-warning">${escapeHtml(m.warning)}</div>` : ''}
      <div class="mo-actions">
        ${m.downloaded
          ? `<span class="mo-status">✅ Téléchargé</span><button class="mo-delete-btn" data-id="${m.id}">🗑 Supprimer</button>`
          : m.downloading
            ? '<span class="mo-status">⏳ Téléchargement…</span>'
            : `<button class="mo-download-btn" data-id="${m.id}">⬇ Télécharger</button>`}
      </div>`;

    card.onclick = (e) =>
    {
      if (e.target.closest('button')) return;
      if (!m.downloaded) { el('localAiStatus').textContent = 'Télécharge ce profil avant de le sélectionner.'; return; }
      selectedLocalModelId = m.id;
      renderLocalModelsList();
    };

    const dlBtn = card.querySelector('.mo-download-btn');
    if (dlBtn) dlBtn.onclick = (e) => { e.stopPropagation(); downloadModelProfile(m.id); };

    const delBtn = card.querySelector('.mo-delete-btn');
    if (delBtn) delBtn.onclick = async (e) =>
    {
      e.stopPropagation();
      if (!confirm(`Supprimer le profil "${m.label}" ?`)) return;
      await window.studyide.deleteLocalAI(m.id);
      await renderLocalModelsList();
      await renderModelSelect();
    };

    container.appendChild(card);
  }
}

async function downloadModelProfile(modelId)
{
  el('localAiStatus').textContent = '⏳ Démarrage du téléchargement… (peut prendre plusieurs minutes selon ta connexion)';
  el('localAiProgressWrap').classList.remove('hidden');
  el('localAiProgressFill').style.width = '0%';

  const off = window.studyide.onLocalAIProgress((data) =>
  {
    if (data.percent != null)
    {
      el('localAiProgressFill').style.width = data.percent + '%';
      el('localAiStatus').textContent = `⏳ Téléchargement… ${data.percent}% (${(data.received / 1e6).toFixed(0)} Mo / ${(data.total / 1e6).toFixed(0)} Mo)`;
    }
    else
    {
      el('localAiStatus').textContent = `⏳ Téléchargement… ${(data.received / 1e6).toFixed(0)} Mo`;
    }
  });

  const res = await window.studyide.downloadLocalAI(modelId);
  off();
  el('localAiProgressWrap').classList.add('hidden');

  if (!res.ok)
  {
    el('localAiStatus').textContent = `❌ Échec du téléchargement : ${res.error}`;
  }
  else
  {
    el('localAiStatus').textContent = '✅ Téléchargement terminé !';
    selectedLocalModelId = modelId;
    await patchSettings({ localModelId: modelId }); // devient le moteur actif
  }
  await renderLocalModelsList();
  await renderModelSelect();
  await updateIaReadiness();
}

async function updateIaReadiness()
{
  const dot = el('iaConnDot');
  const label = el('iaConnLabel');
  localAiStatusCache = await window.studyide.getLocalAIStatus();

  if (!localAiStatusCache.ollamaRunning)
  {
    dot.classList.remove('ok');
    label.innerHTML = '⚠️ Ollama non détecté — installe-le sur <a href="#" id="ollamaLink">ollama.com</a> puis laisse-le tourner';
    const link = el('ollamaLink');
    if (link) link.onclick = (e) => { e.preventDefault(); window.studyide.openUrl('https://ollama.com'); };
  }
  else if (localAiStatusCache.downloaded)
  {
    dot.classList.add('ok');
    label.textContent = '🧠 IA locale prête (Ollama) — 100% hors ligne';
  }
  else
  {
    dot.classList.remove('ok');
    label.textContent = 'Ollama détecté — aucun modèle téléchargé (choisis-en un via ⚙)';
  }
}

// =====================================================================
// Indexation + recherche locale
// =====================================================================

async function buildSearchIndex()
{
  const statusEl = el('iaIndexStatus');
  if (statusEl) statusEl.textContent = '⏳ Indexation de ton espace StudyIDE…';

  // Données fraîches (exercices, documents, exercices PDF, matières).
  state.db = await window.studyide.getDB();

  // S'assure que le texte des PDF est extrait et mis en cache (recherche de contenu).
  for (const doc of Object.values(state.db.documents))
  {
    if (doc.pages) continue; // texte déjà en cache : on ne re-parse pas
    try
    {
      const res = await window.studyide.readPdfBase64(doc.filePath);
      if (!res.ok) continue;
      const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(res.base64) }).promise;
      const pages = [];
      for (let p = 1; p <= pdf.numPages; p++)
      {
        const page = await pdf.getPage(p);
        pages.push((await extractPageLines(page)).join('\n'));
      }
      await window.studyide.savePageText({ documentId: doc.id, pages });
    }
    catch (e)
    {
      console.error('Indexation impossible pour', doc.fileName, e);
    }
  }

  // Re-lecture (pour récupérer le texte fraîchement mis en cache) puis index complet.
  state.db = await window.studyide.getDB();
  const [notesRes, files] = await Promise.all(
  [
    window.studyide.listNotes(),
    window.studyide.listWorkspaceFiles()
  ]);
  iaCorpus = buildCorpus(state.db, notesRes.ok ? notesRes.notes : [], files || []);
  iaIndexed = true;

  if (statusEl) statusEl.textContent = `✅ Index prêt : ${iaCorpus.length} éléments (fichiers, exercices, documents, PDF, notes).`;
}

// =====================================================================
// API de recherche réutilisable (barre de recherche globale du haut)
// =====================================================================

// Construit l'index s'il ne l'est pas encore (appelé par la barre globale).
export async function ensureSearchIndex()
{
  if (!iaIndexed) await buildSearchIndex();
}

// Lance une recherche sur tout l'espace et renvoie les résultats groupés.
export function runSearch(query)
{
  return groupResults(localSearch(query, 'all'));
}

// Génère le HTML d'une liste de résultats groupés (réutilisé par le tiroir IA
// et par la barre de recherche globale).
export function groupsToHtml(groups)
{
  if (!groups || !groups.length) return '';
  return '<div class="ia-sources">' + groups.map((g) => `
    <div class="src-group src-group-${g.key || 'other'}">
      <div class="src-title">${escapeHtml(g.title)}</div>
      ${g.items.map((s) => `
        <div class="ia-source-item${s.nav ? ' clickable' : ''}"${s.nav ? ` data-nav="${escapeHtml(JSON.stringify(s.nav))}" title="Cliquer pour y aller"` : ''}>
          <div class="src-name">${escapeHtml(s.name)}</div>
          ${s.meta ? `<div class="src-meta">${escapeHtml(s.meta)}</div>` : ''}
          ${s.excerpt ? `<div class="src-excerpt">${escapeHtml(s.excerpt)}</div>` : ''}
          ${s.path ? `<div class="src-path"><code>${escapeHtml(s.path)}</code><button class="src-open" data-path="${escapeHtml(s.path)}">📂 Ouvrir le dossier</button></div>` : ''}
        </div>`).join('')}
    </div>`).join('') + '</div>';
}

// Câble les clics sur une liste de résultats déjà rendue (navigation + ouvrir).
export function wireResultClicks(containerEl)
{
  containerEl.querySelectorAll('.ia-source-item').forEach((item) =>
  {
    const raw = item.getAttribute('data-nav');
    if (!raw) return;
    try { const nav = JSON.parse(raw); item.onclick = () => goToResult(nav); }
    catch (e) {}
  });
  containerEl.querySelectorAll('.src-open').forEach((b) =>
  {
    b.onclick = (e) => { e.stopPropagation(); window.studyide.openExternal(b.dataset.path); };
  });
}

// Nom de fichier à partir d'un chemin Windows ou Unix.
function baseName(filePath)
{
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

function courseNameOf(db, code)
{
  const course = db.courses.find((c) => c.code === code);
  return course ? course.name : '';
}

// Construit l'index de recherche sur TOUT l'espace StudyIDE : exercices de code,
// documents PDF (+ leur texte), exercices détectés dans les PDF, et notes perso.
// Chaque élément embarque son emplacement (chemin) et son statut pour pouvoir
// répondre « où est-ce rangé ? » et « est-ce que je l'ai fait ? ».
function buildCorpus(db, notes, files)
{
  const chunks = [];
  const knownPaths = new Set(); // chemins déjà couverts (évite les doublons avec les fichiers du disque)

  // Ajoute un élément en pré-calculant ses champs de recherche (nom, matière, corps).
  const add = (chunk) =>
  {
    chunk._nameTokens = tokenize(`${chunk.name || chunk.title || ''} ${baseName(chunk.path)}`);
    chunk._courseLower = normalize(chunk.courseName || '');
    chunk._bodyLower = chunk.text ? normalize(chunk.text) : '';
    chunks.push(chunk);
  };

  // Exercices de code
  for (const ex of Object.values(db.exercises || {}))
  {
    const courseName = courseNameOf(db, ex.courseCode);
    if (ex.filePath) knownPaths.add(ex.filePath);
    add({
      type: 'code', courseCode: ex.courseCode, courseName, exerciseId: ex.id,
      title: ex.name, name: ex.name, path: ex.filePath, status: ex.status,
      text: `${ex.name} ${baseName(ex.filePath)} ${ex.language} ${courseName}`
    });
  }

  // Documents PDF + leur contenu page par page
  for (const doc of Object.values(db.documents || {}))
  {
    const courseName = courseNameOf(db, doc.courseCode);
    if (doc.filePath) knownPaths.add(doc.filePath);
    add({
      type: 'document', courseCode: doc.courseCode, courseName, documentId: doc.id,
      title: doc.fileName, name: doc.fileName, path: doc.filePath,
      text: `${doc.fileName} ${courseName}`
    });

    if (Array.isArray(doc.pages))
    {
      doc.pages.forEach((text, idx) =>
      {
        if (text && text.trim())
        {
          add({
            type: 'docText', courseCode: doc.courseCode, courseName, documentId: doc.id,
            source: doc.fileName, name: doc.fileName, page: idx + 1, path: doc.filePath, text
          });
        }
      });
    }
  }

  // Exercices détectés dans les PDF
  for (const pex of Object.values(db.pdfExercises || {}))
  {
    const courseName = courseNameOf(db, pex.courseCode);
    const doc = db.documents[pex.documentId];
    add({
      type: 'pdfExercise', courseCode: pex.courseCode, courseName,
      documentId: pex.documentId, pdfExerciseId: pex.id,
      title: pex.title || '', name: `exercice ${pex.number} ${pex.title || ''}`,
      source: doc ? doc.fileName : pex.courseCode, page: pex.page,
      exerciseNumber: pex.number, status: pex.status, path: doc ? doc.filePath : null,
      text: `Exercice ${pex.number} ${pex.title || ''} ${pex.statement || ''} ${pex.solution || ''} ${pex.userNotes || ''} ${courseName}`
    });
  }

  // Fichiers réellement présents sur le disque, non déjà indexés ci-dessus
  for (const f of files)
  {
    if (knownPaths.has(f.path)) continue;
    const courseName = courseNameOf(db, f.courseCode);
    add({
      type: 'file', courseCode: f.courseCode, courseName,
      title: f.fileName, name: f.fileName, path: f.path,
      text: `${f.fileName} ${courseName}`
    });
  }

  // Notes perso
  for (const note of notes)
  {
    add({ type: 'note', title: note.header, name: note.header, text: `${note.header} ${note.text}` });
  }

  return chunks;
}

// Intitulé affiché d'un résultat selon son type.
function titleFor(r)
{
  switch (r.type)
  {
    case 'code': return `💻 ${r.title}`;
    case 'file': return `📁 ${r.title}`;
    case 'document': return `📄 ${r.title}`;
    case 'docText': return `📄 ${r.source} (page ${r.page})`;
    case 'pdfExercise': return `📝 Exercice n°${r.exerciseNumber}${r.title ? ' — ' + r.title : ''}`;
    case 'note': return `📌 ${r.title}`;
    default: return r.title || 'Résultat';
  }
}

// Ligne « matière · statut · page » d'un résultat.
function metaFor(r)
{
  const bits = [];
  if (r.courseCode) bits.push(`${r.courseCode}${r.courseName ? ' — ' + r.courseName : ''}`);
  if (r.status) bits.push(statusLabel(r.status));
  if (r.page && r.type === 'pdfExercise') bits.push('page ' + r.page);
  return bits.join(' · ');
}

// Catégorie d'affichage d'un type (plusieurs types peuvent partager un groupe).
const GROUP_OF =
{
  code: 'files', file: 'files',
  document: 'documents',
  pdfExercise: 'pdfExercises',
  docText: 'pdfContent',
  note: 'notes'
};

// Titre + ordre d'affichage de chaque groupe.
const GROUP_META =
{
  files: { order: 1, label: '💻 Fichiers de code' },
  documents: { order: 2, label: '📄 Documents' },
  pdfExercises: { order: 3, label: '📝 Exercices détectés (PDF)' },
  pdfContent: { order: 4, label: '📄 Dans le contenu des PDF' },
  notes: { order: 5, label: '📌 Notes' }
};

// Transforme un résultat en élément affichable (nom, matière, aperçu, chemin)
// + les infos de navigation pour aller à son emplacement dans l'appli.
function resultToSource(r)
{
  return {
    name: titleFor(r),
    meta: metaFor(r),
    // Aperçu : seulement la 1re ligne, et uniquement pour les éléments « contenu ».
    excerpt: ['docText', 'pdfExercise', 'note'].includes(r.type) ? firstLine(r.text) : '',
    path: r.path || null,
    nav:
    {
      type: r.type,
      courseCode: r.courseCode || null,
      exerciseId: r.exerciseId || null,
      documentId: r.documentId || null,
      pdfExerciseId: r.pdfExerciseId || null,
      path: r.path || null
    }
  };
}

// Emmène l'utilisateur à l'emplacement d'un résultat, dans le bon onglet.
async function goToResult(nav)
{
  if (!nav) return;
  // On NE ferme PAS le tiroir : on navigue en gardant l'assistant ouvert, pour
  // pouvoir enchaîner les résultats.

  if (nav.type === 'code')
  {
    selectCourse(nav.courseCode);
    switchMode('code');
    const ex = state.db.exercises[nav.exerciseId];
    if (ex) { state.currentExercise = ex; renderExerciseList(); loadExerciseIntoEditor(ex); }
    return;
  }

  if (nav.type === 'document' || nav.type === 'docText' || nav.type === 'pdfExercise')
  {
    selectCourse(nav.courseCode);
    switchMode('cours');
    if (nav.documentId) await openDocumentById(nav.documentId);
    if (nav.type === 'pdfExercise' && nav.pdfExerciseId) openPdfExerciseById(nav.pdfExerciseId);
    return;
  }

  if (nav.type === 'note') { openNotesDrawer(); return; }

  // Fichier non suivi dans l'appli : on le révèle dans l'explorateur.
  if (nav.path) window.studyide.openExternal(nav.path);
}

// Regroupe les résultats par catégorie, puis trie par matière à l'intérieur,
// pour une réponse organisée et lisible (plus de mélange code / PDF / notes).
function groupResults(results)
{
  const byGroup = new Map();
  for (const r of results)
  {
    const key = GROUP_OF[r.type] || 'notes';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }

  return [...byGroup.entries()]
    .sort((a, b) => (GROUP_META[a[0]]?.order || 99) - (GROUP_META[b[0]]?.order || 99))
    .map(([key, items]) => (
    {
      key,
      title: GROUP_META[key]?.label || key,
      items: items
        .sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''))
        .map(resultToSource)
    }));
}

// Compte les occurrences de `needle` dans `haystack` sans allouer de tableau.
function countOccurrences(haystack, needle)
{
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1)
  {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// Recherche locale dans l'index.
function localSearch(query, scope)
{
  const terms = tokenize(query).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (!terms.length) return [];

  let pool = scope === 'current' && state.currentCourse
    ? iaCorpus.filter((c) => c.courseCode === state.currentCourse)
    : iaCorpus;

  // Filtre par type selon l'intention (ex. « .java » → pas de PDF). On ne filtre
  // que si ça laisse au moins un résultat, pour ne jamais renvoyer vide à tort.
  const allowed = detectIntent(query);
  if (allowed)
  {
    const filtered = pool.filter((c) => allowed.includes(c.type));
    if (filtered.length) pool = filtered;
  }

  const scored = pool
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.chunk);
}

// Score d'un élément : le NOM (fichier / exercice) pèse beaucoup plus que le
// contenu ; le contenu est plafonné pour éviter que les longs PDF ne dominent ;
// les fautes de frappe sont tolérées (distance d'édition).
function scoreChunk(chunk, terms)
{
  let score = 0;
  for (const t of terms)
  {
    let nameHit = 0;
    for (const tok of chunk._nameTokens)
    {
      if (tok === t) nameHit = Math.max(nameHit, 12);                       // nom exact
      else if (tok.includes(t) || t.includes(tok)) nameHit = Math.max(nameHit, 7); // préfixe/sous-chaîne
      else if (editDistance(tok, t) <= (t.length <= 4 ? 1 : 2)) nameHit = Math.max(nameHit, 5); // faute de frappe
    }
    score += nameHit;

    if (chunk._courseLower && chunk._courseLower.includes(t)) score += 4;   // nom de matière

    if (chunk._bodyLower)                                                   // contenu, plafonné
    {
      const c = countOccurrences(chunk._bodyLower, t);
      if (c) score += Math.min(c, 3);
    }
  }
  return score;
}

// Première ligne non vide d'un texte (aperçu court, pour ne pas noyer la liste).
function firstLine(text, maxLen = 120)
{
  const line = (text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return line.length > maxLen ? line.slice(0, maxLen) + '…' : line;
}

// =====================================================================
// Envoi d'une question + réponses
// =====================================================================

async function handleIaSend()
{
  const input = el('iaInput');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  input.style.height = 'auto';
  appendUserMessage(question);

  const scope = el('iaScopeSelect').value;
  if (!iaIndexed) await buildSearchIndex();
  localAiStatusCache = await window.studyide.getLocalAIStatus();
  await updateIaReadiness();

  // Ollama pas lancé → on explique comment l'installer.
  if (!localAiStatusCache.ollamaRunning)
  {
    appendAssistantMessage({
      modeLabel: '⚠️ Ollama non détecté',
      bodyHtml: 'L\'IA locale fonctionne avec <strong>Ollama</strong> : installe-le sur <a href="#" class="open-web-source" data-url="https://ollama.com">ollama.com</a>, laisse-le tourner, puis télécharge un modèle via « ⚙ Options ».'
    });
    el('iaOptionsPanel').classList.remove('hidden');
    return;
  }

  // Ollama est là mais aucun modèle téléchargé.
  if (!localAiStatusCache.downloaded)
  {
    appendAssistantMessage({
      modeLabel: '🧠 Aucun modèle téléchargé',
      bodyHtml: 'Ouvre « ⚙ Options → ⬇ Télécharger / gérer les moteurs d\'IA », choisis-en un (Rapide, Équilibré ou Expert Code), puis repose ta question.'
    });
    el('iaOptionsPanel').classList.remove('hidden');
    return;
  }

  const results = localSearch(question, scope);
  const activeContext = el('iaUseContextCheckbox').checked ? getActiveContext() : null;
  await answerLocal(question, results, activeContext);
}

// Règles strictes imposées au modèle : il ne répond QUE depuis les données
// StudyID fournies, et ne propose jamais de commandes / outils système.
const IA_SYSTEM_PROMPT =
  'Tu es l\'assistant intégré à StudyID, une application d\'étudiant en BUT Informatique. Tu réponds uniquement en français.\n' +
  'RÈGLES STRICTES, à respecter absolument :\n' +
  '- Tu réponds UNIQUEMENT à partir des extraits de données StudyID fournis dans le message (cours, exercices, PDF, notes).\n' +
  '- Tu n\'as AUCUN accès à l\'ordinateur, au terminal, aux fichiers, à Internet, ni à des outils (pip, git, ssh, cron, cd, bibliothèques système…). Ne propose JAMAIS de commandes ni d\'outils externes, n\'invente jamais de chemins ou de noms de fichiers.\n' +
  '- Si l\'information n\'est pas dans les extraits fournis, dis-le franchement en une phrase (« Je ne trouve pas ça dans tes données StudyID ») et conseille d\'utiliser la barre de recherche 🔎 en haut pour retrouver un fichier. Ne comble pas les trous en inventant.\n' +
  '- Tu peux expliquer un cours, résumer un extrait, écrire/corriger du code Java ou Python. Sois clair et concis ; mets le code dans des blocs ```.';

async function answerLocal(question, results, activeContext)
{
  appendAssistantMessage({ modeLabel: '⏳ IA locale — génération en cours (peut prendre 10-40s)…', bodyHtml: 'Réflexion…' });
  const thinkingMsg = el('iaMessages').lastElementChild;

  const contextBlock = results.length
    ? results.map((r, i) => `[Source ${i + 1} — ${titleFor(r)}${metaFor(r) ? ' · ' + metaFor(r) : ''}${r.path ? ' — ' + r.path : ''}]\n${(r.text || '').slice(0, 1500)}`).join('\n\n')
    : '(aucun extrait pertinent trouvé dans les données StudyID)';
  const activeBlock = activeContext
    ? `\n\n--- Ce que j'ai actuellement ouvert dans l'appli ---\n${activeContext.text}\n--- Fin ---`
    : '';

  const prompt =
    `--- Extraits de mes données StudyID ---\n${contextBlock}\n--- Fin des extraits ---${activeBlock}\n\n` +
    `Question : ${question}`;

  const history = conversation.slice(-MAX_HISTORY);
  const res = await window.studyide.askLocalAI({ system: IA_SYSTEM_PROMPT, prompt, history });
  thinkingMsg.remove();

  if (!res.ok)
  {
    appendAssistantMessage({ modeLabel: '⚠️ Erreur IA locale', bodyHtml: escapeHtml(res.error) });
    return;
  }

  // Mémorise l'échange (question + réponse brutes) pour les questions de suivi.
  conversation.push({ role: 'user', content: question });
  conversation.push({ role: 'assistant', content: res.text });
  if (conversation.length > MAX_HISTORY * 2) conversation = conversation.slice(-MAX_HISTORY * 2);

  const groups = groupResults(results);
  if (activeContext) groups.unshift({ key: 'context', title: '🔗 Contexte utilisé', items: [{ name: activeContext.label }] });

  appendAssistantMessage({
    modeLabel: '🧠 IA locale (Ollama) — 100% hors ligne',
    bodyHtml: simpleMarkdown(res.text),
    groups
  });
}

// =====================================================================
// Affichage des messages
// =====================================================================

function appendUserMessage(text)
{
  const wrap = document.createElement('div');
  wrap.className = 'ia-msg user';
  wrap.innerHTML = `<div class="ia-bubble">${escapeHtml(text)}</div>`;
  el('iaMessages').appendChild(wrap);
  el('iaMessages').scrollTop = el('iaMessages').scrollHeight;
}

function appendAssistantMessage({ modeLabel, bodyHtml, sources, groups })
{
  const wrap = document.createElement('div');
  wrap.className = 'ia-msg assistant';

  // On affiche des groupes ; une liste plate `sources` est traitée comme un seul groupe.
  const allGroups = groups || (sources && sources.length ? [{ title: 'Sources', items: sources }] : null);

  const html = `<div class="ia-badge-mode">${modeLabel}</div><div class="ia-bubble">${bodyHtml}</div>` + groupsToHtml(allGroups);
  wrap.innerHTML = html;

  // Clics sur les résultats (navigation + ouvrir le dossier).
  wireResultClicks(wrap);

  // Liens externes éventuels dans le corps du message (ex. ollama.com).
  wrap.querySelectorAll('.open-web-source').forEach((a) =>
  {
    a.onclick = (e) => { e.preventDefault(); window.studyide.openUrl(a.dataset.url); };
  });

  // Bouton « Insérer dans l'éditeur » sous chaque bloc de code de la réponse.
  wrap.querySelectorAll('.ia-bubble pre code').forEach((codeEl) =>
  {
    const btn = document.createElement('button');
    btn.className = 'ia-insert-code-btn';
    btn.textContent = state.currentExercise ? '📥 Insérer dans l\'éditeur' : '📥 Insérer (ouvre un exercice de code d\'abord)';
    btn.onclick = () => insertCodeIntoEditor(codeEl.textContent);
    codeEl.parentElement.insertAdjacentElement('afterend', btn);
  });

  el('iaMessages').appendChild(wrap);
  el('iaMessages').scrollTop = el('iaMessages').scrollHeight;
  notifyIaResponseIfBackground(modeLabel, wrap.querySelector('.ia-bubble').textContent);
}

// =====================================================================
// Contexte actif (fichier / exercice ouvert)
// =====================================================================

function getActiveContext()
{
  // Priorité : exercice PDF précis > document PDF ouvert > exercice de code ouvert.
  if (state.activePdfExId)
  {
    const ex = state.currentPdfExercises.find((e) => e.id === state.activePdfExId);
    if (ex)
    {
      const parts = [`Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''} (${state.currentDoc?.fileName || ''})`];
      if (ex.statement) parts.push('Énoncé : ' + ex.statement.slice(0, 1500));
      if (ex.solution) parts.push('Solution connue : ' + ex.solution.slice(0, 1500));
      return { label: `📄 Exercice n°${ex.number}${ex.title ? ' — ' + ex.title : ''}`, text: parts.join('\n') };
    }
  }

  if (state.currentMode === 'cours' && state.currentDoc)
  {
    // On fournit le CONTENU extrait du document (pas juste son nom), pour que
    // l'IA puisse réellement le résumer / répondre dessus.
    const doc = state.db.documents?.[state.currentDoc.id] || state.currentDoc;
    const full = Array.isArray(doc.pages) ? doc.pages.join('\n').trim() : '';
    const text = full
      ? `Document actuellement ouvert : ${doc.fileName}\nContenu du document :\n${full.slice(0, 8000)}`
      : `Document actuellement ouvert : ${doc.fileName} (son texte n'a pas encore pu être extrait).`;
    return { label: `📄 Document ouvert : ${doc.fileName}`, text };
  }

  if (state.currentExercise && state.cm)
  {
    const code = state.cm.getValue();
    return {
      label: `💻 Code ouvert : ${state.currentExercise.name} (${state.currentExercise.language})`,
      text: `Fichier actuellement ouvert dans l'éditeur (${state.currentExercise.language}), nommé ${state.currentExercise.name} :\n\`\`\`${state.currentExercise.language}\n${code.slice(0, 3000)}\n\`\`\``
    };
  }

  return null;
}

export function updateIaContextChip()
{
  const chip = el('iaContextChip');
  if (!chip) return;
  const ctx = getActiveContext();
  if (ctx)
  {
    chip.textContent = ctx.label;
    chip.classList.remove('hidden');
  }
  else
  {
    chip.classList.add('hidden');
  }
}

// =====================================================================
// Bulle flottante + tiroir
// =====================================================================

function openIaDrawer()
{
  iaDrawerOpen = true;
  el('iaDrawer').classList.add('open');
  // Pas d'overlay bloquant : le tiroir est non-modal, on garde la gauche cliquable.
  el('iaBubbleBtn').classList.add('active');
  updateIaContextChip();

  if (!iaDrawerInitialized)
  {
    iaDrawerInitialized = true;
    initIaMode();
  }
  else
  {
    // Ré-indexe à chaque réouverture pour refléter les fichiers/exercices créés
    // depuis la dernière fois (rapide : le texte des PDF est déjà en cache).
    updateIaReadiness();
    buildSearchIndex();
  }
}

export function closeIaDrawer()
{
  iaDrawerOpen = false;
  el('iaDrawer').classList.remove('open');
  el('iaDrawerOverlay').classList.remove('open');
  el('iaBubbleBtn').classList.remove('active');
}

export function bindIaEvents()
{
  el('iaSendBtn').onclick = handleIaSend;

  // Liens externes statiques (ex. ollama.com dans l'accueil / la modale).
  document.querySelectorAll('.open-ext-link').forEach((a) =>
  {
    a.onclick = (e) => { e.preventDefault(); window.studyide.openUrl(a.dataset.url); };
  });

  el('iaInput').addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIaSend(); }
  });
  el('iaInput').addEventListener('input', () =>
  {
    const ta = el('iaInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
  });

  // Choix du moteur d'IA actif (menu déroulant au-dessus de « Envoyer »).
  el('iaModelSelect').onchange = (e) =>
  {
    if (!e.target.value) return;
    selectedLocalModelId = e.target.value;
    patchSettings({ localModelId: selectedLocalModelId });
  };

  el('iaSettingsBtn').onclick = async () =>
  {
    await refreshLocalAiStatus();
    el('iaSettingsOverlay').classList.add('open');
  };
  el('cancelIaSettingsBtn').onclick = () => el('iaSettingsOverlay').classList.remove('open');
  el('saveIaSettingsBtn').onclick = async () =>
  {
    await patchSettings({ localModelId: selectedLocalModelId });
    el('iaSettingsOverlay').classList.remove('open');
    updateIaReadiness();
    refreshLocalAiStatus();
  };
}

export function bindIaBubbleEvents()
{
  el('iaBubbleBtn').onclick = () => { iaDrawerOpen ? closeIaDrawer() : openIaDrawer(); };
  el('iaCloseDrawerBtn').onclick = closeIaDrawer;
  // Tiroir non-modal : fermeture seulement via la croix ou le bouton flottant
  // (pas de fermeture quand on clique ailleurs dans l'appli).
  el('iaToggleOptionsBtn').onclick = () => el('iaOptionsPanel').classList.toggle('hidden');
}
