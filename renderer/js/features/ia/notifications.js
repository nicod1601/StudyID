// Mode IA : notifications système quand une réponse arrive en arrière-plan.

// =====================================================================
// NOTIFICATIONS SYSTÈME : prévenir quand l'IA a fini de répondre
// et que la fenêtre est en arrière-plan (pas au premier plan / masquée)
// =====================================================================

async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch (e) {
    return false;
  }
}
async function notifyIaResponseIfBackground(modeLabel, plainText) {
  try {
    if (typeof Notification === 'undefined') return;
    // On ne notifie que si l'appli n'est pas au premier plan (autre fenêtre active, ou masquée dans le tray)
    if (document.hasFocus() && !document.hidden) return;

    const settings = await window.studyide.getSettings();
    if (settings.iaNotifications === false) return;

    const ok = await ensureNotificationPermission();
    if (!ok) return;

    const excerpt = (plainText || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    const notif = new Notification('StudyIDE — L\'IA a fini de répondre', {
      body: excerpt || modeLabel || 'Ta réponse est prête.',
      silent: false
    });
    notif.onclick = () => {
      window.studyide.focusWindow();
      window.focus();
      notif.close();
    };
  } catch (e) {
    // Silencieux : une notification ratée ne doit jamais casser le chat IA
    console.error('Notification IA impossible :', e);
  }
}
