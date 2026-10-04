/**
 * Notifications système : fin de réponse IA et rappels de cours.
 * Une notification ratée ne doit jamais casser la fonctionnalité appelante.
 */

import { getSettings } from './settings-client.js';

export async function ensureNotificationPermission()
{
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; }
  catch (e) { return false; }
}

// Ramène la fenêtre au premier plan au clic sur une notification.
function focusOnClick(notif)
{
  notif.onclick = () =>
  {
    window.studyide.focusWindow();
    window.focus();
    notif.close();
  };
}

// Notifie la fin d'une réponse IA, seulement si la fenêtre est en arrière-plan.
export async function notifyIaResponseIfBackground(modeLabel, plainText)
{
  try
  {
    if (typeof Notification === 'undefined') return;
    if (document.hasFocus() && !document.hidden) return;
    if ((await getSettings()).iaNotifications === false) return;
    if (!(await ensureNotificationPermission())) return;

    const excerpt = (plainText || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    const notif = new Notification('StudyIDE — L\'IA a fini de répondre',
    {
      body: excerpt || modeLabel || 'Ta réponse est prête.',
      silent: false
    });
    focusOnClick(notif);
  }
  catch (e)
  {
    console.error('Notification IA impossible :', e);
  }
}

// Notification liée à l'emploi du temps (début / fin de cours).
export async function fireEdtNotification(title, body)
{
  if (typeof Notification === 'undefined') return;
  if (!(await ensureNotificationPermission())) return;
  focusOnClick(new Notification(title, { body, silent: false }));
}
