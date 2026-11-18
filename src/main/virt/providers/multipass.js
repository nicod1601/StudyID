'use strict';
// Multipass (machines virtuelles Ubuntu légères de Canonical).

const { run, findBinary, IS_WIN } = require('../exec');
const P = require('../parsers');

const bin = () => findBinary(['multipass'], IS_WIN ? ['C:\\Program Files\\Multipass\\bin'] : ['/usr/bin', '/usr/local/bin', '/snap/bin']);

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: 'multipass introuvable (Multipass n\'est pas installé ?)' };
  const v = await run(cli.path, ['version'], { timeout: 8000 });
  const m = v.stdout.match(/multipass\s+([\d.]+)/i);
  return { available: v.ok, version: m ? m[1] : '', cli };
}

async function list() {
  const cli = bin();
  const r = await run(cli.path, ['list', '--format', 'json'], { timeout: 15000 });
  if (!r.ok) throw new Error(r.stderr.trim() || r.error || 'multipass list a échoué');
  return P.parseMultipass(r.stdout).map((v) => ({
    id: v.name, name: v.name, state: v.state, rawState: v.rawState, os: v.release, details: v.ipv4.join(', ')
  }));
}

const COMMANDS = {
  start: (n) => ['start', n], stop: (n) => ['stop', n], poweroff: (n) => ['stop', '--force', n],
  restart: (n) => ['restart', n], suspend: (n) => ['suspend', n], snapshot: (n, a) => ['snapshot', n, '--name', a.name]
};

async function perform(vm, action, args) {
  const cli = bin();
  if (!cli || !COMMANDS[action] || !/^[\w.-]+$/.test(vm.id)) return { ok: false, error: 'Action non prise en charge.' };
  const r = await run(cli.path, COMMANDS[action](vm.id, args), { timeout: 120000 });
  return { ok: r.ok, output: (r.stdout + r.stderr).trim(), error: r.ok ? '' : (r.stderr.trim() || r.error || 'Échec') };
}

module.exports = { id: 'multipass', name: 'Multipass', icon: '🟠', supports: Object.keys(COMMANDS), detect, list, perform };
