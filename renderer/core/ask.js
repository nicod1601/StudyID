/**
 * Petite boîte de saisie modale, en remplacement de window.prompt() (que
 * Electron ne supporte pas). Renvoie une Promise : le texte saisi, ou null si
 * annulé.
 */

import { el } from './dom.js';

export function askText(message, defaultValue = '')
{
  return new Promise((resolve) =>
  {
    const overlay = el('askModalOverlay');
    const input = el('askModalInput');
    const label = el('askModalLabel');
    const okBtn = el('askModalOk');
    const cancelBtn = el('askModalCancel');

    label.textContent = message;
    input.value = defaultValue;
    overlay.classList.add('open');
    input.focus();
    input.select();

    let done = false;
    const close = (value) =>
    {
      if (done) return;
      done = true;
      overlay.classList.remove('open');
      okBtn.onclick = cancelBtn.onclick = input.onkeydown = overlay.onclick = null;
      resolve(value);
    };

    okBtn.onclick = () => close(input.value);
    cancelBtn.onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    input.onkeydown = (e) =>
    {
      if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); close(null); }
    };
  });
}
