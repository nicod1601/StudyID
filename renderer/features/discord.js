/**
 * Mode Discord : affiche discord.com/app dans une webview dédiée.
 *
 * On neutralise au passage les invites « clé d'accès » (passkey / WebAuthn) que
 * Discord déclenche automatiquement : elles ouvraient la fenêtre « Sécurité
 * Windows » à répétition. La connexion classique (email / mot de passe) reste
 * disponible.
 */

import { el } from '../core/dom.js';

const DISCORD_URL = 'https://discord.com/app';

// Code injecté DANS la page Discord : empêche l'ouverture auto de la boîte passkey.
const DISABLE_PASSKEY_JS = `
(() => {
  try {
    const cred = navigator.credentials;
    if (!cred || !cred.get || cred.__studyidePatched) return;
    const original = cred.get.bind(cred);
    cred.get = function (options) {
      // Invite passkey (WebAuthn) ou autofill conditionnel : on refuse proprement,
      // Discord bascule alors sur la connexion email / mot de passe.
      if (options && (options.publicKey || options.mediation === 'conditional')) {
        return Promise.reject(new DOMException('Passkey désactivée dans StudyIDE', 'NotAllowedError'));
      }
      return original(options);
    };
    cred.__studyidePatched = true;
  } catch (e) {}
})();
`;

// Charge Discord à la PREMIÈRE ouverture de l'onglet seulement (chargement
// paresseux) : tant qu'on n'y va pas, Discord ne tourne pas et ne peut pas
// déclencher la fenêtre « clé d'accès » de Windows au démarrage.
export function initDiscordMode()
{
  const webview = el('discordWebview');
  if (!webview.getAttribute('src')) webview.setAttribute('src', DISCORD_URL);
}

export function bindDiscordEvents()
{
  const webview = el('discordWebview');

  // Réinjecte le correctif à chaque chargement de page de la webview.
  webview.addEventListener('dom-ready', () =>
  {
    webview.executeJavaScript(DISABLE_PASSKEY_JS).catch(() => {});
  });

  el('discordRefreshBtn').onclick = () =>
  {
    if (webview.src) webview.reload();
  };

  el('discordOpenBrowserBtn').onclick = () => window.studyide.openUrl(DISCORD_URL);
}
