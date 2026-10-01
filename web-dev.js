// =====================================================================
// StudyIDE — module "Développement Web" (processus principal)
//  - Terminaux (vrai pseudo-terminal via node-pty, repli sur pipes)
//  - Détection de framework / scripts / dépendances d'un projet
//  - Gestionnaire de serveurs de dev (start / stop / logs / URL détectée)
//  - Serveur statique avec rechargement automatique (live reload)
//  - Gestion des dépendances (npm / yarn / pnpm / bun) et templates
// =====================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';

// node-pty est un module natif : s'il manque ou n'est pas compilé pour
// Electron, on retombe automatiquement sur l'ancien mode (pipes).
let pty = null;
let ptyError = null;
let ptyTried = false;
function getPty() {
  if (!ptyTried) {
    ptyTried = true;
    try { pty = require('node-pty'); } catch (e) { ptyError = e.message; }
  }
  return pty;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const stripAnsi = (s) => s.replace(ANSI_RE, '');

module.exports = function registerWebDev({ ipcMain, dialog, getMainWindow, workspaceDir }) {
  const send = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // Regroupe les rafales de sortie (npm install, logs Vite…) : un message IPC
  // toutes les ~10 ms au lieu de plusieurs centaines par seconde.
  function makeBatcher(channel, extra, delay = 10) {
    let buf = '';
    let timer = null;
    const flush = () => {
      clearTimeout(timer);
      timer = null;
      if (!buf) return;
      const chunk = buf;
      buf = '';
      send(channel, { ...extra, chunk });
    };
    return {
      push(chunk) {
        buf += chunk;
        if (buf.length > 65536) flush();
        else if (!timer) timer = setTimeout(flush, delay);
      },
      flush
    };
  }

  // ===================================================================
  // TERMINAUX
  // ===================================================================
  const terminals = new Map(); // id -> { kind: 'pty'|'pipe', proc }
  let termSeq = 0;

  function defaultShell() {
    if (IS_WIN) return { cmd: process.env.COMSPEC || 'cmd.exe', args: [] };
    return { cmd: process.env.SHELL || '/bin/bash', args: ['-i'] };
  }

  function safeCwd(cwd) {
    return cwd && fs.existsSync(cwd) ? cwd : workspaceDir;
  }

  function startTerminal({ cwd, cols, rows }) {
    const id = `term-${++termSeq}`;
    const { cmd, args } = defaultShell();
    const dir = safeCwd(cwd);

    if (getPty()) {
      try {
        const proc = pty.spawn(cmd, args, {
          name: 'xterm-256color',
          cols: cols || 80,
          rows: rows || 24,
          cwd: dir,
          env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
        });
        terminals.set(id, { kind: 'pty', proc });
        const batch = makeBatcher('terminal:data', { id }, 8);
        proc.onData((chunk) => batch.push(chunk));
        proc.onExit(({ exitCode }) => {
          batch.flush(); // la sortie finale doit arriver avant l'événement de fin
          terminals.delete(id);
          send('terminal:exit', { id, code: exitCode });
        });
        return { ok: true, id, mode: 'pty', shell: path.basename(cmd) };
      } catch (e) {
        ptyError = e.message; // on retombe sur le mode pipe ci-dessous
      }
    }

    const proc = spawn(cmd, args, { cwd: dir, env: process.env, windowsHide: true });
    terminals.set(id, { kind: 'pipe', proc });
    const pipeBatch = makeBatcher('terminal:data', { id }, 8);
    proc.stdout.on('data', (d) => pipeBatch.push(d.toString()));
    proc.stderr.on('data', (d) => pipeBatch.push(d.toString()));
    proc.on('exit', (code) => {
      pipeBatch.flush();
      terminals.delete(id);
      send('terminal:exit', { id, code });
    });
    return { ok: true, id, mode: 'pipe', shell: path.basename(cmd), warning: ptyError };
  }

  function writeTerminal(id, data) {
    const t = terminals.get(id);
    if (!t) return { ok: false, error: 'Terminal introuvable.' };
    try {
      if (t.kind === 'pty') t.proc.write(data);
      else t.proc.stdin.write(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  ipcMain.handle('terminal:start', (evt, opts) => startTerminal(opts || {}));
  ipcMain.handle('terminal:write', (evt, { id, data }) => writeTerminal(id, data));
  // Frappes clavier : canal "send" (sans aller-retour) pour rester réactif
  ipcMain.on('terminal:input', (evt, { id, data }) => { writeTerminal(id, data); });
  ipcMain.on('terminal:resize', (evt, { id, cols, rows }) => {
    const t = terminals.get(id);
    if (t && t.kind === 'pty' && cols > 0 && rows > 0) {
      try { t.proc.resize(Math.floor(cols), Math.floor(rows)); } catch (e) { /* ignoré */ }
    }
  });
  ipcMain.handle('terminal:kill', (evt, { id }) => {
    const t = terminals.get(id);
    if (t) {
      try { t.proc.kill(); } catch (e) { /* ignoré */ }
      terminals.delete(id);
    }
    return { ok: true };
  });
  ipcMain.handle('terminal:info', () => ({ pty: !!getPty(), error: ptyError }));

  // ===================================================================
  // DÉTECTION DE PROJET (framework, scripts, dépendances)
  // ===================================================================
  const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return null; } };
  const exists = (dir, name) => fs.existsSync(path.join(dir, name));

  function detectPackageManager(dir) {
    if (exists(dir, 'pnpm-lock.yaml')) return 'pnpm';
    if (exists(dir, 'yarn.lock')) return 'yarn';
    if (exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')) return 'bun';
    return 'npm';
  }

  function pmRunCommand(pm, script) {
    if (pm === 'yarn') return `yarn ${script}`;
    if (pm === 'pnpm') return `pnpm run ${script}`;
    if (pm === 'bun') return `bun run ${script}`;
    return `npm run ${script}`;
  }

  function pmDepCommand(pm, action, packages, dev) {
    const pk = (packages || []).join(' ');
    const table = {
      npm:  { install: 'npm install', add: `npm install ${dev ? '-D ' : ''}${pk}`, remove: `npm uninstall ${pk}`, update: 'npm update' },
      yarn: { install: 'yarn install', add: `yarn add ${dev ? '-D ' : ''}${pk}`, remove: `yarn remove ${pk}`, update: 'yarn upgrade' },
      pnpm: { install: 'pnpm install', add: `pnpm add ${dev ? '-D ' : ''}${pk}`, remove: `pnpm remove ${pk}`, update: 'pnpm update' },
      bun:  { install: 'bun install', add: `bun add ${dev ? '-d ' : ''}${pk}`, remove: `bun remove ${pk}`, update: 'bun update' }
    };
    return (table[pm] || table.npm)[action];
  }

  // Ordre important : le premier match gagne (les méta-frameworks avant les libs)
  const FRAMEWORKS = [
    { id: 'nextjs',    label: 'Next.js',        icon: '▲',  deps: ['next'],                                            port: 3000 },
    { id: 'nuxt',      label: 'Nuxt',           icon: '💚', deps: ['nuxt', 'nuxt3'],                                   port: 3000 },
    { id: 'astro',     label: 'Astro',          icon: '🚀', deps: ['astro'],                                           port: 4321 },
    { id: 'sveltekit', label: 'SvelteKit',      icon: '🔥', deps: ['@sveltejs/kit'],                                   port: 5173 },
    { id: 'remix',     label: 'Remix / React Router', icon: '💿', deps: ['@remix-run/dev', '@react-router/dev'],       port: 5173 },
    { id: 'angular',   label: 'Angular',        icon: '🅰',  deps: ['@angular/core'],                                   port: 4200 },
    { id: 'nestjs',    label: 'NestJS',         icon: '🐈', deps: ['@nestjs/core'],                                    port: 3000, dev: ['start:dev', 'start'] },
    { id: 'svelte',    label: 'Svelte',         icon: '🧡', deps: ['svelte'],                                          port: 5173 },
    { id: 'vue',       label: 'Vue',            icon: '💚', deps: ['vue'],                                             port: 5173 },
    { id: 'solid',     label: 'SolidJS',        icon: '🔷', deps: ['solid-js'],                                        port: 5173 },
    { id: 'react-cra', label: 'React (CRA)',    icon: '⚛',  deps: ['react-scripts'],                                   port: 3000 },
    { id: 'react',     label: 'React',          icon: '⚛',  deps: ['react'],                                           port: 5173 },
    { id: 'express',   label: 'Express',        icon: '🚂', deps: ['express'],                                         port: 3000 },
    { id: 'fastify',   label: 'Fastify',        icon: '⚡', deps: ['fastify'],                                         port: 3000 },
    { id: 'koa',       label: 'Koa',            icon: '🌊', deps: ['koa'],                                             port: 3000 },
    { id: 'vite',      label: 'Vite',           icon: '⚡', deps: ['vite'],                                            port: 5173 }
  ];

  function findDevScript(scripts, preferred) {
    const order = preferred || ['dev', 'start', 'serve', 'develop'];
    return order.find((n) => scripts[n]) || null;
  }

  function detectProject(dir) {
    const info = {
      ok: true, root: dir, name: path.basename(dir),
      kind: 'empty', pm: 'npm', framework: null,
      scripts: [], devCommand: null, needsInstall: false, deps: []
    };
    if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'Dossier introuvable.' };

    const pkg = readJSON(path.join(dir, 'package.json'));
    if (pkg) {
      info.kind = 'node';
      info.name = pkg.name || info.name;
      info.pm = detectPackageManager(dir);
      const dependencies = pkg.dependencies || {};
      const devDependencies = pkg.devDependencies || {};
      const all = { ...devDependencies, ...dependencies };
      info.deps = [
        ...Object.entries(dependencies).map(([name, version]) => ({ name, version, dev: false })),
        ...Object.entries(devDependencies).map(([name, version]) => ({ name, version, dev: true }))
      ];
      const fw = FRAMEWORKS.find((f) => f.deps.some((d) => all[d]));
      if (fw) {
        const label = fw.id === 'react' && all.vite ? 'React (Vite)' : fw.label;
        info.framework = { id: fw.id, label, icon: fw.icon, port: fw.port };
      }
      const scripts = pkg.scripts || {};
      const devName = findDevScript(scripts, fw && fw.dev);
      info.scripts = Object.entries(scripts).map(([name, command]) => ({ name, command, isDev: name === devName }));
      if (devName) info.devCommand = pmRunCommand(info.pm, devName);
      info.needsInstall = !exists(dir, 'node_modules');
      return info;
    }

    if (exists(dir, 'manage.py')) {
      info.kind = 'python';
      info.framework = { id: 'django', label: 'Django', icon: '🎸', port: 8000 };
      info.devCommand = `${IS_WIN ? 'python' : 'python3'} manage.py runserver`;
      return info;
    }
    const req = (() => { try { return fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf-8').toLowerCase(); } catch (e) { return ''; } })();
    if (req.includes('flask') && (exists(dir, 'app.py') || exists(dir, 'wsgi.py'))) {
      info.kind = 'python';
      info.framework = { id: 'flask', label: 'Flask', icon: '🧪', port: 5000 };
      info.devCommand = `${IS_WIN ? 'python' : 'python3'} -m flask run`;
      return info;
    }
    if (exists(dir, 'composer.json') || exists(dir, 'index.php')) {
      info.kind = 'php';
      info.framework = { id: 'php', label: 'PHP', icon: '🐘', port: 8000 };
      info.devCommand = 'php -S localhost:8000';
      return info;
    }
    let hasHtml = false;
    try { hasHtml = fs.readdirSync(dir).some((f) => /\.html?$/i.test(f)); } catch (e) { /* ignoré */ }
    if (hasHtml) {
      info.kind = 'static';
      info.framework = { id: 'static', label: 'HTML / CSS / JS', icon: '🌐', port: 5500 };
    }
    return info;
  }

  ipcMain.handle('web:detect', (evt, dir) => {
    try { return detectProject(dir); } catch (e) { return { ok: false, error: e.message }; }
  });

  // ===================================================================
  // GESTIONNAIRE DE SERVEURS
  // ===================================================================
  const servers = new Map(); // id -> entry
  let serverSeq = 0;
  const MAX_LOG_CHARS = 200000;

  const publicEntry = (e) => ({
    id: e.id, name: e.name, cwd: e.cwd, command: e.command, kind: e.kind,
    status: e.status, url: e.url, port: e.port, startedAt: e.startedAt, exitCode: e.exitCode
  });
  const emitUpdate = (e) => send('web:server-update', publicEntry(e));

  function appendLog(e, chunk) {
    e.logs += chunk;
    if (e.logs.length > MAX_LOG_CHARS * 1.25) e.logs = e.logs.slice(e.logs.length - MAX_LOG_CHARS);
    if (!e.batch) e.batch = makeBatcher('web:server-log', { id: e.id }, 16);
    e.batch.push(chunk);
  }

  function probePort(port, timeoutMs = 60000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const attempt = () => {
        const sock = net.connect({ host: 'localhost', port });
        sock.setTimeout(1500);
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        const retry = () => {
          sock.destroy();
          if (Date.now() - start > timeoutMs) resolve(false);
          else setTimeout(attempt, 500);
        };
        sock.once('error', retry);
        sock.once('timeout', retry);
      };
      attempt();
    });
  }

  const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})[^\s"')\]]*/i;
  const PORT_RE = /(?:listening|running|started|serving|ready)[^\n]{0,40}?(?:port|:)\s*(\d{3,5})/i;

  function detectUrlFromOutput(e, text) {
    if (e.url) return;
    const clean = stripAnsi(text);
    let port = null;
    const m = URL_RE.exec(clean);
    if (m) port = Number(m[1]);
    else {
      const p = PORT_RE.exec(clean);
      if (p) port = Number(p[1]);
    }
    if (!port) return;
    e.port = port;
    e.url = `http://localhost:${port}`;
    emitUpdate(e);
    probePort(port).then((up) => {
      if (!servers.has(e.id) || e.status === 'stopped' || e.status === 'error') return;
      if (up) { e.status = 'running'; emitUpdate(e); }
    });
  }

  function killTree(proc) {
    return new Promise((resolve) => {
      if (!proc || proc.exitCode !== null) return resolve();
      const done = () => resolve();
      proc.once('exit', done);
      try {
        if (IS_WIN) execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
        else {
          try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) { proc.kill('SIGTERM'); }
          setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { /* déjà terminé */ } }, 3000);
        }
      } catch (e) { resolve(); }
      setTimeout(resolve, 4000);
    });
  }

  function startProcessServer({ cwd, command, name, port }) {
    const id = `srv-${++serverSeq}`;
    const entry = {
      id, name: name || command, cwd, command, kind: 'process',
      status: 'starting', url: null, port: null, startedAt: Date.now(),
      exitCode: null, logs: '', proc: null
    };
    servers.set(id, entry);
    const env = { ...process.env, FORCE_COLOR: '1', BROWSER: 'none', NG_CLI_ANALYTICS: 'false' };
    if (port) env.PORT = String(port);

    appendLog(entry, `\x1b[90m$ ${command}\x1b[0m\r\n`);
    let proc;
    try {
      proc = spawn(command, { cwd: safeCwd(cwd), env, shell: true, detached: !IS_WIN, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      entry.status = 'error';
      appendLog(entry, `\x1b[31mImpossible de lancer la commande : ${e.message}\x1b[0m\r\n`);
      emitUpdate(entry);
      return publicEntry(entry);
    }
    entry.proc = proc;
    const onData = (d) => {
      const text = d.toString();
      appendLog(entry, text);
      detectUrlFromOutput(entry, text);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      entry.status = 'error';
      appendLog(entry, `\r\n\x1b[31m${err.message}\x1b[0m\r\n`);
      emitUpdate(entry);
    });
    proc.on('exit', (code, signal) => {
      entry.exitCode = code;
      if (entry.status !== 'stopped') entry.status = (code === 0 || signal) ? 'stopped' : 'error';
      appendLog(entry, `\r\n\x1b[90m[processus terminé, code ${code === null ? signal : code}]\x1b[0m\r\n`);
      entry.batch.flush();
      emitUpdate(entry);
    });
    emitUpdate(entry);
    return publicEntry(entry);
  }

  // ---------- Serveur statique + live reload ----------
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.wasm': 'application/wasm',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
    '.map': 'application/json'
  };
  const RELOAD_SNIPPET = "<script>(function(){try{var es=new EventSource('/__studyide_reload');es.onmessage=function(){location.reload();};}catch(e){}})();</script>";
  const WATCH_IGNORE = /(^|[\\/])(node_modules|\.git|\.idea|\.vscode)([\\/]|$)/;

  async function startStaticServer({ cwd, name }) {
    const id = `srv-${++serverSeq}`;
    const root = path.resolve(cwd);
    const entry = {
      id, name: name || 'Serveur statique', cwd: root, command: 'Serveur statique (live reload)', kind: 'static',
      status: 'starting', url: null, port: null, startedAt: Date.now(), exitCode: null, logs: '', stopFn: null
    };
    servers.set(id, entry);
    const clients = new Set();

    const httpServer = http.createServer((req, res) => {
      let urlPath;
      try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('Bad request'); }

      if (urlPath === '/__studyide_reload') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('retry: 500\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      let filePath = path.normalize(path.join(root, urlPath));
      if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
        if (!fs.existsSync(filePath)) {
          appendLog(entry, `\x1b[33m404\x1b[0m ${req.method} ${urlPath}\r\n`);
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 — fichier introuvable');
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        if (ext === '.html' || ext === '.htm') {
          let html = fs.readFileSync(filePath, 'utf-8');
          html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, RELOAD_SNIPPET + '</body>') : html + RELOAD_SNIPPET;
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
          res.end(html);
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
          fs.createReadStream(filePath).on('error', () => res.end()).pipe(res);
        }
        appendLog(entry, `\x1b[32m200\x1b[0m ${req.method} ${urlPath}\r\n`);
      } catch (e) {
        res.writeHead(500); res.end('Erreur serveur');
      }
    });

    // Cherche un port libre à partir de 5500
    const listenOn = (port) => new Promise((resolve, reject) => {
      const onError = (err) => {
        httpServer.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && port < 5600) resolve(listenOn(port + 1));
        else reject(err);
      };
      const onListening = () => { httpServer.removeListener('error', onError); resolve(port); };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, '127.0.0.1');
    });

    try {
      entry.port = await listenOn(5500);
    } catch (e) {
      entry.status = 'error';
      appendLog(entry, `\x1b[31mImpossible de démarrer : ${e.message}\x1b[0m\r\n`);
      emitUpdate(entry);
      return publicEntry(entry);
    }

    let watcher = null;
    let timer = null;
    const onChange = (evt, filename) => {
      if (filename && WATCH_IGNORE.test(String(filename))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        appendLog(entry, `\x1b[36m↻ rechargement\x1b[0m ${filename || ''}\r\n`);
        for (const c of clients) { try { c.write('data: reload\n\n'); } catch (e) { /* client parti */ } }
      }, 150);
    };
    try { watcher = fs.watch(root, { recursive: true }, onChange); }
    catch (e) {
      try { watcher = fs.watch(root, onChange); } catch (e2) { appendLog(entry, '\x1b[33mLive reload indisponible sur ce système.\x1b[0m\r\n'); }
    }

    entry.stopFn = () => new Promise((resolve) => {
      clearTimeout(timer);
      if (watcher) { try { watcher.close(); } catch (e) { /* ignoré */ } }
      for (const c of clients) { try { c.end(); } catch (e) { /* ignoré */ } }
      httpServer.close(() => resolve());
      setTimeout(resolve, 500);
    });

    entry.url = `http://localhost:${entry.port}`;
    entry.status = 'running';
    appendLog(entry, `\x1b[32m✔ Serveur statique en ligne sur ${entry.url}\x1b[0m\r\n\x1b[90mDossier : ${root}\x1b[0m\r\n`);
    emitUpdate(entry);
    return publicEntry(entry);
  }

  async function stopServer(id) {
    const e = servers.get(id);
    if (!e) return { ok: false, error: 'Serveur introuvable.' };
    e.status = 'stopped';
    if (e.kind === 'static' && e.stopFn) await e.stopFn();
    else if (e.proc) await killTree(e.proc);
    e.url = null;
    emitUpdate(e);
    return { ok: true };
  }

  ipcMain.handle('web:startServer', (evt, opts) => {
    if (!opts || !opts.cwd || !opts.command) return { ok: false, error: 'Paramètres manquants.' };
    return { ok: true, server: startProcessServer(opts) };
  });
  ipcMain.handle('web:startStatic', async (evt, opts) => {
    if (!opts || !opts.cwd || !fs.existsSync(opts.cwd)) return { ok: false, error: 'Dossier introuvable.' };
    return { ok: true, server: await startStaticServer(opts) };
  });
  ipcMain.handle('web:stopServer', (evt, { id }) => stopServer(id));
  ipcMain.handle('web:restartServer', async (evt, { id }) => {
    const e = servers.get(id);
    if (!e) return { ok: false, error: 'Serveur introuvable.' };
    const { cwd, command, name, kind } = e;
    await stopServer(id);
    servers.delete(id);
    send('web:server-removed', { id });
    const server = kind === 'static' ? await startStaticServer({ cwd, name }) : startProcessServer({ cwd, command, name });
    return { ok: true, server };
  });
  ipcMain.handle('web:removeServer', async (evt, { id }) => {
    const e = servers.get(id);
    if (e && (e.status === 'starting' || e.status === 'running')) await stopServer(id);
    servers.delete(id);
    return { ok: true };
  });
  ipcMain.handle('web:listServers', () => [...servers.values()].map(publicEntry));
  ipcMain.handle('web:getServerLogs', (evt, { id }) => {
    const e = servers.get(id);
    return e ? e.logs : '';
  });

  // ===================================================================
  // DÉPENDANCES (install / add / remove / update)
  // ===================================================================
  const PKG_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\w.^~<>=*|-]+)?$/i;

  ipcMain.handle('web:npm', (evt, { cwd, action, packages, dev }) => {
    return new Promise((resolve) => {
      if (!cwd || !fs.existsSync(path.join(cwd, 'package.json'))) return resolve({ ok: false, error: 'Aucun package.json dans ce dossier.' });
      if (!['install', 'add', 'remove', 'update'].includes(action)) return resolve({ ok: false, error: 'Action inconnue.' });
      const pkgs = Array.isArray(packages) ? packages.map((p) => String(p).trim()).filter(Boolean) : [];
      if ((action === 'add' || action === 'remove') && !pkgs.length) return resolve({ ok: false, error: 'Indique au moins un paquet.' });
      if (pkgs.some((p) => !PKG_NAME_RE.test(p))) return resolve({ ok: false, error: 'Nom de paquet invalide.' });

      const command = pmDepCommand(detectPackageManager(cwd), action, pkgs, !!dev);
      const taskId = `task-${Date.now()}`;
      send('web:task-log', { taskId, chunk: `\x1b[90m$ ${command}\x1b[0m\r\n` });
      const proc = spawn(command, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' }, windowsHide: true });
      proc.stdout.on('data', (d) => send('web:task-log', { taskId, chunk: d.toString() }));
      proc.stderr.on('data', (d) => send('web:task-log', { taskId, chunk: d.toString() }));
      proc.on('error', (err) => resolve({ ok: false, error: err.message, taskId, command }));
      proc.on('exit', (code) => resolve({ ok: code === 0, code, taskId, command }));
    });
  });

  // ===================================================================
  // TEMPLATES DE PROJET
  // ===================================================================
  const TEMPLATES = [
    { id: 'static',  label: 'HTML / CSS / JS', icon: '🌐', kind: 'files', desc: 'Page statique prête à ouvrir (avec live reload).' },
    { id: 'express', label: 'Node + Express',  icon: '🚂', kind: 'files', desc: 'Petit serveur Express + dossier public.' },
    { id: 'vite-react',  label: 'React (Vite)',   icon: '⚛',  kind: 'command', command: (n) => `npm create vite@latest ${n} -- --template react`,  desc: 'Nécessite Internet. Le terminal te posera les questions.' },
    { id: 'vite-react-ts', label: 'React + TypeScript (Vite)', icon: '⚛', kind: 'command', command: (n) => `npm create vite@latest ${n} -- --template react-ts`, desc: 'Nécessite Internet.' },
    { id: 'vite-vue',    label: 'Vue (Vite)',     icon: '💚', kind: 'command', command: (n) => `npm create vite@latest ${n} -- --template vue`,    desc: 'Nécessite Internet.' },
    { id: 'vite-svelte', label: 'Svelte (Vite)',  icon: '🧡', kind: 'command', command: (n) => `npm create vite@latest ${n} -- --template svelte`, desc: 'Nécessite Internet.' },
    { id: 'vite-vanilla', label: 'JavaScript (Vite)', icon: '⚡', kind: 'command', command: (n) => `npm create vite@latest ${n} -- --template vanilla`, desc: 'Nécessite Internet.' },
    { id: 'next',    label: 'Next.js',   icon: '▲',  kind: 'command', command: (n) => `npx create-next-app@latest ${n}`, desc: 'Nécessite Internet.' },
    { id: 'nuxt',    label: 'Nuxt',      icon: '💚', kind: 'command', command: (n) => `npx nuxi@latest init ${n}`,       desc: 'Nécessite Internet.' },
    { id: 'astro',   label: 'Astro',     icon: '🚀', kind: 'command', command: (n) => `npm create astro@latest ${n}`,    desc: 'Nécessite Internet.' },
    { id: 'angular', label: 'Angular',   icon: '🅰',  kind: 'command', command: (n) => `npx @angular/cli@latest new ${n}`, desc: 'Nécessite Internet.' }
  ];

  const TEMPLATE_FILES = {
    static: (name) => ({
      'index.html': `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main>\n    <h1>${name}</h1>\n    <p>Modifie ce fichier : la page se recharge toute seule.</p>\n    <button id="btn">Clique-moi</button>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
      'style.css': `* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n  background: #1e1f24;\n  color: #e6e6e6;\n}\nmain { text-align: center; }\nbutton {\n  padding: 10px 18px;\n  border: 0;\n  border-radius: 8px;\n  background: #6c8cff;\n  color: #fff;\n  cursor: pointer;\n}\n`,
      'script.js': `const btn = document.getElementById('btn');\nlet count = 0;\nbtn.addEventListener('click', () => {\n  count++;\n  btn.textContent = \`Cliqué \${count} fois\`;\n});\n`
    }),
    express: (name) => ({
      'package.json': JSON.stringify({
        name: name.toLowerCase(), version: '1.0.0', private: true,
        scripts: { start: 'node server.js', dev: 'node --watch server.js' },
        dependencies: { express: '^4.19.2' }
      }, null, 2) + '\n',
      'server.js': `const express = require('express');\nconst path = require('path');\n\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\napp.use(express.static(path.join(__dirname, 'public')));\n\napp.get('/api/hello', (req, res) => {\n  res.json({ message: 'Bonjour depuis Express 👋' });\n});\n\napp.listen(PORT, () => {\n  console.log(\`Serveur lancé sur http://localhost:\${PORT}\`);\n});\n`,
      'public/index.html': `<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8" />\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n  <pre id="out">Chargement…</pre>\n  <script>\n    fetch('/api/hello').then(r => r.json()).then(d => {\n      document.getElementById('out').textContent = JSON.stringify(d, null, 2);\n    });\n  </script>\n</body>\n</html>\n`,
      '.gitignore': 'node_modules\n'
    })
  };

  ipcMain.handle('web:templates', () => TEMPLATES.map(({ id, label, icon, kind, desc }) => ({ id, label, icon, kind, desc })));

  ipcMain.handle('web:pickFolder', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('web:scaffold', (evt, { templateId, name, parentDir }) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return { ok: false, error: 'Template inconnu.' };
    const safeName = String(name || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) return { ok: false, error: 'Nom invalide (lettres, chiffres, . _ - uniquement).' };
    if (!parentDir || !fs.existsSync(parentDir)) return { ok: false, error: 'Dossier parent introuvable.' };

    if (tpl.kind === 'command') {
      return { ok: true, kind: 'command', command: tpl.command(safeName), cwd: parentDir, projectPath: path.join(parentDir, safeName) };
    }
    const target = path.join(parentDir, safeName);
    if (fs.existsSync(target)) return { ok: false, error: 'Un dossier porte déjà ce nom.' };
    try {
      const files = TEMPLATE_FILES[tpl.id](safeName);
      for (const [rel, content] of Object.entries(files)) {
        const full = path.join(target, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
      }
      return { ok: true, kind: 'files', projectPath: target, name: safeName };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ===================================================================
  // NETTOYAGE À LA FERMETURE
  // ===================================================================
  function killAll() {
    for (const t of terminals.values()) { try { t.proc.kill(); } catch (e) { /* ignoré */ } }
    terminals.clear();
    for (const e of servers.values()) {
      try {
        if (e.kind === 'static' && e.stopFn) e.stopFn();
        else if (e.proc && e.proc.exitCode === null) {
          if (IS_WIN) execFile('taskkill', ['/pid', String(e.proc.pid), '/T', '/F'], () => {});
          else process.kill(-e.proc.pid, 'SIGTERM');
        }
      } catch (err) { /* ignoré */ }
    }
  }

  return { killAll };
};
