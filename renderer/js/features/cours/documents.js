// Mode Cours : liste des documents PDF d'une matière.

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
    card.dataset.id = doc.id;
    card.innerHTML = `
      <div class="name">📄 ${escapeHtml(doc.fileName)}</div>
      <div class="meta"><span>${doc.seeded ? 'Fourni avec l\'appli' : 'Importé'}</span><button class="del-ex" title="Supprimer">✕</button></div>`;
    card.onclick = (e) => {
      if (e.target.classList.contains('del-ex')) return;
      openDocument(doc);
    };
    card.querySelector('.del-ex').onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${doc.fileName}" (et son fichier) ?`)) {
        await window.studyide.deleteDocument({ id: doc.id, deleteFile: true });
        window.SearchBar?.invalidate();
        if (currentDoc?.id === doc.id) { currentDoc = null; clearPdfViewport(); }
        renderDocList();
      }
    };
    listEl.appendChild(card);
  }
}
