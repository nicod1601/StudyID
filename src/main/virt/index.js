'use strict';
// Section Virtualisation : détection des hyperviseurs installés, liste des machines et actions de contrôle.
// Chaque hyperviseur est un module de providers/ qui expose : id, name, icon, supports, detect(), list(), perform().

const PROVIDERS = [
  require('./providers/virtualbox'),
  require('./providers/vmware'),
  require('./providers/hyperv'),
  require('./providers/libvirt'),
  require('./providers/wsl'),
  require('./providers/docker'),
  require('./providers/multipass')
];
const byId = new Map(PROVIDERS.map((p) => [p.id, p]));

// Actions proposées selon l'état de la machine (filtrées ensuite selon ce que l'hyperviseur sait faire)
const ACTIONS_BY_STATE = {
  stopped: ['start', 'snapshot'],
  suspended: ['start', 'poweroff'],
  running: ['stop', 'restart', 'pause', 'suspend', 'snapshot', 'poweroff'],
  paused: ['resume', 'snapshot', 'poweroff'],
  busy: [],
  unknown: []
};
const actionsFor = (state, supports) => (ACTIONS_BY_STATE[state] || []).filter((a) => supports.includes(a));

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${label} : délai dépassé`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function scanProvider(p) {
  const out = { id: p.id, name: p.name, icon: p.icon, available: false, version: '', cli: null, note: '', error: '', vms: [] };
  try {
    Object.assign(out, await withTimeout(p.detect(), 25000, 'Détection'));
  } catch (e) {
    out.note = e.message;
  }
  if (!out.available) return out;
  try {
    const vms = await withTimeout(p.list(), 45000, 'Liste des machines');
    out.vms = vms.map((v) => ({ ...v, provider: p.id, actions: actionsFor(v.state, p.supports) }));
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

let inflight = null;
async function scan(ids) {
  const wanted = Array.isArray(ids) && ids.length ? ids.filter((i) => byId.has(i)) : null;
  if (!wanted && inflight) return inflight; // plusieurs demandes simultanées : un seul balayage
  const run = Promise.all((wanted ? wanted.map((i) => byId.get(i)) : PROVIDERS).map(scanProvider))
    .then((providers) => ({ providers, at: Date.now() }));
  if (!wanted) { inflight = run; run.finally(() => { inflight = null; }); }
  return run;
}

const SAFE_TEXT = /^[^\u0000\r\n]{1,600}$/;
const SNAPSHOT_NAME = /^[\w .()\-]{1,64}$/;

async function performAction({ provider, vm, action, args }) {
  const p = byId.get(provider);
  if (!p) return { ok: false, error: 'Hyperviseur inconnu.' };
  if (!vm || typeof vm.id !== 'string' || !SAFE_TEXT.test(vm.id)) return { ok: false, error: 'Machine invalide.' };
  if (!p.supports.includes(action)) return { ok: false, error: 'Action non prise en charge.' };
  const clean = { ...(args || {}) };
  if (action === 'snapshot') {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    clean.name = SNAPSHOT_NAME.test(String(clean.name || '').trim()) ? String(clean.name).trim()
      : `snap-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
  return p.perform({ id: vm.id, name: String(vm.name || '') }, action, clean);
}

module.exports = { PROVIDERS, scan, performAction, actionsFor };
