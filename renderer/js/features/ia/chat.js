// Mode IA : conversation (envoi, réponses, messages).

async function handleIaSend() {
  const input = el('iaInput');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  input.style.height = 'auto';
  appendUserMessage(question);

  const scope = el('iaScopeSelect').value;
  if (!iaIndexed) await buildSearchIndex();
  await updateIaReadiness();
  localAiStatusCache = await window.studyide.getLocalAIStatus();

  const results = localSearch(question, scope);
  const engine = el('iaEngineSelect').value;
  const activeContext = el('iaUseContextCheckbox').checked ? getActiveContext() : null;

  if (engine === 'search') {
    answerOffline(question, results);
    return;
  }
  if (engine === 'local') {
    if (localAiStatusCache.downloaded) await answerLocal(question, results, activeContext);
    else { appendAssistantMessage({ modeLabel: '⚠️ Mini IA locale non installée', bodyHtml: 'Télécharge-la dans "⚙ Réglages". En attendant, voici la recherche locale :' }); answerOffline(question, results); }
    return;
  }
  // auto : mini IA locale si disponible, sinon recherche seule
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
  notifyIaResponseIfBackground(modeLabel, wrap.querySelector('.ia-bubble').textContent);
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
    bodyHtml: `Voici les passages de tes documents qui correspondent le mieux à ta question. Télécharge un profil de mini IA locale dans Réglages pour obtenir une réponse rédigée.`,
    sources
  });
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

  

  el('iaSettingsBtn').onclick = async () => {
    await refreshLocalAiStatus();
    el('iaSettingsOverlay').classList.add('open');
  };
  el('cancelIaSettingsBtn').onclick = () => el('iaSettingsOverlay').classList.remove('open');
  el('saveIaSettingsBtn').onclick = async () => {
    const prev = await window.studyide.getSettings();
    await window.studyide.setSettings({
      ...prev,
      localModelId: selectedLocalModelId
    });
    el('iaSettingsOverlay').classList.remove('open');
    updateIaReadiness();
    refreshLocalAiStatus();
  };
}
