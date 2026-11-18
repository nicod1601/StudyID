'use strict';
// Docker : conteneurs (docker ps -a). Docker Desktop / le démon doit être démarré.

const { run, findBinary, IS_WIN } = require('../exec');
const P = require('../parsers');

const bin = () => findBinary(['docker'], IS_WIN ? ['C:\\Program Files\\Docker\\Docker\\resources\\bin'] : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']);

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: 'docker introuvable (Docker n\'est pas installé ?)' };
  const v = await run(cli.path, ['--version'], { timeout: 8000 });
  const m = v.stdout.match(/version\s+([\w.\-]+)/i);
  return { available: v.ok, version: m ? m[1] : v.stdout.trim(), cli };
}

async function list() {
  const cli = bin();
  const r = await run(cli.path, ['ps', '-a', '--format', '{{json .}}'], { timeout: 15000 });
  if (!r.ok) throw new Error(/daemon|connect|pipe|socket/i.test(r.stderr) ? 'Le démon Docker ne répond pas : démarre Docker Desktop (ou le service docker).' : (r.stderr.trim() || r.error || 'docker ps a échoué'));
  return P.parseDockerPs(r.stdout).map((c) => ({ id: c.id, name: c.name, state: c.state, rawState: c.rawState, os: c.image, details: [c.status, c.ports].filter(Boolean).join(' · ') }));
}

const COMMANDS = { start: 'start', stop: 'stop', poweroff: 'kill', pause: 'pause', resume: 'unpause', restart: 'restart' };

async function perform(vm, action) {
  const cli = bin();
  if (!cli || !COMMANDS[action] || !/^[\w.-]+$/.test(vm.id)) return { ok: false, error: 'Action non prise en charge.' };
  const r = await run(cli.path, [COMMANDS[action], vm.id], { timeout: 60000 });
  return { ok: r.ok, output: r.stdout.trim(), error: r.ok ? '' : (r.stderr.trim() || r.error || 'Échec') };
}

module.exports = { id: 'docker', name: 'Docker', icon: '🐳', supports: Object.keys(COMMANDS), detect, list, perform };
