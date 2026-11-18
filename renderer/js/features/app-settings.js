// Paramètres de l'application.

// =====================================================================
// PARAMÈTRES DE L'APPLI : arrière-plan, export des données, raccourci bureau
// =====================================================================

async function openAppSettingsModal() {
  const s = await window.studyide.getSettings();
  el('minimizeToTrayCheckbox').checked = s.minimizeToTray !== false;
  el('iaNotifCheckbox').checked = s.iaNotifications !== false;
  el('showIaBubbleCheckbox').checked = s.showIaBubble !== false;
  el('showNotesBubbleCheckbox').checked = s.showNotesBubble !== false;
  el('showChatBubbleCheckbox').checked = s.showChatBubble !== false;
  el('exportStatus').textContent = '';
  el('exportStatus').className = 'export-status';
  el('shortcutStatus').textContent = '';
  el('shortcutStatus').className = 'export-status';
  el('appSettingsModalOverlay').classList.add('open');
}
function bindAppSettingsEvents() {
  el('appSettingsBtn').onclick = openAppSettingsModal;
  el('closeAppSettingsBtn').onclick = () => el('appSettingsModalOverlay').classList.remove('open');

  el('minimizeToTrayCheckbox').onchange = async (e) => {
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, minimizeToTray: e.target.checked });
  };

  el('iaNotifCheckbox').onchange = async (e) => {
    if (e.target.checked) await ensureNotificationPermission();
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, iaNotifications: e.target.checked });
  };

  el('showIaBubbleCheckbox').onchange = async (e) => {
    el('iaBubbleBtn').classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked) closeIaDrawer();
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, showIaBubble: e.target.checked });
  };

  el('showNotesBubbleCheckbox').onchange = async (e) => {
    el('notesBubbleBtn').classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked) closeNotesDrawer();
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, showNotesBubble: e.target.checked });
  };

  el('showChatBubbleCheckbox').onchange = async (e) => {
    el('chatBubbleBtn').classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked) closeChatDrawer();
    const s = await window.studyide.getSettings();
    await window.studyide.setSettings({ ...s, showChatBubble: e.target.checked });
  };

  el('exportDataBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Export en cours…';
    const res = await window.studyide.exportData();
    btn.disabled = false;
    btn.textContent = original;
    const statusEl = el('exportStatus');
    if (res.canceled) { statusEl.textContent = ''; return; }
    if (res.ok) {
      statusEl.textContent = `✅ Données exportées vers : ${res.path}`;
      statusEl.className = 'export-status ok';
    } else {
      statusEl.textContent = `❌ Erreur : ${res.error}`;
      statusEl.className = 'export-status err';
    }
  };

  el('createShortcutBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Création…';
    const res = await window.studyide.createDesktopShortcut();
    btn.disabled = false;
    btn.textContent = original;
    const statusEl = el('shortcutStatus');
    if (res.ok) {
      statusEl.textContent = res.needsTrust
        ? `✅ Raccourci créé sur ton Bureau. Sur certains environnements Linux (GNOME), il faut d'abord faire un clic droit dessus → "Autoriser le lancement" avant de pouvoir double-cliquer dessus.`
        : `✅ Raccourci créé sur ton Bureau : ${res.path}`;
      statusEl.className = 'export-status ok';
    } else {
      statusEl.textContent = `❌ Erreur : ${res.error}`;
      statusEl.className = 'export-status err';
    }
  };
}
