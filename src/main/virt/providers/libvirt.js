'use strict';
// libvirt / QEMU-KVM via virsh. Essaie la connexion système (qemu:///system) puis celle de l'utilisateur (qemu:///session).

const { run, findBinary } = require('../exec');
const P = require('../parsers');

const URIS = ['qemu:///system', 'qemu:///session'];
const bin = () => findBinary(['virsh'], ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']);

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: 'virsh introuvable (libvirt n\'est pas installé ?)' };
  const v = await run(cli.path, ['--version'], { timeout: 8000 });
  return { available: v.ok, version: v.stdout.trim(), cli };
}

async function list() {
  const cli = bin();
  const vms = [];
  const errors = [];
  for (const uri of URIS) {
    const r = await run(cli.path, ['-c', uri, 'list', '--all'], { timeout: 12000 });
    if (!r.ok) { errors.push(`${uri} : ${r.stderr.trim().split(/\r?\n/)[0] || r.error}`); continue; }
    for (const d of P.parseVirshList(r.stdout)) {
      vms.push({ id: `${uri}|${d.name}`, name: d.name, state: d.state, rawState: d.rawState, os: '', details: uri.replace('qemu:///', 'connexion ') });
    }
  }
  if (!vms.length && errors.length === URIS.length) throw new Error(errors[0] + ' (ajoute ton utilisateur au groupe « libvirt » pour la connexion système)');
  return vms;
}

const COMMANDS = {
  start: ['start'], stop: ['shutdown'], poweroff: ['destroy'], pause: ['suspend'], resume: ['resume'],
  restart: ['reboot'], suspend: ['managedsave']
};

async function perform(vm, action, args) {
  const cli = bin();
  const [uri, name] = String(vm.id).split('|');
  if (!cli || !URIS.includes(uri) || !name) return { ok: false, error: 'Machine invalide.' };
  let argv;
  if (action === 'snapshot') argv = ['snapshot-create-as', name, args.name];
  else if (COMMANDS[action]) argv = [...COMMANDS[action], name];
  else return { ok: false, error: 'Action non prise en charge.' };
  const r = await run(cli.path, ['-c', uri, ...argv], { timeout: 60000 });
  return { ok: r.ok, output: (r.stdout + r.stderr).trim(), error: r.ok ? '' : (r.stderr.trim() || r.error || 'Échec') };
}

module.exports = { id: 'libvirt', name: 'QEMU / KVM (libvirt)', icon: '🐧', supports: [...Object.keys(COMMANDS), 'snapshot'], detect, list, perform };
