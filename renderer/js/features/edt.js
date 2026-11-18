// Emploi du temps (iCal) et rappels.

// =====================================================================
// EMPLOI DU TEMPS — planning importé (.ics), mis en cache localement,
// détection automatique du cours en cours + notifications début/fin
// =====================================================================

let edtCache = null;           // { importedAt, sourceFileName, events, holidays }
let edtRemindersEnabled = true;
let edtReminderMinutesBefore = 15;
let edtNotifiedKeys = {};      // évite de renotifier le même événement (start/end-soon/ended)
let edtHplanningUrl = '';      // pour le bouton "🌐 Site" (optionnel, ouvert en externe seulement)

async function loadEdtReminderSettings() {
  const s = await window.studyide.getSettings();
  edtRemindersEnabled = s.edtRemindersEnabled !== false;
  edtReminderMinutesBefore = Math.max(1, Number(s.edtReminderMinutesBefore) || 15);
  edtHplanningUrl = s.hplanningUrl || '';
}
function startEdtReminderLoop() {
  checkEdtSchedule();
  setInterval(checkEdtSchedule, 20000);
}
// Vérifie, à partir du planning importé, si un cours commence ou se termine bientôt
function checkEdtSchedule() {
  if (!edtRemindersEnabled || !edtCache || !edtCache.events || !edtCache.events.length) return;
  const now = Date.now();

  edtCache.events.forEach((ev) => {
    const startMs = new Date(ev.start).getTime();
    const endMs = new Date(ev.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;

    const minsToStart = Math.round((startMs - now) / 60000);
    const minsToEnd = Math.round((endMs - now) / 60000);

    // Avant le début du cours
    const startKey = `${ev.uid}-start`;
    if (minsToStart >= 0 && minsToStart <= edtReminderMinutesBefore && !edtNotifiedKeys[startKey]) {
      edtNotifiedKeys[startKey] = true;
      fireEdtNotification('🔔 Cours bientôt', `${ev.title}${ev.room ? ' — ' + ev.room : ''} commence dans ${minsToStart} min`);
    }

    // Avant la fin du cours
    const endSoonKey = `${ev.uid}-endsoon`;
    if (minsToEnd >= 0 && minsToEnd <= edtReminderMinutesBefore && now >= startMs && !edtNotifiedKeys[endSoonKey]) {
      edtNotifiedKeys[endSoonKey] = true;
      fireEdtNotification('⏳ Cours bientôt fini', `${ev.title} se termine dans ${minsToEnd} min`);
    }

    // Juste à la fin du cours
    const endedKey = `${ev.uid}-ended`;
    if (minsToEnd <= 0 && minsToEnd >= -2 && !edtNotifiedKeys[endedKey]) {
      edtNotifiedKeys[endedKey] = true;
      fireEdtNotification('✅ Cours terminé', `${ev.title} est terminé.`);
    }
  });

  // Rafraîchit l'affichage "en ce moment" s'il est visible
  if (currentMode === 'edt' && edtCache) renderEdtScheduleView();
}
async function fireEdtNotification(title, body) {
  if (typeof Notification === 'undefined') return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const notif = new Notification(title, { body, silent: false });
  notif.onclick = () => {
    window.studyide.focusWindow();
    window.focus();
    notif.close();
  };
}
function openEdtRemindersModal() {
  el('edtRemindersEnabledCheckbox').checked = edtRemindersEnabled;
  el('edtReminderMinutesInput').value = edtReminderMinutesBefore;
  el('edtRemindersOverlay').classList.add('open');
}
function closeEdtRemindersModal() {
  el('edtRemindersOverlay').classList.remove('open');
}
function bindEdtRemindersEvents() {
  el('edtRemindersBtn').onclick = openEdtRemindersModal;
  el('edtRemindersCloseBtn').onclick = closeEdtRemindersModal;
  el('edtRemindersOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'edtRemindersOverlay') closeEdtRemindersModal();
  });

  el('edtRemindersSaveBtn').onclick = async () => {
    edtRemindersEnabled = el('edtRemindersEnabledCheckbox').checked;
    edtReminderMinutesBefore = Math.max(1, Number(el('edtReminderMinutesInput').value) || 15);
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, edtRemindersEnabled, edtReminderMinutesBefore });
    closeEdtRemindersModal();
  };
}
function setEdtImportStatus(text, isError) {
  const s = el('edtImportStatus');
  if (!s) return;
  s.textContent = text || '';
  s.className = 'chat-auth-status' + (isError ? ' err' : '');
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function sameLocalDay(isoA, dateB) {
  const a = new Date(isoA);
  return a.getFullYear() === dateB.getFullYear() &&
    a.getMonth() === dateB.getMonth() &&
    a.getDate() === dateB.getDate();
}
function renderEdtScheduleView() {
  if (!edtCache) return;
  const now = new Date();
  const todaysEvents = edtCache.events
    .filter((ev) => sameLocalDay(ev.start, now))
    .sort((a, b) => a.start.localeCompare(b.start));

  // Carte "en ce moment"
  const current = todaysEvents.find((ev) => new Date(ev.start) <= now && now <= new Date(ev.end));
  const next = todaysEvents.find((ev) => new Date(ev.start) > now);
  let nowCardHtml;
  if (current) {
    const minsLeft = Math.max(0, Math.round((new Date(current.end).getTime() - now.getTime()) / 60000));
    nowCardHtml = `
      <div class="edt-now-badge live">🟢 En cours</div>
      <div class="edt-now-title">${escapeHtml(current.title)}</div>
      <div class="edt-now-meta">${fmtTime(current.start)} – ${fmtTime(current.end)}${current.room ? ' · ' + escapeHtml(current.room) : ''}${current.teacher ? ' · ' + escapeHtml(current.teacher) : ''}</div>
      <div class="edt-now-sub">Se termine dans ${minsLeft} min</div>`;
  } else if (next) {
    const minsToStart = Math.max(0, Math.round((new Date(next.start).getTime() - now.getTime()) / 60000));
    nowCardHtml = `
      <div class="edt-now-badge">⏭ Prochain cours</div>
      <div class="edt-now-title">${escapeHtml(next.title)}</div>
      <div class="edt-now-meta">${fmtTime(next.start)} – ${fmtTime(next.end)}${next.room ? ' · ' + escapeHtml(next.room) : ''}${next.teacher ? ' · ' + escapeHtml(next.teacher) : ''}</div>
      <div class="edt-now-sub">Dans ${minsToStart} min</div>`;
  } else {
    const holidayToday = (edtCache.holidays || []).find((h) => sameLocalDay(h.start, now));
    nowCardHtml = `
      <div class="edt-now-badge">😌 Pas de cours</div>
      <div class="edt-now-title">${holidayToday ? escapeHtml(holidayToday.label) : 'Rien de prévu aujourd\'hui'}</div>`;
  }
  el('edtNowCard').innerHTML = nowCardHtml;

  // Liste du jour
  const listEl = el('edtTodayList');
  if (!todaysEvents.length) {
    listEl.innerHTML = '<p class="empty-hint">Aucun cours aujourd\'hui.</p>';
  } else {
    listEl.innerHTML = todaysEvents.map((ev) => {
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

  const importedDate = edtCache.importedAt ? new Date(edtCache.importedAt).toLocaleDateString('fr-FR') : '';
  el('edtImportMeta').textContent = `Planning importé le ${importedDate} (${edtCache.events.length} cours). Réimporte le fichier .ics si ton emploi du temps a changé.`;
}
function showEdtSchedule() {
  el('edtEmptyState').classList.add('hidden');
  el('edtScheduleView').classList.remove('hidden');
  renderEdtScheduleView();
}
function showEdtEmpty() {
  el('edtScheduleView').classList.add('hidden');
  el('edtEmptyState').classList.remove('hidden');
}
async function runEdtImport() {
  setEdtImportStatus('Import en cours…', false);
  const res = await window.studyide.importEdtIcs();
  if (!res) return;
  if (res.canceled) { setEdtImportStatus('', false); return; }
  if (!res.ok) {
    setEdtImportStatus(res.error || 'Import impossible.', true);
    return;
  }
  edtCache = res.data;
  edtNotifiedKeys = {};
  setEdtImportStatus('Importé ✅', false);
  showEdtSchedule();
  checkEdtSchedule();
}
let edtInitialized = false;
async function initEdtMode() {
  if (edtInitialized) {
    if (edtCache) renderEdtScheduleView();
    return;
  }
  edtInitialized = true;
  edtCache = await window.studyide.getEdtCache();
  if (edtCache && edtCache.events && edtCache.events.length) {
    showEdtSchedule();
  } else {
    showEdtEmpty();
  }
}
function bindEdtEvents() {
  el('edtImportIcsBtn').onclick = runEdtImport;
  el('edtImportIcsBtnEmpty').onclick = runEdtImport;

  el('edtOpenBrowserBtn').onclick = async () => {
    let url = edtHplanningUrl;
    if (!url) {
      url = (prompt('Colle le lien de ton HyperPlanning :') || '').trim();
      if (!url) return;
      const s = await window.studyide.getSettings();
      await window.studyide.setSettings({ ...s, hplanningUrl: url });
      edtHplanningUrl = url;
    }
    window.studyide.openUrl(url);
  };
}
