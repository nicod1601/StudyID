/**
 * Paramètres de l'application : arrière-plan (tray), notifications IA, bulles
 * flottantes, export des données, raccourci sur le bureau.
 */

import { el } from '../core/dom.js';
import { getSettings, patchSettings } from '../core/settings-client.js';
import { ensureNotificationPermission } from '../core/notifications.js';
import { closeIaDrawer } from './ia.js';
import { closeNotesDrawer } from './notes.js';
import { closeChatDrawer } from './chat.js';

async function openAppSettingsModal()
{
  const s = await getSettings();
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

// Lie une case à cocher « afficher la bulle X » : bascule la visibilité, ferme
// le tiroir si on masque, et enregistre le réglage.
function bindBubbleToggle(checkboxId, bubbleId, settingKey, closeDrawer)
{
  el(checkboxId).onchange = (e) =>
  {
    el(bubbleId).classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked) closeDrawer();
    patchSettings({ [settingKey]: e.target.checked });
  };
}

// Lance une action asynchrone en gérant l'état « occupé » du bouton + le statut.
async function runWithFeedback(btn, busyLabel, action, statusEl, onResult)
{
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  const res = await action();
  btn.disabled = false;
  btn.textContent = original;
  onResult(res, statusEl);
}

export function bindAppSettingsEvents()
{
  el('appSettingsBtn').onclick = openAppSettingsModal;
  el('closeAppSettingsBtn').onclick = () => el('appSettingsModalOverlay').classList.remove('open');

  el('minimizeToTrayCheckbox').onchange = (e) => patchSettings({ minimizeToTray: e.target.checked });

  el('iaNotifCheckbox').onchange = async (e) =>
  {
    if (e.target.checked) await ensureNotificationPermission();
    patchSettings({ iaNotifications: e.target.checked });
  };

  bindBubbleToggle('showIaBubbleCheckbox', 'iaBubbleBtn', 'showIaBubble', closeIaDrawer);
  bindBubbleToggle('showNotesBubbleCheckbox', 'notesBubbleBtn', 'showNotesBubble', closeNotesDrawer);
  bindBubbleToggle('showChatBubbleCheckbox', 'chatBubbleBtn', 'showChatBubble', closeChatDrawer);

  el('exportDataBtn').onclick = (e) =>
    runWithFeedback(e.currentTarget, '⏳ Export en cours…', () => window.studyide.exportData(), el('exportStatus'), (res, statusEl) =>
    {
      if (res.canceled) { statusEl.textContent = ''; return; }
      if (res.ok)
      {
        statusEl.textContent = `✅ Données exportées vers : ${res.path}`;
        statusEl.className = 'export-status ok';
      }
      else
      {
        statusEl.textContent = `❌ Erreur : ${res.error}`;
        statusEl.className = 'export-status err';
      }
    });

  el('createShortcutBtn').onclick = (e) =>
    runWithFeedback(e.currentTarget, '⏳ Création…', () => window.studyide.createDesktopShortcut(), el('shortcutStatus'), (res, statusEl) =>
    {
      if (res.ok)
      {
        statusEl.textContent = res.needsTrust
          ? '✅ Raccourci créé sur ton Bureau. Sur certains environnements Linux (GNOME), il faut d\'abord faire un clic droit dessus → "Autoriser le lancement" avant de pouvoir double-cliquer dessus.'
          : `✅ Raccourci créé sur ton Bureau : ${res.path}`;
        statusEl.className = 'export-status ok';
      }
      else
      {
        statusEl.textContent = `❌ Erreur : ${res.error}`;
        statusEl.className = 'export-status err';
      }
    });
}
