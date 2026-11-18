'use strict';
// VMware Workstation / Player / Fusion via vmrun ; les machines sont retrouvées dans les préférences de VMware et les dossiers habituels.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, findBinary, IS_WIN } = require('../exec');
const P = require('../parsers');

const EXTRA = IS_WIN
  ? ['C:\\Program Files (x86)\\VMware\\VMware Workstation', 'C:\\Program Files\\VMware\\VMware Workstation', 'C:\\Program Files (x86)\\VMware\\VMware VIX']
  : process.platform === 'darwin' ? ['/Applications/VMware Fusion.app/Contents/Public'] : ['/usr/bin', '/usr/local/bin'];
const bin = () => findBinary(['vmrun'], EXTRA);
const TYPE = process.platform === 'darwin' ? 'fusion' : 'ws';

async function detect() {
  const cli = bin();
  if (!cli) return { available: false, note: 'vmrun introuvable (VMware n\'est pas installé ?)' };
  const r = await run(cli.path, [], { timeout: 8000 }); // sans argument : affiche l'aide et la version
  const m = (r.stdout + r.stderr).match(/version\s+([\d.]+)/i);
  return { available: true, version: m ? m[1] : '', cli };
}

function preferencesFiles() {
  if (IS_WIN) return [path.join(process.env.APPDATA || '', 'VMware', 'preferences.ini')];
  if (process.platform === 'darwin') return [path.join(os.homedir(), 'Library', 'Preferences', 'VMware Fusion', 'preferences')];
  return [path.join(os.homedir(), '.vmware', 'preferences')];
}
function defaultDirs() {
  return [path.join(os.homedir(), 'Documents', 'Virtual Machines'), path.join(os.homedir(), 'vmware'), path.join(os.homedir(), 'Virtual Machines')];
}
function scanVmx(dir, depth, out) {
  if (depth < 0 || out.length > 200) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && /\.vmx$/i.test(e.name)) out.push(full);
    else if (e.isDirectory() && !e.name.startsWith('.')) scanVmx(full, depth - 1, out);
  }
}

async function list() {
  const cli = bin();
  const running = await run(cli.path, ['-T', TYPE, 'list'], { timeout: 10000 });
  const runningSet = new Set(P.parseVmrunList(running.stdout).map((p) => path.normalize(p).toLowerCase()));
  const known = new Map();
  const add = (p) => { if (p && fs.existsSync(p)) known.set(path.normalize(p).toLowerCase(), path.normalize(p)); };
  for (const f of preferencesFiles()) { try { P.parseVmwarePreferences(fs.readFileSync(f, 'utf-8')).forEach(add); } catch (e) { /* absent */ } }
  const found = []; defaultDirs().forEach((d) => scanVmx(d, 2, found)); found.forEach(add);
  P.parseVmrunList(running.stdout).forEach(add);
  const vms = [];
  for (const [key, vmx] of known) {
    let meta = { name: '', os: '', cpus: 0, memory: 0 };
    try { meta = P.parseVmx(fs.readFileSync(vmx, 'utf-8').slice(0, 200000)); } catch (e) { /* lecture impossible */ }
    const base = vmx.slice(0, -4);
    const saved = fs.existsSync(base + '.vmss');
    vms.push({
      id: vmx, name: meta.name || path.basename(vmx, '.vmx'), os: meta.os, cpus: meta.cpus, memory: meta.memory,
      state: runningSet.has(key) ? P.STATE.running : saved ? P.STATE.suspended : P.STATE.stopped, details: vmx
    });
  }
  return vms;
}

const COMMANDS = {
  start: (vm) => ['start', vm.id, 'gui'],
  stop: (vm) => ['stop', vm.id, 'soft'],
  poweroff: (vm) => ['stop', vm.id, 'hard'],
  pause: (vm) => ['pause', vm.id],
  resume: (vm) => ['unpause', vm.id],
  restart: (vm) => ['reset', vm.id, 'soft'],
  suspend: (vm) => ['suspend', vm.id, 'soft'],
  snapshot: (vm, args) => ['snapshot', vm.id, args.name]
};

async function perform(vm, action, args) {
  const cli = bin();
  const build = COMMANDS[action];
  if (!cli || !build) return { ok: false, error: 'Action non prise en charge.' };
  const r = await run(cli.path, ['-T', TYPE, ...build(vm, args)], { timeout: 90000 });
  return { ok: r.ok, output: (r.stdout + r.stderr).trim(), error: r.ok ? '' : ((r.stdout + r.stderr).trim() || r.error || 'Échec') };
}

module.exports = { id: 'vmware', name: 'VMware', icon: '🧊', supports: Object.keys(COMMANDS), detect, list, perform };
