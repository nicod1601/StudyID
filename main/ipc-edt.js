/**
 * IPC — emploi du temps : import d'un fichier iCal (.ics), mise en cache locale.
 *
 * On parse nous-mêmes le .ics (pas de dépendance) pour rester hors ligne :
 * une fois importé, le planning est relu depuis le cache sans toucher au site.
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const { PATHS } = require('./config');
const { readJson, writeJsonAtomic } = require('./store');
const { getMainWindow } = require('./context');

// RFC 5545 : une ligne commençant par un espace/tab prolonge la précédente.
function unfoldIcsLines(text)
{
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const line of rawLines)
  {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length)
    {
      lines[lines.length - 1] += line.slice(1);
    }
    else if (line.length)
    {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcsText(value)
{
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Accepte "20260901T081500Z" (horodaté) ou "20260817" (jour entier, ex: vacances).
function parseIcsDate(value)
{
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { dateOnly: true, iso: `${y}-${mo}-${d}` };
  return { dateOnly: false, iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}` };
}

function parseIcsCourses(icsText)
{
  const lines = unfoldIcsLines(icsText);
  const events = [];
  const holidays = [];
  let cur = null;

  for (const line of lines)
  {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }

    if (line === 'END:VEVENT')
    {
      if (cur)
      {
        if (cur.dtstartDateOnly)
        {
          holidays.push({ label: cur.summary || 'Vacances', start: cur.dtstartIso, end: cur.dtendIso || cur.dtstartIso });
        }
        else if (cur.dtstartIso && cur.dtendIso)
        {
          events.push(
          {
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
    else if (key === 'DTSTART')
    {
      const p = parseIcsDate(value);
      if (p) { cur.dtstartIso = p.iso; cur.dtstartDateOnly = p.dateOnly; }
    }
    else if (key === 'DTEND')
    {
      const p = parseIcsDate(value);
      if (p) cur.dtendIso = p.iso;
    }
    else if (key === 'DESCRIPTION')
    {
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

function register(ipcMain)
{
  ipcMain.handle('edt:importIcsDialog', async () =>
  {
    const res = await dialog.showOpenDialog(getMainWindow(),
    {
      properties: ['openFile'],
      filters: [{ name: 'Calendrier iCal', extensions: ['ics'] }]
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

    try
    {
      const raw = fs.readFileSync(res.filePaths[0], 'utf-8');
      const { events, holidays } = parseIcsCourses(raw);
      if (!events.length)
      {
        return { ok: false, error: 'Aucun cours trouvé dans ce fichier (vérifie que c\'est bien le bon lien iCal).' };
      }

      const data =
      {
        importedAt: new Date().toISOString(),
        sourceFileName: path.basename(res.filePaths[0]),
        events,
        holidays
      };
      writeJsonAtomic(PATHS.edtCache, data);
      return { ok: true, data };
    }
    catch (e)
    {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('edt:getCache', () => readJson(PATHS.edtCache, null));
}

module.exports = { register };
