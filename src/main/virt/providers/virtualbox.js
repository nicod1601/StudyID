'use strict';
// VirtualBox via VBoxManage.

const { run, findBinary, IS_WIN } = require('../exec');
const P = require('../parsers');

const EXTRA = IS_WIN ? ['C:\\Program Files\\Oracle\\VirtualBox'] : process.platform === 'darwin' ? ['/Applications/VirtualBox.app/Contents/MacOS', '/usr/local/bin'] : ['/usr/bin', '/usr/local/bin'];
const bin = () => findBinary(['VBoxManage'], EXTRA);

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: 'VBoxManage introuvable (VirtualBox n\'est pas installé ?)' };
  const v = await run(cli.path, ['--version'], { timeout: 8000 });
  return { available: v.ok, version: v.stdout.trim().split(/\r?\n/)[0], cli, note: v.ok ? '' : v.stderr.trim() };
}

async function list() {
  const cli = bin();
  const all = await run(cli.path, ['list', 'vms']);
  if (!all.ok) throw new Error(all.stderr.trim() || all.error || 'VBoxManage list vms a échoué');
  const vms = P.parseVBoxList(all.stdout);
  // L'état précis (en pause, sauvegardé, éteint…) vient de showvminfo : 4 VM à la fois
  const out = [];
  for (let i = 0; i < vms.length; i += 4) {
    out.push(...await Promise.all(vms.slice(i, i + 4).map(async (vm) => {
      const info = await run(cli.path, ['showvminfo', vm.id, '--machinereadable'], { timeout: 10000 });
      const kv = info.ok ? P.parseMachineReadable(info.stdout) : {};
      return {
        id: vm.id, name: vm.name, state: info.ok ? P.mapVBoxState(kv.VMState) : P.STATE.unknown, rawState: kv.VMState || '',
        os: kv.ostype || '', cpus: Number(kv.cpus) || 0, memory: Number(kv.memory) || 0,
        details: [kv.groups && kv.groups !== '/' ? `Groupe ${kv.groups}` : '', kv.SnapshotName ? `Instantané : ${kv.SnapshotName}` : ''].filter(Boolean).join(' · ')
      };
    })));
  }
  return out;
}

const COMMANDS = {
  start: (vm) => ['startvm', vm.id, '--type', 'gui'],
  stop: (vm) => ['controlvm', vm.id, 'acpipowerbutton'],
  poweroff: (vm) => ['controlvm', vm.id, 'poweroff'],
  pause: (vm) => ['controlvm', vm.id, 'pause'],
  resume: (vm) => ['controlvm', vm.id, 'resume'],
  restart: (vm) => ['controlvm', vm.id, 'reset'],
  suspend: (vm) => ['controlvm', vm.id, 'savestate'],
  snapshot: (vm, args) => ['snapshot', vm.id, 'take', args.name]
};

async function perform(vm, action, args) {
  const cli = bin();
  const build = COMMANDS[action];
  if (!cli || !build) return { ok: false, error: 'Action non prise en charge.' };
  const r = await run(cli.path, build(vm, args), { timeout: 60000 });
  return { ok: r.ok, output: (r.stdout + r.stderr).trim(), error: r.ok ? '' : (r.stderr.trim() || r.error || 'Échec') };
}

module.exports = { id: 'virtualbox', name: 'VirtualBox', icon: '📦', supports: Object.keys(COMMANDS), detect, list, perform };
