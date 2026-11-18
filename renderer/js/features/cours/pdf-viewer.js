// Mode Cours : affichage des PDF (pages rendues à la demande).

// Ouvre un PDF (et défile jusqu'à la page demandée) depuis n'importe où
async function openDocumentAt(doc, page) {
  if (currentMode !== 'cours') switchMode('cours');
  if (currentCourse !== doc.courseCode) await selectCourse(doc.courseCode);
  if (!(currentDoc && currentDoc.id === doc.id && pdfDoc)) await openDocument(doc);
  if (page > 1) {
    const target = el('pdfViewport').querySelector(`.pdf-page[data-page-num="${page}"]`);
    if (target) el('pdfViewport').scrollTop = Math.max(0, target.offsetTop - 12);
  }
}
function clearPdfViewport() {
  pdfSession++;
  teardownPdfViewer();
  if (pdfDoc) { pdfDoc.destroy().catch(() => {}); pdfDoc = null; }
  el('pdfViewport').innerHTML = '<div class="pdf-empty" id="pdfEmpty">Sélectionne un document PDF à gauche.</div>';
  el('docTabInfo').textContent = 'Aucun document ouvert';
  el('pdfExList').innerHTML = '';
  currentPdfExercises = [];
}
// --- Visionneuse PDF ---
// Avant : toutes les pages étaient dessinées l'une après l'autre (un PDF de 100 pages
// = plusieurs secondes de blocage + des centaines de Mo) et le zoom rechargeait tout.
// Maintenant : des emplacements vides à la bonne taille, et seules les pages proches de
// l'écran sont dessinées (les autres sont libérées). Le zoom réutilise le document chargé.
let pdfSession = 0;        // change à chaque ouverture/fermeture de document
let pdfLayoutId = 0;       // change à chaque (re)mise en page (zoom)
let pdfObserver = null;
const nextIdle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 250 }) : setTimeout(r, 0)));
function teardownPdfViewer() {
  if (pdfObserver) { pdfObserver.disconnect(); pdfObserver = null; }
}
async function openDocument(doc) {
  const session = ++pdfSession;
  currentDoc = doc;
  el('docList').querySelectorAll('.doc-card').forEach((c) => c.classList.toggle('selected', c.dataset.id === doc.id));
  el('docTabInfo').textContent = doc.fileName;
  const viewport = el('pdfViewport');
  viewport.innerHTML = '<div class="pdf-empty">⏳ Chargement du PDF…</div>';
  teardownPdfViewer();
  if (pdfDoc) { pdfDoc.destroy().catch(() => {}); pdfDoc = null; }

  try {
    const [res] = await Promise.all([window.studyide.readPdf(doc.filePath), window.Lazy.pdf()]);
    if (session !== pdfSession) return;
    if (!res.ok) { viewport.innerHTML = `<div class="pdf-empty">Erreur : ${escapeHtml(res.error)}</div>`; return; }
    const loaded = await pdfjsLib.getDocument({ data: res.data }).promise;
    if (session !== pdfSession) { loaded.destroy().catch(() => {}); return; }
    pdfDoc = loaded;
  } catch (e) {
    if (session === pdfSession) viewport.innerHTML = `<div class="pdf-empty">Erreur : ${escapeHtml(e.message || String(e))}</div>`;
    return;
  }

  await layoutPdfPages(session, false);
  loadPdfExercises(doc, pdfDoc, session); // en arrière-plan : n'empêche pas de lire le PDF
}
async function layoutPdfPages(session, keepScroll) {
  const layout = ++pdfLayoutId;
  const viewport = el('pdfViewport');
  const ratio = keepScroll && viewport.scrollHeight > 0 ? viewport.scrollTop / viewport.scrollHeight : 0;
  teardownPdfViewer();

  const first = await pdfDoc.getPage(1);
  if (session !== pdfSession || layout !== pdfLayoutId) return;
  const vp0 = first.getViewport({ scale: pdfScale });

  viewport.innerHTML = '';
  const frag = document.createDocumentFragment();
  const wraps = [];
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.dataset.pageNum = n;
    wrap.style.width = Math.floor(vp0.width) + 'px';
    wrap.style.height = Math.floor(vp0.height) + 'px';
    const tag = document.createElement('div');
    tag.className = 'page-number-tag';
    tag.textContent = `Page ${n}`;
    wrap.appendChild(tag);
    frag.appendChild(wrap);
    wraps.push(wrap);
  }
  viewport.appendChild(frag);
  if (ratio) viewport.scrollTop = ratio * viewport.scrollHeight;

  pdfObserver = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const wrap = en.target;
      wrap.dataset.visible = en.isIntersecting ? '1' : '0';
      if (en.isIntersecting) renderPdfPageInto(wrap, session, layout);
      else releasePdfPage(wrap);
    }
  }, { root: viewport, rootMargin: '900px 0px' });
  wraps.forEach((w) => pdfObserver.observe(w));
}
async function renderPdfPageInto(wrap, session, layout) {
  if (wrap.dataset.state === 'done' || wrap.dataset.state === 'busy') return;
  wrap.dataset.state = 'busy';
  try {
    const page = await pdfDoc.getPage(Number(wrap.dataset.pageNum));
    if (session !== pdfSession || layout !== pdfLayoutId) return;
    const vp = page.getViewport({ scale: pdfScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (session !== pdfSession || layout !== pdfLayoutId || !wrap.isConnected || wrap.dataset.visible === '0') {
      canvas.width = 0; // sorti de l'écran pendant le rendu : on jette
      wrap.dataset.state = '';
      return;
    }
    wrap.style.width = canvas.width + 'px';
    wrap.style.height = canvas.height + 'px';
    wrap.insertBefore(canvas, wrap.firstChild);
    wrap.dataset.state = 'done';
    page.cleanup();
  } catch (e) {
    wrap.dataset.state = '';
    if (!/cancel|destroy/i.test(String(e && e.message))) console.error('Rendu PDF :', e);
  }
}
function releasePdfPage(wrap) {
  if (wrap.dataset.state !== 'done') return;
  const canvas = wrap.querySelector('canvas');
  if (canvas) { canvas.width = 0; canvas.height = 0; canvas.remove(); } // libère la mémoire du bitmap
  wrap.dataset.state = '';
}
let relayoutTimer = null;
function relayoutPdf() {
  if (!currentDoc || !pdfDoc) return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => layoutPdfPages(pdfSession, true), 120); // plusieurs clics sur +/− = une seule mise en page
}
