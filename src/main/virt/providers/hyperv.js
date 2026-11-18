'use strict';
// Hyper-V (Windows) via les cmdlets PowerShell. Nécessite d'être administrateur ou membre du groupe « Administrateurs Hyper-V ».

const { IS_WIN, powershell, psQuote } = require('../exec');
const P = require('../parsers');

async function detect() {
  if (!IS_WIN) return { available: false, note: 'Windows uniquement' };
  const r = await powershell("if (Get-Command Get-VM -ErrorAction SilentlyContinue) { 'yes' }", { timeout: 15000 });
  if (!r.ok || !r.stdout.includes('yes')) return { available: false, note: 'Module Hyper-V absent (fonctionnalité Windows non activée ?)' };
  return { available: true, version: '', cli: { name: 'powershell', path: 'powershell.exe', inPath: true }, needsAdmin: true };
}

async function list() {
  const r = await powershell("Get-VM | Select-Object Name,@{n='Id';e={$_.Id.ToString()}},@{n='State';e={$_.State.ToString()}},ProcessorCount,MemoryStartup | ConvertTo-Json -Compress");
  if (!r.ok) throw new Error(/permission|autoris|access|privil|droit/i.test(r.stderr) ? 'Droits insuffisants : relance StudyIDE en administrateur (ou ajoute-toi au groupe « Administrateurs Hyper-V »).' : (r.stderr.trim() || r.error || 'Get-VM a échoué'));
  return P.parseHyperV(r.stdout).map((v) => ({ ...v, os: '', details: v.rawState }));
}

const GUID = /^[0-9a-fA-F-]{36}$/;
const SCRIPTS = {
  start: (id) => `Get-VM -Id ${psQuote(id)} | Start-VM`,
  stop: (id) => `Get-VM -Id ${psQuote(id)} | Stop-VM`,
  poweroff: (id) => `Get-VM -Id ${psQuote(id)} | Stop-VM -TurnOff -Force`,
  pause: (id) => `Get-VM -Id ${psQuote(id)} | Suspend-VM`,
  resume: (id) => `Get-VM -Id ${psQuote(id)} | Resume-VM`,
  restart: (id) => `Get-VM -Id ${psQuote(id)} | Restart-VM -Force`,
  suspend: (id) => `Get-VM -Id ${psQuote(id)} | Save-VM`,
  snapshot: (id, args) => `Get-VM -Id ${psQuote(id)} | Checkpoint-VM -SnapshotName ${psQuote(args.name)}`
};

async function perform(vm, action, args) {
  if (!GUID.test(vm.id) || !SCRIPTS[action]) return { ok: false, error: 'Action non prise en charge.' };
  const r = await powershell(SCRIPTS[action](vm.id, args), { timeout: 120000 });
  return { ok: r.ok, output: r.stdout.trim(), error: r.ok ? '' : (r.stderr.trim() || r.error || 'Échec') };
}

module.exports = { id: 'hyperv', name: 'Hyper-V', icon: '🪟', supports: Object.keys(SCRIPTS), detect, list, perform };
