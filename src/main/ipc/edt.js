'use strict';
// IPC : emploi du temps (import iCal, cache local).

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { WORKSPACE_DIR } = require('../core/paths');
const { getMainWindow } = require('../core/window');

// ---------- IPC : Emploi du temps (import iCal, cache local, sans dépendre du site) ----------

const EDT_CACHE_FILE = path.join(WORKSPACE_DIR, 'edt-cache.json');

function readEdtCache() {
  try {
    if (!fs.existsSync(EDT_CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(EDT_CACHE_FILE, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function writeEdtCache(data) {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  fs.writeFileSync(EDT_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// RFC 5545 : une ligne commençant par un espace/tab est la suite de la ligne précédente
function unfoldIcsLines(text) {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length) {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcsText(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Accepte "20260901T081500Z" (horodaté) ou "20260817" (jour entier, ex: vacances)
function parseIcsDate(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { dateOnly: true, iso: `${y}-${mo}-${d}` };
  return { dateOnly: false, iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}` };
}

function parseIcsCourses(icsText) {
  const lines = unfoldIcsLines(icsText);
  const events = [];
  const holidays = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        if (cur.dtstartDateOnly) {
          holidays.push({ label: cur.summary || 'Vacances', start: cur.dtstartIso, end: cur.dtendIso || cur.dtstartIso });
        } else if (cur.dtstartIso && cur.dtendIso) {
          events.push({
            uid: cur.uid || `${cur.dtstartIso}-${cur.summary}`,
            title: cur.matiere || cur.summary || 'Cours',
            teacher: cur.enseignant || '',
            room: cur.salle || cur.location || '',
            start: cur.dtstartIso,
            end: cur.dtendIso
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    let key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const semi = key.indexOf(';');
    if (semi !== -1) key = key.slice(0, semi);
    if (key === 'UID') cur.uid = value;
    else if (key === 'SUMMARY') cur.summary = unescapeIcsText(value);
    else if (key === 'LOCATION') cur.location = unescapeIcsText(value);
    else if (key === 'DTSTART') {
      const p = parseIcsDate(value);
      if (p) { cur.dtstartIso = p.iso; cur.dtstartDateOnly = p.dateOnly; }
    } else if (key === 'DTEND') {
      const p = parseIcsDate(value);
      if (p) cur.dtendIso = p.iso;
    } else if (key === 'DESCRIPTION') {
      const desc = unescapeIcsText(value);
      const matiereM = desc.match(/Matière\s*:\s*([^\n]+)/i);
      const ensM = desc.match(/Enseignants?\s*:\s*([^\n]+)/i);
      const salleM = desc.match(/Salles?\s*:\s*([^\n]+)/i);
      if (matiereM) cur.matiere = matiereM[1].trim();
      if (ensM) cur.enseignant = ensM[1].trim();
      if (salleM) cur.salle = salleM[1].trim();
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  holidays.sort((a, b) => a.start.localeCompare(b.start));
  return { events, holidays };
}

function register() {

  ipcMain.handle('edt:importIcsDialog', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Calendrier iCal', extensions: ['ics'] }]
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    try {
      const raw = fs.readFileSync(res.filePaths[0], 'utf-8');
      const { events, holidays } = parseIcsCourses(raw);
      if (!events.length) {
        return { ok: false, error: 'Aucun cours trouvé dans ce fichier (vérifie que c\'est bien le bon lien iCal).' };
      }
      const data = {
        importedAt: new Date().toISOString(),
        sourceFileName: path.basename(res.filePaths[0]),
        events,
        holidays
      };
      writeEdtCache(data);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('edt:getCache', () => readEdtCache());
}

module.exports = { register };
