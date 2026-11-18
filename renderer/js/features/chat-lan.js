// Chat LAN : connexion, salons, messages, fichiers.

// =====================================================================
// CHAT LAN — comptes, connexion, salon commun, envoi de fichiers/zip
// =====================================================================

let chatDrawerOpen = false;
let chatWs = null;
let chatConnectedPseudo = null;
let chatPendingIncomingFile = null; // {from, name, size, mime, ts} en attente du frame binaire suivant

// Fils de discussion : 'room' (salon commun) + un fil par pseudo en DM
let chatThreads = { room: [] };
let chatActiveThread = 'room';
let chatOnlineUsers = [];
let chatUnread = {};
function openChatDrawer() {
  chatDrawerOpen = true;
  el('chatDrawer').classList.add('open');
  el('chatDrawerOverlay').classList.add('open');
  el('chatBubbleBtn').classList.add('active');

  const savedServer = localStorage.getItem('studyide_chat_server');
  const savedPseudo = localStorage.getItem('studyide_chat_pseudo');
  if (savedServer && !el('chatServerInput').value) el('chatServerInput').value = savedServer;
  if (savedPseudo && !el('chatPseudoInput').value) el('chatPseudoInput').value = savedPseudo;
}
function closeChatDrawer() {
  chatDrawerOpen = false;
  el('chatDrawer').classList.remove('open');
  el('chatDrawerOverlay').classList.remove('open');
  el('chatBubbleBtn').classList.remove('active');
}
function setChatAuthStatus(text, isError) {
  const s = el('chatAuthStatus');
  s.textContent = text || '';
  s.className = 'chat-auth-status' + (isError ? ' err' : '');
}
function chatServerUrl() {
  const raw = el('chatServerInput').value.trim().replace(/^ws:\/\//, '').replace(/\/$/, '');
  return raw;
}
function connectChatSocket(onOpenCallback) {
  const address = chatServerUrl();
  if (!address) {
    setChatAuthStatus('Entre l\'adresse du serveur (ex : 192.168.1.42:4321).', true);
    return;
  }
  if (chatWs) {
    try { chatWs.close(); } catch (e) {}
    chatWs = null;
  }
  setChatAuthStatus('Connexion en cours…', false);
  let socket;
  try {
    socket = new WebSocket(`ws://${address}`);
  } catch (e) {
    setChatAuthStatus('Adresse de serveur invalide.', true);
    return;
  }
  socket.binaryType = 'arraybuffer';
  chatWs = socket;

  socket.onopen = () => {
    setChatAuthStatus('Connecté au serveur ✅', false);
    if (onOpenCallback) onOpenCallback();
  };
  socket.onerror = () => {
    setChatAuthStatus('Impossible de joindre ce serveur. Vérifie l\'adresse et le réseau.', true);
  };
  socket.onclose = () => {
    if (chatConnectedPseudo) {
      appendChatSystem('Déconnecté du serveur.');
    }
    chatConnectedPseudo = null;
    chatWs = null;
    el('chatRoomPanel').classList.add('hidden');
    el('chatAuthPanel').classList.remove('hidden');
    el('chatLogoutBtn').classList.add('hidden');
  };
  socket.onmessage = (event) => handleChatSocketMessage(event);
}
function handleChatSocketMessage(event) {
  // Frame binaire = contenu d'un fichier annoncé juste avant (toujours dans le salon commun)
  if (event.data instanceof ArrayBuffer) {
    if (!chatPendingIncomingFile) return;
    const meta = chatPendingIncomingFile;
    chatPendingIncomingFile = null;
    const blob = new Blob([event.data], { type: meta.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    pushChatEntry('room', { type: 'file', from: meta.from, name: meta.name, size: meta.size, url, self: false });
    return;
  }

  let msg;
  try { msg = JSON.parse(event.data); } catch (e) { return; }

  if (msg.type === 'register_err') { setChatAuthStatus(msg.message, true); return; }
  if (msg.type === 'registered') {
    setChatAuthStatus('Compte créé ✅ Connexion…', false);
    chatWs.send(JSON.stringify({
      type: 'login',
      pseudo: el('chatPseudoInput').value.trim(),
      password: el('chatPasswordInput').value
    }));
    return;
  }
  if (msg.type === 'login_err') { setChatAuthStatus(msg.message, true); return; }

  if (msg.type === 'login_ok') {
    chatConnectedPseudo = msg.pseudo;
    chatThreads = { room: [] };
    chatActiveThread = 'room';
    chatUnread = {};
    chatOnlineUsers = [];
    localStorage.setItem('studyide_chat_server', chatServerUrl());
    localStorage.setItem('studyide_chat_pseudo', msg.pseudo);
    el('chatAuthPanel').classList.add('hidden');
    el('chatRoomPanel').classList.remove('hidden');
    el('chatLogoutBtn').classList.remove('hidden');
    setChatAuthStatus('', false);
    renderChatThreadsBar();
    renderActiveChatThread();
    return;
  }

  if (msg.type === 'users') {
    chatOnlineUsers = msg.list.filter((p) => p !== chatConnectedPseudo);
    renderChatThreadsBar();
    return;
  }

  if (msg.type === 'history') {
    msg.messages.forEach((m) => {
      chatThreads.room.push({ type: 'chat', from: m.from, text: m.text, ts: m.ts, self: m.from === chatConnectedPseudo });
    });
    if (chatActiveThread === 'room') renderActiveChatThread();
    return;
  }

  if (msg.type === 'dm_history') {
    msg.messages.forEach((m) => {
      const partner = m.from === chatConnectedPseudo ? m.to : m.from;
      if (!chatThreads[partner]) chatThreads[partner] = [];
      chatThreads[partner].push({ type: 'chat', from: m.from, text: m.text, ts: m.ts, self: m.from === chatConnectedPseudo });
    });
    renderChatThreadsBar();
    if (chatActiveThread !== 'room') renderActiveChatThread();
    return;
  }

  if (msg.type === 'chat') {
    pushChatEntry('room', { type: 'chat', from: msg.from, text: msg.text, ts: msg.ts, self: false });
    return;
  }

  if (msg.type === 'dm') {
    // On ne reçoit ici que les DM envoyés PAR quelqu'un d'autre (pas d'écho pour nos propres envois)
    const partner = msg.from;
    pushChatEntry(partner, { type: 'chat', from: msg.from, text: msg.text, ts: msg.ts, self: false });
    return;
  }

  if (msg.type === 'system') {
    pushChatEntry('room', { type: 'system', text: msg.text, ts: Date.now() });
    return;
  }

  if (msg.type === 'file_start') {
    chatPendingIncomingFile = msg;
    return;
  }

  if (msg.type === 'error') {
    pushChatEntry(chatActiveThread, { type: 'system', text: `⚠ ${msg.message}`, ts: Date.now() });
    return;
  }
}
// ---- Gestion des fils (salon + DM) ----

function chatThreadKeys() {
  const partners = new Set(Object.keys(chatThreads).filter((k) => k !== 'room'));
  chatOnlineUsers.forEach((p) => partners.add(p));
  return ['room', ...[...partners].sort((a, b) => a.localeCompare(b))];
}
function renderChatThreadsBar() {
  const bar = el('chatThreadsBar');
  bar.innerHTML = '';
  chatThreadKeys().forEach((key) => {
    const pill = document.createElement('button');
    const isOnline = key === 'room' || chatOnlineUsers.includes(key);
    pill.className = 'chat-thread-pill'
      + (key === chatActiveThread ? ' active' : '')
      + (chatUnread[key] ? ' unread' : '');
    pill.innerHTML = key === 'room'
      ? '🏠 Salon'
      : `<span class="dot ${isOnline ? 'ok' : ''}"></span>${escapeHtml(key)}`;
    pill.onclick = () => switchChatThread(key);
    bar.appendChild(pill);
  });
}
function switchChatThread(key) {
  chatActiveThread = key;
  chatUnread[key] = false;
  const attachBtn = el('chatAttachBtn');
  attachBtn.disabled = key !== 'room';
  attachBtn.title = key === 'room'
    ? 'Joindre un fichier (zip, doc, image…)'
    : 'Les fichiers sont pour l\'instant partageables uniquement dans le salon commun';
  renderChatThreadsBar();
  renderActiveChatThread();
}
function renderActiveChatThread() {
  const container = el('chatMessages');
  container.innerHTML = '';
  const list = chatThreads[chatActiveThread] || [];
  if (!list.length) {
    const hint = chatActiveThread === 'room'
      ? '👋 Sois le premier à écrire dans le salon commun, ou joins un fichier (même un <code>.zip</code>).'
      : `👋 Débute une conversation privée avec ${escapeHtml(chatActiveThread)}.`;
    container.innerHTML = `<div class="ia-welcome">${hint}</div>`;
    return;
  }
  list.forEach((entry) => renderChatEntry(entry));
  container.scrollTop = container.scrollHeight;
}
function pushChatEntry(thread, entry) {
  if (!chatThreads[thread]) chatThreads[thread] = [];
  chatThreads[thread].push(entry);
  if (chatActiveThread === thread) {
    renderChatEntry(entry);
    el('chatMessages').scrollTop = el('chatMessages').scrollHeight;
  } else if (entry.type !== 'system') {
    chatUnread[thread] = true;
  }
  renderChatThreadsBar();
}
function renderChatEntry(entry) {
  const container = el('chatMessages');
  const placeholder = container.querySelector('.ia-welcome');
  if (placeholder) placeholder.remove();

  if (entry.type === 'system') {
    const div = document.createElement('div');
    div.className = 'chat-system-line';
    div.textContent = entry.text;
    container.appendChild(div);
    return;
  }

  if (entry.type === 'file') {
    const wrap = document.createElement('div');
    wrap.className = 'ia-msg ' + (entry.self ? 'user' : 'assistant');
    const badge = document.createElement('div');
    badge.className = 'ia-badge-mode';
    badge.textContent = entry.self ? 'Toi' : entry.from;
    const chip = document.createElement('a');
    chip.className = 'chat-file-chip';
    chip.href = entry.url;
    chip.download = entry.name;
    const isZip = /\.zip$/i.test(entry.name);
    chip.innerHTML = `<span class="cf-icon">${isZip ? '🗜' : '📎'}</span><span class="cf-name">${escapeHtml(entry.name)}</span><span class="cf-size">${formatFileSize(entry.size)} · télécharger</span>`;
    wrap.appendChild(badge);
    wrap.appendChild(chip);
    container.appendChild(wrap);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ia-msg ' + (entry.self ? 'user' : 'assistant');
  const badge = document.createElement('div');
  badge.className = 'ia-badge-mode';
  badge.textContent = entry.self ? 'Toi' : entry.from;
  const bubble = document.createElement('div');
  bubble.className = 'ia-bubble';
  bubble.textContent = entry.text;
  wrap.appendChild(badge);
  wrap.appendChild(bubble);
  container.appendChild(wrap);
}
function appendChatSystem(text) {
  pushChatEntry('room', { type: 'system', text, ts: Date.now() });
}
function sendChatMessage() {
  const text = el('chatInput').value.trim();
  if (!text || !chatWs || chatWs.readyState !== WebSocket.OPEN) return;
  if (chatActiveThread === 'room') {
    chatWs.send(JSON.stringify({ type: 'chat', text }));
    pushChatEntry('room', { type: 'chat', from: chatConnectedPseudo, text, ts: Date.now(), self: true });
  } else {
    chatWs.send(JSON.stringify({ type: 'dm', to: chatActiveThread, text }));
    pushChatEntry(chatActiveThread, { type: 'chat', from: chatConnectedPseudo, text, ts: Date.now(), self: true });
  }
  el('chatInput').value = '';
}
function sendChatFile(file) {
  if (!chatWs || chatWs.readyState !== WebSocket.OPEN) return;
  if (file.size > 50 * 1024 * 1024) {
    appendChatSystem('⚠ Fichier trop volumineux (max 50 Mo).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    chatWs.send(JSON.stringify({ type: 'file_start', name: file.name, size: file.size, mime: file.type }));
    chatWs.send(reader.result);
    pushChatEntry('room', { type: 'file', from: chatConnectedPseudo, name: file.name, size: file.size, url: URL.createObjectURL(file), self: true });
  };
  reader.readAsArrayBuffer(file);
}
function bindChatBubbleEvents() {
  el('chatBubbleBtn').onclick = () => { chatDrawerOpen ? closeChatDrawer() : openChatDrawer(); };
  el('chatCloseDrawerBtn').onclick = closeChatDrawer;
  el('chatDrawerOverlay').onclick = closeChatDrawer;

  el('chatLoginBtn').onclick = () => {
    const pseudo = el('chatPseudoInput').value.trim();
    const password = el('chatPasswordInput').value;
    if (!pseudo || !password) { setChatAuthStatus('Pseudo et mot de passe requis.', true); return; }
    connectChatSocket(() => {
      chatWs.send(JSON.stringify({ type: 'login', pseudo, password }));
    });
  };

  el('chatRegisterBtn').onclick = () => {
    const pseudo = el('chatPseudoInput').value.trim();
    const password = el('chatPasswordInput').value;
    if (!pseudo || !password) { setChatAuthStatus('Pseudo et mot de passe requis.', true); return; }
    connectChatSocket(() => {
      chatWs.send(JSON.stringify({ type: 'register', pseudo, password }));
    });
  };

  el('chatLogoutBtn').onclick = () => {
    if (chatWs) { try { chatWs.close(); } catch (e) {} }
    chatWs = null;
    chatConnectedPseudo = null;
    chatThreads = { room: [] };
    chatActiveThread = 'room';
    chatUnread = {};
    chatOnlineUsers = [];
    el('chatThreadsBar').innerHTML = '';
    el('chatMessages').innerHTML = '<div class="ia-welcome">👋 Reconnecte-toi pour continuer à discuter.</div>';
    el('chatRoomPanel').classList.add('hidden');
    el('chatAuthPanel').classList.remove('hidden');
    el('chatLogoutBtn').classList.add('hidden');
    setChatAuthStatus('', false);
  };

  el('chatSendBtn').onclick = sendChatMessage;
  el('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  el('chatAttachBtn').onclick = () => {
    if (chatActiveThread !== 'room') return;
    el('chatFileInput').click();
  };
  el('chatFileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) sendChatFile(file);
    e.target.value = '';
  };
}
