// Mode IA : modèles locaux (statut, téléchargement).

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
async function updateIaReadiness() {
  const dot = el('iaConnDot');
  const label = el('iaConnLabel');
  localAiStatusCache = await window.studyide.getLocalAIStatus();
  if (localAiStatusCache.downloaded) {
    dot.classList.add('ok');
    label.textContent = '🧠 Mini IA locale prête — 100% hors ligne';
  } else {
    dot.classList.remove('ok');
    label.textContent = 'Aucun profil téléchargé — recherche locale uniquement (⚙ Réglages)';
  }
}
