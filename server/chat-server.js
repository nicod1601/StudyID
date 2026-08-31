/**
 * Serveur de chat LAN pour StudyIDE
 * ----------------------------------
 * - Gère les comptes (pseudo + mot de passe en clair dans comptes.data)
 * - Relaie les messages de chat entre toutes les personnes connectées
 * - Relaie les fichiers (y compris .zip) : envoyés en direct, sans stockage serveur
 *
 * Lancement :
 *   cd server
 *   npm install
 *   npm start
 *
 * Les autres personnes se connectent depuis StudyIDE en entrant :
 *   <IP locale de ce PC>:4321
 * (trouve ton IP avec `ipconfig` sous Windows ou `ip addr` / `ifconfig` sous Linux/Mac)
 */

const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4321;
const ACCOUNTS_FILE = path.join(__dirname, 'comptes.data');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo — largement suffisant en LAN

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('⚠ comptes.data illisible, redémarrage avec une liste vide.', e);
    return [];
  }
}

function saveAccounts() {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

const accounts = loadAccounts(); // [{ pseudo, password }] — mot de passe en clair (choix assumé pour ce projet)
const clients = new Map();       // ws -> { pseudo }
const pendingFile = new Map();   // ws -> { name, size, mime }  (en attente du prochain frame binaire)

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, exceptWs) {
  const data = JSON.stringify(obj);
  for (const ws of clients.keys()) {
    if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastUsers() {
  const list = [...clients.values()].map((c) => c.pseudo).sort((a, b) => a.localeCompare(b));
  broadcast({ type: 'users', list });
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    // ---- Frame binaire = contenu d'un fichier annoncé juste avant ----
    if (isBinary) {
      const meta = pendingFile.get(ws);
      pendingFile.delete(ws);
      const client = clients.get(ws);
      if (!meta || !client) return;

      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length > MAX_FILE_SIZE) {
        send(ws, { type: 'error', message: 'Fichier trop volumineux (max 50 Mo).' });
        return;
      }

      const header = JSON.stringify({
        type: 'file_start',
        from: client.pseudo,
        name: meta.name,
        size: buf.length,
        mime: meta.mime,
        ts: Date.now()
      });
      for (const other of clients.keys()) {
        if (other !== ws && other.readyState === WebSocket.OPEN) {
          other.send(header);
          other.send(buf);
        }
      }
      return;
    }

    // ---- Message texte JSON ----
    let msg;
    try {
      msg = JSON.parse(data.toString('utf-8'));
    } catch (e) {
      return;
    }

    if (msg.type === 'register') {
      const pseudo = String(msg.pseudo || '').trim();
      const password = String(msg.password || '');
      if (!pseudo || pseudo.length > 40) {
        send(ws, { type: 'register_err', message: 'Pseudo invalide (1 à 40 caractères).' });
        return;
      }
      if (!password) {
        send(ws, { type: 'register_err', message: 'Mot de passe requis.' });
        return;
      }
      if (accounts.some((a) => a.pseudo.toLowerCase() === pseudo.toLowerCase())) {
        send(ws, { type: 'register_err', message: 'Ce pseudo est déjà pris.' });
        return;
      }
      accounts.push({ pseudo, password });
      saveAccounts();
      send(ws, { type: 'registered', pseudo });
      return;
    }

    if (msg.type === 'login') {
      const pseudo = String(msg.pseudo || '').trim();
      const password = String(msg.password || '');
      const account = accounts.find((a) => a.pseudo.toLowerCase() === pseudo.toLowerCase());
      if (!account || account.password !== password) {
        send(ws, { type: 'login_err', message: 'Pseudo ou mot de passe incorrect.' });
        return;
      }
      if ([...clients.values()].some((c) => c.pseudo.toLowerCase() === pseudo.toLowerCase())) {
        send(ws, { type: 'login_err', message: 'Ce compte est déjà connecté depuis un autre appareil.' });
        return;
      }
      clients.set(ws, { pseudo: account.pseudo });
      send(ws, { type: 'login_ok', pseudo: account.pseudo });
      broadcast({ type: 'system', text: `${account.pseudo} a rejoint le chat.`, ts: Date.now() }, ws);
      broadcastUsers();
      return;
    }

    // Tout le reste nécessite d'être authentifié
    const client = clients.get(ws);
    if (!client) {
      send(ws, { type: 'error', message: 'Connecte-toi avant d’envoyer un message.' });
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 4000);
      if (!text.trim()) return;
      broadcast({ type: 'chat', from: client.pseudo, text, ts: Date.now() });
      return;
    }

    if (msg.type === 'file_start') {
      const name = String(msg.name || 'fichier').slice(0, 200);
      const size = Number(msg.size) || 0;
      if (size > MAX_FILE_SIZE) {
        send(ws, { type: 'error', message: 'Fichier trop volumineux (max 50 Mo).' });
        return;
      }
      pendingFile.set(ws, { name, size, mime: msg.mime || 'application/octet-stream' });
      return;
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    clients.delete(ws);
    pendingFile.delete(ws);
    if (client) {
      broadcast({ type: 'system', text: `${client.pseudo} a quitté le chat.`, ts: Date.now() });
      broadcastUsers();
    }
  });

  ws.on('error', () => {
    clients.delete(ws);
    pendingFile.delete(ws);
  });
});

console.log(`💬 Serveur de chat StudyIDE en écoute sur le port ${PORT}`);
console.log(`   Comptes stockés dans : ${ACCOUNTS_FILE}`);
console.log(`   Donne ton IP locale (ex: 192.168.1.42:${PORT}) aux autres pour qu'ils se connectent depuis StudyIDE.`);
