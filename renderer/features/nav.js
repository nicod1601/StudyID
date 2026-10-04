/**
 * Navigation entre les modes (Code, Cours, Projet, EDT, Discord) : bascule
 * l'affichage et déclenche l'initialisation paresseuse de chaque mode.
 */

import { el } from '../core/dom.js';
import { state } from '../core/state.js';
import { renderDocList } from './pdf.js';
import { initProjectMode } from './project.js';
import { initEdtMode } from './edt.js';
import { initDiscordMode } from './discord.js';
import { updateIaContextChip } from './ia.js';

const MODES = ['code', 'cours', 'projet', 'edt', 'discord'];

// id du bouton et du conteneur pour chaque mode.
const MODE_UI =
{
  code: { btn: 'modeCodeBtn', content: 'codeContent' },
  cours: { btn: 'modeCoursBtn', content: 'coursContent' },
  projet: { btn: 'modeProjetBtn', content: 'projetContent' },
  edt: { btn: 'modeEdtBtn', content: 'edtContent' },
  discord: { btn: 'modeDiscordBtn', content: 'discordContent' }
};

export function switchMode(mode)
{
  state.currentMode = mode;

  for (const m of MODES)
  {
    el(MODE_UI[m].btn).classList.toggle('active', m === mode);
    el(MODE_UI[m].content).classList.toggle('hidden', m !== mode);
  }

  if (mode === 'cours' && state.currentCourse) renderDocList();
  if (mode === 'projet') initProjectMode();
  if (mode === 'edt') initEdtMode();
  if (mode === 'discord') initDiscordMode();
  updateIaContextChip();
}

export function bindModeEvents()
{
  for (const m of MODES) el(MODE_UI[m].btn).onclick = () => switchMode(m);
}
