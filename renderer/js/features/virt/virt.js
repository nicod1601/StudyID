// Section Virtualisation : détection des hyperviseurs, liste des machines et actualisation.
// (le panneau de détail, les actions et les commandes sont dans virt-detail.js)

const VIRT_STATES = {
  running: 'En marche', stopped: 'Éteinte', paused: 'En pause', suspended: 'Suspendue', busy: 'En transition…', unknown: 'État inconnu'
};

const virt = {
  providers: [],        // résultat de virt:scan (hyperviseurs + machines)
  selected: null,       // clé « hyperviseur::id » de la machine affichée
  filter: '',
  onlyProvider: null,   // filtre par hyperviseur (clic sur une pastille)
  scanning: false,
  lastScanAt: 0,
  auto: false,
  timer: null,
  ready: false,
  terms: null           // terminal intégré de la section
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); notify('📋 Commande copiée'); }
  catch (e) { notify('⚠ Copie impossible'); }
}

const virtKey = (vm) => `${vm.provider}::${vm.id}`;
const virtAllVms = () => virt.providers.flatMap((p) => p.vms);
const virtSelectedVm = () => virtAllVms().find((v) => virtKey(v) === virt.selected) || null;

function loadVirtPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('studyide.virt') || '{}');
    virt.auto = !!p.auto;
    virt.selected = p.selected || null;
  } catch (e) { /* ignoré */ }
}
function saveVirtPrefs() {
  try { localStorage.setItem('studyide.virt', JSON.stringify({ auto: virt.auto, selected: virt.selected })); } catch (e) { /* ignoré */ }
}

// Appelé à chaque affichage de la section
async function initVirtMode() {
  if (!virt.ready) {
    virt.ready = true;
    loadVirtPrefs();
    el('virtAutoChk').checked = virt.auto;
    bindVirtEvents();
    virt.terms = new WebDev.TerminalTabs(el('virtTermHost'), el('virtTermTabs'), {
      getCwd: () => '',
      onLocalLink: (uri) => { window.studyide.openUrl(uri); }
    });
    virt.terms.reset('');
    renderVirtAll();
  }
  startVirtTimer();
  if (Date.now() - virt.lastScanAt > 3000) await scanVirt();
}

// Balayage complet, ou limité à certains hyperviseurs (après une action)
async function scanVirt(ids) {
  if (virt.scanning && !ids) return;
  virt.scanning = true;
  el('virtRefreshBtn').classList.add('spinning');
  if (!virt.providers.length) renderVirtAll(); // premier affichage : message « détection… »
  try {
    const res = await window.studyide.virtScan(ids);
    if (ids) {
      for (const p of res.providers) {
        const i = virt.providers.findIndex((x) => x.id === p.id);
        if (i >= 0) virt.providers[i] = p; else virt.providers.push(p);
      }
    } else {
      virt.providers = res.providers;
    }
    virt.lastScanAt = Date.now();
  } catch (e) {
    notify('⚠ Détection impossible : ' + e.message);
  } finally {
    virt.scanning = false;
    el('virtRefreshBtn').classList.remove('spinning');
  }
  if (virt.selected && !virtSelectedVm()) virt.selected = null; // la machine a disparu
  renderVirtAll();
}

function startVirtTimer() {
  clearInterval(virt.timer);
  if (!virt.auto) return;
  virt.timer = setInterval(() => {
    if (currentMode !== 'virt' || !document.hasFocus() || virt.scanning) return;
    scanVirt();
  }, 10000);
}

// ---------------- Rendu ----------------
function renderVirtAll() {
  renderVirtProviders();
  renderVirtList();
  renderVirtDetail();
}

function renderVirtProviders() {
  const host = el('virtProviders');
  if (!virt.providers.length) { host.innerHTML = ''; return; }
  host.innerHTML = virt.providers.map((p) => {
    const cls = p.available ? 'ok' : 'off';
    const active = virt.onlyProvider === p.id ? ' active' : '';
    const title = p.available ? `${p.name}${p.version ? ' ' + p.version : ''} — ${p.vms.length} machine(s)` : (p.note || 'Non détecté');
    return `<button class="virt-chip ${cls}${active}" data-pid="${p.id}" ${p.available ? '' : 'disabled'} title="${escapeHtml(title)}">
      <span>${p.icon}</span><span>${escapeHtml(p.name)}</span>${p.available ? `<b>${p.vms.length}</b>` : ''}</button>`;
  }).join('');
}

function renderVirtList() {
  const host = el('virtList');
  if (!virt.providers.length) {
    host.innerHTML = '<div class="empty-hint">⏳ Détection des hyperviseurs…</div>';
    return;
  }
  const q = norm(virt.filter);
  const matches = (v) => !q || norm(`${v.name} ${v.os || ''} ${v.details || ''} ${v.provider}`).includes(q);
  const groups = virt.providers.filter((p) => p.available && (!virt.onlyProvider || p.id === virt.onlyProvider));

  if (!virt.providers.some((p) => p.available)) {
    host.innerHTML = `<div class="empty-hint">Aucun hyperviseur détecté sur cette machine.<br><br>StudyIDE sait piloter VirtualBox, VMware, Hyper-V, QEMU/KVM (libvirt), WSL, Docker et Multipass dès qu'ils sont installés.</div>`;
    return;
  }

  const html = [];
  for (const p of groups) {
    const vms = p.vms.filter(matches);
    html.push(`<div class="virt-group-head"><span>${p.icon} ${escapeHtml(p.name)}</span><small>${p.version ? escapeHtml(p.version) : ''}</small></div>`);
    if (p.error) html.push(`<div class="virt-error">⚠ ${escapeHtml(p.error)}</div>`);
    if (!vms.length && !p.error) html.push(`<div class="virt-none">${q ? 'Aucun résultat' : 'Aucune machine'}</div>`);
    for (const v of vms) {
      const key = virtKey(v);
      html.push(`<div class="virt-vm${key === virt.selected ? ' selected' : ''}" data-key="${escapeHtml(key)}" title="${escapeHtml(VIRT_STATES[v.state] || '')}">
        <span class="virt-dot ${v.state}"></span>
        <span class="virt-vm-name">${escapeHtml(v.name)}</span>
        <span class="virt-vm-os">${escapeHtml(v.os || '')}</span>
      </div>`);
    }
  }
  host.innerHTML = html.join('');
}

// ---------------- Événements ----------------
function bindVirtEvents() {
  el('virtRefreshBtn').onclick = () => scanVirt();
  el('virtAutoChk').onchange = (e) => { virt.auto = e.target.checked; saveVirtPrefs(); startVirtTimer(); };
  el('virtFilter').oninput = (e) => { virt.filter = e.target.value; renderVirtList(); };

  el('virtProviders').addEventListener('click', (e) => {
    const chip = e.target.closest('.virt-chip');
    if (!chip || chip.disabled) return;
    virt.onlyProvider = virt.onlyProvider === chip.dataset.pid ? null : chip.dataset.pid;
    renderVirtProviders();
    renderVirtList();
  });

  el('virtList').addEventListener('click', (e) => {
    const row = e.target.closest('.virt-vm');
    if (!row) return;
    virt.selected = row.dataset.key;
    saveVirtPrefs();
    el('virtList').querySelectorAll('.virt-vm').forEach((r) => r.classList.toggle('selected', r === row));
    renderVirtDetail();
  });

  EditorNav.initSplitter(el('virtTerminalPanel'), el('virtTermSplitter'), 'virtTermHeight');
  el('virtMaxTermBtn').onclick = () => EditorNav.toggleMaximize(el('virtTerminalPanel'), el('virtMaxTermBtn'));
  el('virtNewTermBtn').onclick = () => { el('virtTerminalPanel').classList.remove('collapsed'); virt.terms.newTab(''); };
  el('virtToggleTermBtn').onclick = () => el('virtTerminalPanel').classList.toggle('collapsed');

  // En revenant sur la fenêtre (après avoir utilisé VirtualBox, Docker…), l'état se met à jour
  window.addEventListener('focus', () => {
    if (currentMode === 'virt' && Date.now() - virt.lastScanAt > 5000) scanVirt();
  });
}
