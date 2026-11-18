// Calcul de notes BUT.

// =====================================================================
// CALCUL DE NOTES BUT : saisie manuelle + simulation (aucune connexion
// automatique au portail universitaire — sécurité du compte ENT)
// =====================================================================

let butData = null;
const DEFAULT_PORTAL_URL = 'https://notes-iut.univ-lehavre.fr/';
function computeUeAverage(ue) {
  const graded = ue.resources.filter((r) => r.grade !== null && r.grade !== undefined && r.grade !== '' && !isNaN(Number(r.grade)));
  const totalCoef = graded.reduce((s, r) => s + (Number(r.coef) || 0), 0);
  if (!graded.length || totalCoef === 0) return null;
  const weighted = graded.reduce((s, r) => s + Number(r.grade) * (Number(r.coef) || 0), 0);
  return weighted / totalCoef;
}
function computeOverallAverage(data) {
  let totalCoef = 0;
  let weighted = 0;
  for (const ue of data.ues) {
    for (const r of ue.resources) {
      if (r.grade !== null && r.grade !== undefined && r.grade !== '' && !isNaN(Number(r.grade))) {
        totalCoef += Number(r.coef) || 0;
        weighted += Number(r.grade) * (Number(r.coef) || 0);
      }
    }
  }
  if (totalCoef === 0) return null;
  return weighted / totalCoef;
}
function fmtAvg(v) {
  return v === null ? '—' : v.toFixed(2).replace('.', ',');
}
function updateOverallSummary() {
  const avg = computeOverallAverage(butData);
  el('butOverallSummary').innerHTML = `
    <span class="big">${fmtAvg(avg)}${avg !== null ? ' / 20' : ''}</span>
    <span class="label">Moyenne générale estimée (pondérée par les coefficients renseignés — calcul indicatif, non officiel)</span>`;
}
function updateUeAvgBadge(ueId) {
  const ue = butData.ues.find((u) => u.id === ueId);
  if (!ue) return;
  const badge = document.getElementById(`ue-avg-${ueId}`);
  if (!badge) return;
  const avg = computeUeAverage(ue);
  badge.textContent = avg === null ? '— /20' : fmtAvg(avg) + ' /20';
  badge.classList.toggle('empty', avg === null);
}
function genId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function renderButUeList() {
  const container = el('butUeList');
  container.innerHTML = '';
  for (const ue of butData.ues) {
    const card = document.createElement('div');
    card.className = 'but-ue-card';
    const avg = computeUeAverage(ue);
    card.innerHTML = `
      <div class="but-ue-header">
        <input class="ue-name" value="${escapeHtml(ue.name)}" placeholder="Nom de l'UE" />
        <span class="but-ue-avg${avg === null ? ' empty' : ''}" id="ue-avg-${ue.id}">${avg === null ? '— /20' : fmtAvg(avg) + ' /20'}</span>
        <button class="but-del-ue" title="Supprimer cette UE">🗑</button>
      </div>
      <div class="but-res-legend"><span>Ressource / SAé</span><span>Coef</span><span>Note /20</span><span></span></div>
      <div class="but-res-rows"></div>
      <button class="but-add-res-btn">+ Ajouter une ressource</button>`;

    card.querySelector('.ue-name').oninput = (e) => { ue.name = e.target.value; };
    card.querySelector('.but-del-ue').onclick = () => {
      if (!confirm(`Supprimer l'UE "${ue.name}" et toutes ses ressources ?`)) return;
      butData.ues = butData.ues.filter((u) => u.id !== ue.id);
      renderButUeList();
      updateOverallSummary();
    };
    card.querySelector('.but-add-res-btn').onclick = () => {
      ue.resources.push({ id: genId('r'), name: '', coef: 1, grade: null });
      renderButUeList();
      updateOverallSummary();
    };

    const rowsWrap = card.querySelector('.but-res-rows');
    for (const res of ue.resources) {
      const row = document.createElement('div');
      row.className = 'but-res-row';
      row.innerHTML = `
        <input class="res-name" value="${escapeHtml(res.name)}" placeholder="Nom de la ressource" />
        <input class="res-coef" type="number" min="0" step="1" value="${res.coef ?? ''}" />
        <input class="res-grade" type="number" min="0" max="20" step="0.25" value="${res.grade ?? ''}" placeholder="—" />
        <button class="but-del-res" title="Supprimer">✕</button>`;

      row.querySelector('.res-name').oninput = (e) => { res.name = e.target.value; };
      row.querySelector('.res-coef').oninput = (e) => {
        res.coef = e.target.value === '' ? 0 : Number(e.target.value);
        updateUeAvgBadge(ue.id);
        updateOverallSummary();
      };
      const gradeInput = row.querySelector('.res-grade');
      gradeInput.oninput = (e) => {
        let v = e.target.value;
        if (v !== '' && Number(v) > 20) v = '20';
        if (v !== '' && Number(v) < 0) v = '0';
        e.target.value = v;
        res.grade = v === '' ? null : Number(v);
        gradeInput.classList.toggle('grade-low', res.grade !== null && res.grade < 10);
        gradeInput.classList.toggle('grade-ok', res.grade !== null && res.grade >= 10);
        updateUeAvgBadge(ue.id);
        updateOverallSummary();
      };
      if (res.grade !== null && res.grade !== undefined) {
        gradeInput.classList.toggle('grade-low', res.grade < 10);
        gradeInput.classList.toggle('grade-ok', res.grade >= 10);
      }
      row.querySelector('.but-del-res').onclick = () => {
        ue.resources = ue.resources.filter((r) => r.id !== res.id);
        renderButUeList();
        updateOverallSummary();
      };
      rowsWrap.appendChild(row);
    }
    container.appendChild(card);
  }
}
async function openButModal() {
  butData = await window.studyide.getButGrades();
  el('butPortalUrlInput').value = butData.portalUrl || DEFAULT_PORTAL_URL;
  renderButUeList();
  updateOverallSummary();
  el('butModalOverlay').classList.add('open');
}
function bindButEvents() {
  el('viewNotesQuickBtn').onclick = openNotesDrawer;
  el('butCalcBtn').onclick = openButModal;
  el('closeButModalBtn').onclick = () => el('butModalOverlay').classList.remove('open');
  el('openButPortalBtn').onclick = () => {
    const url = el('butPortalUrlInput').value.trim() || DEFAULT_PORTAL_URL;
    window.studyide.openUrl(url);
  };
  el('butAddUeBtn').onclick = () => {
    butData.ues.push({ id: genId('ue'), name: 'Nouvelle UE', resources: [{ id: genId('r'), name: '', coef: 1, grade: null }] });
    renderButUeList();
    updateOverallSummary();
  };
  el('butResetBtn').onclick = async () => {
    if (!confirm('Réinitialiser toutes tes notes BUT saisies ? Cette action est irréversible.')) return;
    butData = await window.studyide.resetButGrades();
    el('butPortalUrlInput').value = butData.portalUrl || DEFAULT_PORTAL_URL;
    renderButUeList();
    updateOverallSummary();
  };
  el('saveButGradesBtn').onclick = async (e) => {
    butData.portalUrl = el('butPortalUrlInput').value.trim() || DEFAULT_PORTAL_URL;
    await window.studyide.setButGrades(butData);
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = '✅ Enregistré !';
    setTimeout(() => { btn.textContent = original; }, 1200);
  };
}
