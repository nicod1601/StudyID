'use strict';
// WSL (Windows Subsystem for Linux) : distributions installées.

const { run, findBinary, IS_WIN } = require('../exec');
const P = require('../parsers');

const bin = () => (IS_WIN ? findBinary(['wsl'], ['C:\\Windows\\System32']) : null);

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: IS_WIN ? 'WSL non installé (commande : wsl --install)' : 'Windows uniquement' };
  const v = await run(cli.path, ['--version'], { timeout: 8000, encoding: 'utf16le' });
  const m = v.stdout.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
  return { available: true, version: m ? m[1] : '', cli };
}

async function list() {
  const cli = bin();
  const r = await run(cli.path, ['-l', '-v'], { timeout: 12000, encoding: 'utf16le' });
  if (!r.ok && !r.stdout.trim()) return []; // aucune distribution installée
  return P.parseWslList(r.stdout).map((d) => ({
    id: d.name, name: d.name, state: d.state, rawState: d.rawState, os: `WSL ${d.wslVersion}`, details: d.isDefault ? 'Distribution par défaut' : ''
  }));
}

async function perform(vm, action) {
  const cli = bin();
  if (!cli) return { ok: false, error: 'WSL introuvable.' };
  if (action === 'stop' || action === 'poweroff') {
    const r = await run(cli.path, ['--terminate', vm.id], { encoding: 'utf16le' });
    return { ok: r.ok, output: r.stdout.trim(), error: r.ok ? '' : (r.stderr.trim() || r.stdout.trim() || r.error || 'Échec') };
  }
  if (action === 'start') { // ouvre une console WSL (la distribution démarre avec)
    const r = await run('cmd.exe', ['/c', 'start', '', 'wsl.exe', '-d', vm.id], { timeout: 10000 });
    return { ok: r.ok, output: '', error: r.ok ? '' : (r.stderr.trim() || 'Échec') };
  }
  if (action === 'restart') {
    const t = await run(cli.path, ['--terminate', vm.id], { encoding: 'utf16le' });
    if (!t.ok) return { ok: false, error: t.stderr.trim() || 'Échec' };
    const r = await run(cli.path, ['-d', vm.id, '--exec', 'true'], { timeout: 30000, encoding: 'utf16le' });
    return { ok: r.ok, output: '', error: r.ok ? '' : (r.stderr.trim() || 'Échec') };
  }
  return { ok: false, error: 'Action non prise en charge.' };
}

module.exports = { id: 'wsl', name: 'WSL', icon: '🐚', supports: ['start', 'stop', 'poweroff', 'restart'], detect, list, perform };
