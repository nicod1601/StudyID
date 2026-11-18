// Section Virtualisation : panneau de détail (état, actions, commandes à copier ou lancer dans le terminal).

const VIRT_ACTIONS = {
  start:    { icon: '▶', label: 'Démarrer' },
  stop:     { icon: '⏻', label: 'Arrêter' },
  restart:  { icon: '⟳', label: 'Redémarrer' },
  pause:    { icon: '⏸', label: 'Pause' },
  resume:   { icon: '⏯', label: 'Reprendre' },
  suspend:  { icon: '💾', label: 'Suspendre' },
  snapshot: { icon: '📸', label: 'Instantané' },
  poweroff: { icon: '⛔', label: 'Forcer l\'arrêt', danger: true,
              confirm: (n) => `Forcer l'arrêt de « ${n} » ?\nC'est comme débrancher la prise : ce qui n'est pas enregistré dans la machine sera perdu.` }
};

let virtCmdList = [];      // commandes affichées (pour retrouver celle d'un bouton)
let virtActionBusy = false;
let virtLastResult = null; // { name, label, ok, text }

// {name} / {id} -> valeurs de la machine (les guillemets sont retirés du nom : ils casseraient la commande)
function virtSubst(cmd, vm) {
  return vm ? cmd.replace(/\{name\}/g, vm.name.replace(/"/g, '')).replace(/\{id\}/g, vm.id) : cmd;
}

// Texte à saisir : <valeur> -> demandé à l'utilisateur ; null s'il annule
function virtFillPlaceholders(cmd) {
  const names = [...new Set([...cmd.matchAll(/<([^<>\n]{1,40})>/g)].map((m) => m[1]))];
  let out = cmd;
  for (const n of names) {
    const v = prompt(`Valeur pour « ${n} » :`);
    if (v === null) return null;
    out = out.split(`<${n}>`).join(v);
  }
  return out;
}

// Adapte la commande au terminal de l'appli : chemin complet si l'outil n'est pas dans le PATH, enveloppe PowerShell sous Windows
function virtTerminalCommand(providerId, def, text) {
  const isWin = navigator.platform.toLowerCase().includes('win');
  const group = VIRT_COMMANDS[providerId] || {};
  const shell = def.shell || group.shell;
  if (isWin && shell === 'powershell') return `powershell -NoProfile -Command "${text.replace(/"/g, '\\"')}"`;
  const prov = virt.providers.find((p) => p.id === providerId);
  const cli = prov && prov.cli;
  if (cli && !cli.inPath) {
    const first = (text.match(/^\S+/) || [''])[0];
    if (first.toLowerCase() === cli.name.toLowerCase()) {
      const q = isWin ? `"${cli.path}"` : `'${cli.path}'`;
      return q + text.slice(first.length);
    }
  }
  return text;
}

function runInVirtTerminal(providerId, def, text) {
  if (def.danger && !confirm(`Cette commande est destructrice :\n\n${text}\n\nLa lancer quand même ?`)) return;
  const filled = virtFillPlaceholders(text);
  if (filled === null) return;
  el('virtTerminalPanel').classList.remove('collapsed');
  virt.terms.runCommand(virtTerminalCommand(providerId, def, filled), '');
}

// ---------------- Rendu ----------------
function virtCmdCard(def, text, i) {
  return `<div class="virt-cmd${def.danger ? ' danger' : ''}">
    <div class="virt-cmd-head">
      <span class="virt-cmd-title">${def.danger ? '⚠ ' : ''}${escapeHtml(def.title)}</span>
      ${def.desc ? `<span class="virt-cmd-desc">${escapeHtml(def.desc)}</span>` : ''}
      <span class="virt-cmd-btns">
        <button class="btn-ghost" data-copy="${i}">📋 Copier</button>
        <button class="btn-run" data-run="${i}">▶ Terminal</button>
      </span>
    </div>
    <pre class="virt-cmd-code">${escapeHtml(text)}</pre>
  </div>`;
}

function renderVirtDetail() {
  const host = el('virtDetail');
  const vm = virtSelectedVm();
  virtCmdList = [];

  if (!vm) {
    // Aucune machine choisie : aperçu + commandes générales de chaque hyperviseur détecté
    const avail = virt.providers.filter((p) => p.available);
    if (!avail.length) {
      host.innerHTML = '<div class="empty-hint">Les hyperviseurs détectés apparaîtront ici, avec leurs machines et des commandes prêtes à copier.</div>';
      return;
    }
    const sections = avail.map((p) => {
      const group = VIRT_COMMANDS[p.id];
      if (!group) return '';
      const cards = group.general.map((def) => { virtCmdList.push({ def, text: def.cmd, provider: p.id }); return virtCmdCard(def, def.cmd, virtCmdList.length - 1); }).join('');
      return `<details class="virt-section"><summary>${p.icon} ${escapeHtml(p.name)} — commandes générales</summary>${cards}</details>`;
    }).join('');
    host.innerHTML = `<div class="virt-welcome">
        <h3>Choisis une machine à gauche</h3>
        <p>Tu pourras la démarrer, l'arrêter, la mettre en pause, faire un instantané, et copier des commandes adaptées à son nom.</p>
      </div>${sections}`;
    return;
  }

  const prov = virt.providers.find((p) => p.id === vm.provider);
  const specs = [vm.os, vm.cpus ? `${vm.cpus} CPU` : '', vm.memory ? `${vm.memory} Mo` : '', vm.details].filter(Boolean).join(' · ');
  const actions = vm.actions.map((a) => {
    const m = VIRT_ACTIONS[a];
    return `<button class="${m.danger ? 'btn-ghost virt-danger' : a === 'start' ? 'btn-run' : 'btn-ghost'}" data-vmact="${a}" ${virtActionBusy ? 'disabled' : ''}>${m.icon} ${m.label}</button>`;
  }).join('');

  const group = VIRT_COMMANDS[vm.provider] || { vm: [], general: [] };
  const cmds = group.vm.map((def) => {
    const text = virtSubst(def.cmd, vm);
    virtCmdList.push({ def, text, provider: vm.provider });
    return virtCmdCard(def, text, virtCmdList.length - 1);
  }).join('');

  host.innerHTML = `
    <div class="virt-card">
      <div class="virt-card-top">
        <div>
          <h2>${prov ? prov.icon : ''} ${escapeHtml(vm.name)}</h2>
          <div class="virt-card-sub">${escapeHtml(prov ? prov.name : vm.provider)}${specs ? ' · ' + escapeHtml(specs) : ''}</div>
        </div>
        <span class="virt-badge ${vm.state}"><span class="virt-dot ${vm.state}"></span>${VIRT_STATES[vm.state] || vm.state}${vm.rawState && vm.state === 'unknown' ? ' (' + escapeHtml(vm.rawState) + ')' : ''}</span>
      </div>
      <div class="virt-actions">${actions || '<span class="virt-none">Aucune action disponible dans cet état.</span>'}</div>
      ${virtLastResult && virtLastResult.name === vm.name ? `<pre class="virt-result ${virtLastResult.ok ? 'ok' : 'err'}">${escapeHtml(virtLastResult.label)} : ${virtLastResult.ok ? 'terminé' : 'échec'}${virtLastResult.text ? '\n' + escapeHtml(virtLastResult.text) : ''}</pre>` : ''}
    </div>
    <h3 class="virt-subtitle">Commandes pour « ${escapeHtml(vm.name)} »</h3>
    ${cmds || '<div class="virt-none">Aucune commande prédéfinie.</div>'}
    <details class="virt-section"><summary>Commandes générales ${prov ? escapeHtml(prov.name) : ''}</summary>
      ${group.general.map((def) => { virtCmdList.push({ def, text: def.cmd, provider: vm.provider }); return virtCmdCard(def, def.cmd, virtCmdList.length - 1); }).join('')}
    </details>`;
}

// ---------------- Actions ----------------
async function runVirtAction(vm, action) {
  const meta = VIRT_ACTIONS[action];
  if (meta.confirm && !confirm(meta.confirm(vm.name))) return;
  const args = {};
  if (action === 'snapshot') {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = prompt('Nom de l\'instantané :', `snap-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`);
    if (name === null) return;
    args.name = name.trim();
  }
  virtActionBusy = true;
  renderVirtDetail();
  notify(`${meta.icon} ${meta.label} : ${vm.name}…`);
  let res;
  try {
    res = await window.studyide.virtAction({ provider: vm.provider, vm: { id: vm.id, name: vm.name }, action, args });
  } catch (e) {
    res = { ok: false, error: e.message };
  }
  virtActionBusy = false;
  virtLastResult = { name: vm.name, label: meta.label, ok: res.ok, text: (res.ok ? res.output : res.error) || '' };
  notify(res.ok ? `✅ ${meta.label} : ${vm.name}` : `⚠ ${meta.label} impossible : ${(res.error || '').split('\n')[0]}`);
  // L'état met parfois une ou deux secondes à changer : deux actualisations rapprochées
  await scanVirt([vm.provider]);
  setTimeout(() => { if (currentMode === 'virt') scanVirt([vm.provider]); }, 2500);
}

// ---------------- Événements du panneau ----------------
(function bindVirtDetailEvents() {
  const host = document.getElementById('virtDetail');
  if (!host) return;
  host.addEventListener('click', (e) => {
    const act = e.target.closest('[data-vmact]');
    if (act && !act.disabled) { const vm = virtSelectedVm(); if (vm) runVirtAction(vm, act.dataset.vmact); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) { copyToClipboard(virtCmdList[Number(copy.dataset.copy)].text); return; }
    const runBtn = e.target.closest('[data-run]');
    if (runBtn) { const c = virtCmdList[Number(runBtn.dataset.run)]; runInVirtTerminal(c.provider, c.def, c.text); }
  });
})();
