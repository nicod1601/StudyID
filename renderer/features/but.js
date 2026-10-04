/**
 * Calcul de notes BUT : saisie manuelle des notes et coefficients, puis calcul
 * des moyennes (par UE et générale). Aucune connexion au portail universitaire.
 */

import { el, escapeHtml } from '../core/dom.js';

const DEFAULT_PORTAL_URL = 'https://notes-iut.univ-lehavre.fr/';

let butData = null;

// Une note est prise en compte si elle est renseignée et numérique.
function isGraded(resource)
{
  return resource.grade !== null && resource.grade !== undefined && resource.grade !== '' && !isNaN(Number(resource.grade));
}

function computeUeAverage(ue)
{
  const graded = ue.resources.filter(isGraded);
  const totalCoef = graded.reduce((s, r) => s + (Number(r.coef) || 0), 0);
  if (!graded.length || totalCoef === 0) return null;
  const weighted = graded.reduce((s, r) => s + Number(r.grade) * (Number(r.coef) || 0), 0);
  return weighted / totalCoef;
}

function computeOverallAverage(data)
{
  let totalCoef = 0;
  let weighted = 0;
  for (const ue of data.ues)
  {
    for (const r of ue.resources)
    {
      if (!isGraded(r)) continue;
      totalCoef += Number(r.coef) || 0;
      weighted += Number(r.grade) * (Number(r.coef) || 0);
    }
  }
  return totalCoef === 0 ? null : weighted / totalCoef;
}

function fmtAvg(v)
{
  return v === null ? '—' : v.toFixed(2).replace('.', ',');
}

function genId(prefix)
{
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function updateOverallSummary()
{
  const avg = computeOverallAverage(butData);
  el('butOverallSummary').innerHTML = `
    <span class="big">${fmtAvg(avg)}${avg !== null ? ' / 20' : ''}</span>
    <span class="label">Moyenne générale estimée (pondérée par les coefficients renseignés — calcul indicatif, non officiel)</span>`;
}

function updateUeAvgBadge(ueId)
{
  const ue = butData.ues.find((u) => u.id === ueId);
  if (!ue) return;
  const badge = document.getElementById(`ue-avg-${ueId}`);
  if (!badge) return;
  const avg = computeUeAverage(ue);
  badge.textContent = avg === null ? '— /20' : fmtAvg(avg) + ' /20';
  badge.classList.toggle('empty', avg === null);
}

function renderButUeList()
{
  const container = el('butUeList');
  container.innerHTML = '';

  for (const ue of butData.ues)
  {
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
    card.querySelector('.but-del-ue').onclick = () =>
    {
      if (!confirm(`Supprimer l'UE "${ue.name}" et toutes ses ressources ?`)) return;
      butData.ues = butData.ues.filter((u) => u.id !== ue.id);
      renderButUeList();
      updateOverallSummary();
    };
    card.querySelector('.but-add-res-btn').onclick = () =>
    {
      ue.resources.push({ id: genId('r'), name: '', coef: 1, grade: null });
      renderButUeList();
      updateOverallSummary();
    };

    const rowsWrap = card.querySelector('.but-res-rows');
    for (const res of ue.resources) rowsWrap.appendChild(buildResourceRow(ue, res));

    container.appendChild(card);
  }
}

function buildResourceRow(ue, res)
{
  const row = document.createElement('div');
  row.className = 'but-res-row';
  row.innerHTML = `
    <input class="res-name" value="${escapeHtml(res.name)}" placeholder="Nom de la ressource" />
    <input class="res-coef" type="number" min="0" step="1" value="${res.coef ?? ''}" />
    <input class="res-grade" type="number" min="0" max="20" step="0.25" value="${res.grade ?? ''}" placeholder="—" />
    <button class="but-del-res" title="Supprimer">✕</button>`;

  row.querySelector('.res-name').oninput = (e) => { res.name = e.target.value; };
  row.querySelector('.res-coef').oninput = (e) =>
  {
    res.coef = e.target.value === '' ? 0 : Number(e.target.value);
    updateUeAvgBadge(ue.id);
    updateOverallSummary();
  };

  const gradeInput = row.querySelector('.res-grade');
  gradeInput.oninput = (e) =>
  {
    let v = e.target.value;
    if (v !== '' && Number(v) > 20) v = '20';
    if (v !== '' && Number(v) < 0) v = '0';
    e.target.value = v;
    res.grade = v === '' ? null : Number(v);
    paintGrade(gradeInput, res.grade);
    updateUeAvgBadge(ue.id);
    updateOverallSummary();
  };
  if (res.grade !== null && res.grade !== undefined) paintGrade(gradeInput, res.grade);

  row.querySelector('.but-del-res').onclick = () =>
  {
    ue.resources = ue.resources.filter((r) => r.id !== res.id);
    renderButUeList();
    updateOverallSummary();
  };

  return row;
}

// Colore le champ note selon qu'elle est sous ou au-dessus de 10.
function paintGrade(input, grade)
{
  input.classList.toggle('grade-low', grade !== null && grade < 10);
  input.classList.toggle('grade-ok', grade !== null && grade >= 10);
}

async function openButModal()
{
  butData = await window.studyide.getButGrades();
  el('butPortalUrlInput').value = butData.portalUrl || DEFAULT_PORTAL_URL;
  renderButUeList();
  updateOverallSummary();
  el('butModalOverlay').classList.add('open');
}

export function bindButEvents()
{
  el('butCalcBtn').onclick = openButModal;
  el('closeButModalBtn').onclick = () => el('butModalOverlay').classList.remove('open');

  el('openButPortalBtn').onclick = () =>
  {
    window.studyide.openUrl(el('butPortalUrlInput').value.trim() || DEFAULT_PORTAL_URL);
  };

  el('butAddUeBtn').onclick = () =>
  {
    butData.ues.push({ id: genId('ue'), name: 'Nouvelle UE', resources: [{ id: genId('r'), name: '', coef: 1, grade: null }] });
    renderButUeList();
    updateOverallSummary();
  };

  el('butResetBtn').onclick = async () =>
  {
    if (!confirm('Réinitialiser toutes tes notes BUT saisies ? Cette action est irréversible.')) return;
    butData = await window.studyide.resetButGrades();
    el('butPortalUrlInput').value = butData.portalUrl || DEFAULT_PORTAL_URL;
    renderButUeList();
    updateOverallSummary();
  };

  el('saveButGradesBtn').onclick = async (e) =>
  {
    butData.portalUrl = el('butPortalUrlInput').value.trim() || DEFAULT_PORTAL_URL;
    await window.studyide.setButGrades(butData);
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = '✅ Enregistré !';
    setTimeout(() => { btn.textContent = original; }, 1200);
  };
}
