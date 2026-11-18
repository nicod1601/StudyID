'use strict';
// Exécution de commandes externes (VBoxManage, virsh, docker…) : jamais de shell, arguments passés en tableau,
// délai maximum, sortie décodée (WSL écrit en UTF-16).

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';

function decode(buf, encoding) {
  if (!buf) return '';
  const text = Buffer.isBuffer(buf) ? buf.toString(encoding === 'utf16le' ? 'utf16le' : 'utf8') : String(buf);
  return text.replace(/\u0000/g, '').replace(/^﻿/, '');
}

function run(file, args = [], { timeout = 15000, encoding = 'utf8' } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' }, (err, stdout, stderr) => {
      let error = null;
      if (err) error = err.killed ? 'Délai dépassé' : err.code === 'ENOENT' ? 'Commande introuvable' : null;
      resolve({
        ok: !err,
        code: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
        stdout: decode(stdout, encoding),
        stderr: decode(stderr, encoding),
        error
      });
    });
  });
}

// Cherche un exécutable dans le PATH, puis dans des dossiers d'installation connus (pas toujours dans le PATH sous Windows).
const cache = new Map();
function findBinary(names, extraDirs = []) {
  const key = names.join('|') + '#' + extraDirs.join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.value;
  const exts = IS_WIN ? ['.exe', '.cmd', '.bat'] : [''];
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  let found = null;
  outer: for (const [dirs, inPath] of [[pathDirs, true], [extraDirs, false]]) {
    for (const dir of dirs) {
      for (const name of names) {
        for (const ext of exts) {
          const p = path.join(dir, name + ext);
          try { if (fs.statSync(p).isFile()) { found = { name, path: p, inPath }; break outer; } } catch (e) { /* suivant */ }
        }
      }
    }
  }
  cache.set(key, { at: Date.now(), value: found });
  return found;
}

// Chaîne PowerShell entre apostrophes (les apostrophes sont doublées)
const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function powershell(script, opts = {}) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" + script], { timeout: 25000, ...opts });
}

module.exports = { IS_WIN, run, findBinary, powershell, psQuote };
