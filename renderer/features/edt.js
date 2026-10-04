/**
 * Emploi du temps : planning importé (.ics), mis en cache localement, avec
 * détection du cours en cours et notifications de début / fin de cours.
 *
 * La boucle de rappels ne démarre QUE s'il existe un planning importé : inutile
 * de faire tourner un timer en permanence quand il n'y a rien à surveiller.
 */

import { el, escapeHtml } from '../core/dom.js';
import { state } from '../core/state.js';
import { askText } from '../core/ask.js';
import { getSettings, patchSettings } from '../core/settings-client.js';
import { fireEdtNotification } from '../core/notifications.js';

const CHECK_INTERVAL_MS = 20000;

let edtCache = null;               // { importedAt, sourceFileName, events, holidays }
let edtRemindersEnabled = true;
let edtReminderMinutesBefore = 15;
let edtNotifiedKeys = {};          // évite de renotifier le même événement
let edtHplanningUrl = '';          // lien HyperPlanning (bouton « 🌐 Site »)
let loopStarted = false;
let edtInitialized = false;

async function loadEdtReminderSettings()
{
  const s = await getSettings();
  edtRemindersEnabled = s.edtRemindersEnabled !== false;
  edtReminderMinutesBefore = Math.max(1, Number(s.edtReminderMinutesBefore) || 15);
  edtHplanningUrl = s.hplanningUrl || '';
}

// À appeler au démarrage de l'appli : charge le planning et lance la boucle
// seulement s'il y a des cours.
export async function initEdtReminders()
{
  await loadEdtReminderSettings();
  edtCache = await window.studyide.getEdtCache();
  if (edtCache?.events?.length) startReminderLoop();
}

function startReminderLoop()
{
  if (loopStarted) return;
  loopStarted = true;
  checkEdtSchedule();
  setInterval(checkEdtSchedule, CHECK_INTERVAL_MS);
}

// Vérifie si un cours commence ou se termine bientôt, et notifie une seule fois.
function checkEdtSchedule()
{
  if (!edtRemindersEnabled || !edtCache?.events?.length) return;
  const now = Date.now();

  edtCache.events.forEach((ev) =>
  {
    const startMs = new Date(ev.start).getTime();
    const endMs = new Date(ev.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;

    const minsToStart = Math.round((startMs - now) / 60000);
    const minsToEnd = Math.round((endMs - now) / 60000);

    notifyOnce(`${ev.uid}-start`, minsToStart >= 0 && minsToStart <= edtReminderMinutesBefore,
      '🔔 Cours bientôt', `${ev.title}${ev.room ? ' — ' + ev.room : ''} commence dans ${minsToStart} min`);

    notifyOnce(`${ev.uid}-endsoon`, minsToEnd >= 0 && minsToEnd <= edtReminderMinutesBefore && now >= startMs,
      '⏳ Cours bientôt fini', `${ev.title} se termine dans ${minsToEnd} min`);

    notifyOnce(`${ev.uid}-ended`, minsToEnd <= 0 && minsToEnd >= -2,
      '✅ Cours terminé', `${ev.title} est terminé.`);
  });

  // Rafraîchit l'affichage « en ce moment » s'il est visible.
  if (state.currentMode === 'edt') renderEdtScheduleView();
}

// Déclenche une notification une seule fois par clé (si la condition est vraie).
function notifyOnce(key, condition, title, body)
{
  if (!condition || edtNotifiedKeys[key]) return;
  edtNotifiedKeys[key] = true;
  fireEdtNotification(title, body);
}

// ---- Modale de réglages des rappels ----

function openRemindersModal()
{
  el('edtRemindersEnabledCheckbox').checked = edtRemindersEnabled;
  el('edtReminderMinutesInput').value = edtReminderMinutesBefore;
  el('edtRemindersOverlay').classList.add('open');
}

function closeRemindersModal()
{
  el('edtRemindersOverlay').classList.remove('open');
}

export function bindEdtRemindersEvents()
{
  el('edtRemindersBtn').onclick = openRemindersModal;
  el('edtRemindersCloseBtn').onclick = closeRemindersModal;
  el('edtRemindersOverlay').addEventListener('click', (e) =>
  {
    if (e.target.id === 'edtRemindersOverlay') closeRemindersModal();
  });

  el('edtRemindersSaveBtn').onclick = async () =>
  {
    edtRemindersEnabled = el('edtRemindersEnabledCheckbox').checked;
    edtReminderMinutesBefore = Math.max(1, Number(el('edtReminderMinutesInput').value) || 15);
    await patchSettings({ edtRemindersEnabled, edtReminderMinutesBefore });
    closeRemindersModal();
  };
}

// ---- Affichage du planning ----

function setEdtImportStatus(text, isError)
{
  const s = el('edtImportStatus');
  if (!s) return;
  s.textContent = text || '';
  s.className = 'chat-auth-status' + (isError ? ' err' : '');
}

function fmtTime(iso)
{
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function sameLocalDay(isoA, dateB)
{
  const a = new Date(isoA);
  return a.getFullYear() === dateB.getFullYear()
    && a.getMonth() === dateB.getMonth()
    && a.getDate() === dateB.getDate();
}

function renderEdtScheduleView()
{
  if (!edtCache) return;
  const now = new Date();
  const todaysEvents = edtCache.events
    .filter((ev) => sameLocalDay(ev.start, now))
    .sort((a, b) => a.start.localeCompare(b.start));

  renderNowCard(todaysEvents, now);
  renderTodayList(todaysEvents, now);

  const importedDate = edtCache.importedAt ? new Date(edtCache.importedAt).toLocaleDateString('fr-FR') : '';
  el('edtImportMeta').textContent = `Planning importé le ${importedDate} (${edtCache.events.length} cours). Réimporte le fichier .ics si ton emploi du temps a changé.`;
}

// Carte « en ce moment » : cours en cours, sinon prochain cours, sinon rien.
function renderNowCard(todaysEvents, now)
{
  const current = todaysEvents.find((ev) => new Date(ev.start) <= now && now <= new Date(ev.end));
  const next = todaysEvents.find((ev) => new Date(ev.start) > now);
  let html;

  if (current)
  {
    const minsLeft = Math.max(0, Math.round((new Date(current.end).getTime() - now.getTime()) / 60000));
    html = `
      <div class="edt-now-badge live">🟢 En cours</div>
      <div class="edt-now-title">${escapeHtml(current.title)}</div>
      <div class="edt-now-meta">${fmtTime(current.start)} – ${fmtTime(current.end)}${current.room ? ' · ' + escapeHtml(current.room) : ''}${current.teacher ? ' · ' + escapeHtml(current.teacher) : ''}</div>
      <div class="edt-now-sub">Se termine dans ${minsLeft} min</div>`;
  }
  else if (next)
  {
    const minsToStart = Math.max(0, Math.round((new Date(next.start).getTime() - now.getTime()) / 60000));
    html = `
      <div class="edt-now-badge">⏭ Prochain cours</div>
      <div class="edt-now-title">${escapeHtml(next.title)}</div>
      <div class="edt-now-meta">${fmtTime(next.start)} – ${fmtTime(next.end)}${next.room ? ' · ' + escapeHtml(next.room) : ''}${next.teacher ? ' · ' + escapeHtml(next.teacher) : ''}</div>
      <div class="edt-now-sub">Dans ${minsToStart} min</div>`;
  }
  else
  {
    const holidayToday = (edtCache.holidays || []).find((h) => sameLocalDay(h.start, now));
    html = `
      <div class="edt-now-badge">😌 Pas de cours</div>
      <div class="edt-now-title">${holidayToday ? escapeHtml(holidayToday.label) : 'Rien de prévu aujourd\'hui'}</div>`;
  }
  el('edtNowCard').innerHTML = html;
}

function renderTodayList(todaysEvents, now)
{
  const listEl = el('edtTodayList');
  if (!todaysEvents.length)
  {
    listEl.innerHTML = '<p class="empty-hint">Aucun cours aujourd\'hui.</p>';
    return;
  }

  listEl.innerHTML = todaysEvents.map((ev) =>
  {
    const isPast = new Date(ev.end) < now;
    const isLive = new Date(ev.start) <= now && now <= new Date(ev.end);
    return `
      <div class="edt-day-item${isPast ? ' past' : ''}${isLive ? ' live' : ''}">
        <span class="edi-time">${fmtTime(ev.start)}–${fmtTime(ev.end)}</span>
        <span class="edi-title">${escapeHtml(ev.title)}</span>
        <span class="edi-room">${escapeHtml(ev.room || '')}</span>
      </div>`;
  }).join('');
}

function showEdtSchedule()
{
  el('edtEmptyState').classList.add('hidden');
  el('edtScheduleView').classList.remove('hidden');
  renderEdtScheduleView();
}

function showEdtEmpty()
{
  el('edtScheduleView').classList.add('hidden');
  el('edtEmptyState').classList.remove('hidden');
}

async function runEdtImport()
{
  setEdtImportStatus('Import en cours…', false);
  const res = await window.studyide.importEdtIcs();
  if (!res) return;
  if (res.canceled) { setEdtImportStatus('', false); return; }
  if (!res.ok) { setEdtImportStatus(res.error || 'Import impossible.', true); return; }

  edtCache = res.data;
  edtNotifiedKeys = {};
  setEdtImportStatus('Importé ✅', false);
  showEdtSchedule();
  startReminderLoop();
  checkEdtSchedule();
}

export function initEdtMode()
{
  if (edtInitialized)
  {
    if (edtCache) renderEdtScheduleView();
    return;
  }
  edtInitialized = true;
  if (edtCache?.events?.length) showEdtSchedule();
  else showEdtEmpty();
}

export function bindEdtEvents()
{
  el('edtImportIcsBtn').onclick = runEdtImport;
  el('edtImportIcsBtnEmpty').onclick = runEdtImport;

  el('edtOpenBrowserBtn').onclick = async () =>
  {
    let url = edtHplanningUrl;
    if (!url)
    {
      url = (await askText('Colle le lien de ton HyperPlanning :') || '').trim();
      if (!url) return;
      await patchSettings({ hplanningUrl: url });
      edtHplanningUrl = url;
    }
    window.studyide.openUrl(url);
  };
}
