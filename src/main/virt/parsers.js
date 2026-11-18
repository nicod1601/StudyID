'use strict';
// Analyse de la sortie des outils en ligne de commande. Fonctions pures (pas d'accès système) : faciles à tester.

// --- États normalisés : running | stopped | paused | suspended | busy | unknown
const STATE = { running: 'running', stopped: 'stopped', paused: 'paused', suspended: 'suspended', busy: 'busy', unknown: 'unknown' };

function mapState(raw) {
  const s = String(raw || '').toLowerCase();
  if (/^(running|up|started|en cours|online)/.test(s) || s.includes('cours d')) return STATE.running;
  if (/^(paused|pause)/.test(s)) return STATE.paused;
  if (/^(saved|suspended|pmsuspended|managed saved)/.test(s)) return STATE.suspended;
  if (/(starting|stopping|saving|restoring|restarting|in shutdown|snapshotting|deleting|busy)/.test(s)) return STATE.busy;
  if (/(off|stopped|exited|created|dead|shut|poweroff|aborted|arr[êe]t)/.test(s)) return STATE.stopped;
  return STATE.unknown;
}

// --- VirtualBox
function parseVBoxList(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^"(.*)"\s+\{([0-9a-fA-F-]+)\}\s*$/);
    if (m) out.push({ name: m[1], id: m[2] });
  }
  return out;
}
function parseMachineReadable(text) {
  const kv = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    kv[m[1]] = v;
  }
  return kv;
}
function mapVBoxState(s) {
  switch (String(s)) {
    case 'running': return STATE.running;
    case 'paused': return STATE.paused;
    case 'saved': return STATE.suspended;
    case 'poweroff': case 'aborted': case 'aborted-saved': return STATE.stopped;
    case 'starting': case 'stopping': case 'saving': case 'restoring': case 'teleporting': return STATE.busy;
    default: return STATE.unknown;
  }
}

// --- VMware (vmrun + fichiers .vmx)
function parseVmrunList(text) {
  return String(text).split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
}
function parseVmx(text) {
  const kv = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_.:-]+)\s*=\s*"(.*)"\s*$/);
    if (m) kv[m[1].toLowerCase()] = m[2];
  }
  return { name: kv['displayname'] || '', os: kv['guestos'] || '', cpus: Number(kv['numvcpus']) || 1, memory: Number(kv['memsize']) || 0 };
}
function parseVmwarePreferences(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^pref\.mruVM\d+\.filename\s*=\s*"(.*)"/i);
    if (m) out.push(m[1]);
  }
  return out;
}

// --- Hyper-V (JSON de ConvertTo-Json : objet seul, tableau ou vide)
function parseHyperV(text) {
  const t = String(text).trim();
  if (!t) return [];
  const data = JSON.parse(t);
  return (Array.isArray(data) ? data : [data]).map((v) => ({
    id: v.Id, name: v.Name, state: mapState(v.State), rawState: v.State, cpus: v.ProcessorCount || 0,
    memory: v.MemoryStartup ? Math.round(v.MemoryStartup / 1048576) : 0
  }));
}

// --- libvirt (virsh list --all)
function parseVirshList(text) {
  const out = [];
  let started = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*-{3,}/.test(line)) { started = true; continue; }
    if (!started || !line.trim()) continue;
    const m = line.match(/^\s*(\S+)\s+(\S+(?: \S+)*?)\s{2,}(.+?)\s*$/);
    if (m) out.push({ domId: m[1], name: m[2], rawState: m[3], state: mapState(m[3]) });
  }
  return out;
}

// --- WSL (wsl -l -v, déjà décodé de l'UTF-16)
function parseWslList(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines.slice(1)) { // 1re ligne = en-têtes (localisés)
    const m = line.match(/^\s*(\*)?\s*(\S+)\s+(.+?)\s+(\d)\s*$/);
    if (m) out.push({ name: m[2], isDefault: !!m[1], rawState: m[3].trim(), state: mapState(m[3]), wslVersion: Number(m[4]) });
  }
  return out;
}

// --- Docker (docker ps -a --format "{{json .}}")
function parseDockerPs(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line);
      out.push({ id: c.ID, name: String(c.Names || '').split(',')[0], image: c.Image, rawState: c.State, status: c.Status, ports: c.Ports || '', state: mapState(c.State) });
    } catch (e) { /* ligne ignorée */ }
  }
  return out;
}

// --- Multipass (multipass list --format json)
function parseMultipass(text) {
  const data = JSON.parse(String(text) || '{}');
  return (data.list || []).map((v) => ({
    name: v.name, rawState: v.state, state: mapState(v.state), release: v.release || '', ipv4: v.ipv4 || []
  }));
}

module.exports = {
  STATE, mapState, parseVBoxList, parseMachineReadable, mapVBoxState, parseVmrunList, parseVmx, parseVmwarePreferences,
  parseHyperV, parseVirshList, parseWslList, parseDockerPs, parseMultipass
};
