'use strict';
// Réglages de l'application (studyide-settings.json) : lecture en cache, écriture différée.

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { WORKSPACE_DIR } = require('./paths');
const { DEFAULT_MODEL_URL } = require('../services/local-models');
const { atomicWriteSync } = require('./db');

const SETTINGS_FILE = path.join(WORKSPACE_DIR, 'studyide-settings.json');

const SETTINGS_DEFAULTS = () => ({
  localModelUrl: DEFAULT_MODEL_URL, localModelId: 'fast', iaEngine: 'auto', minimizeToTray: true,
  iaNotifications: true, hplanningUrl: '', edtReminders: [], edtRemindersEnabled: true,
  edtReminderMinutesBefore: 15, editorTabSize: 4, editorIndentWithTabs: false, editorShowWhitespace: false
});

let settingsCache = null;

let settingsTimer = null;

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const initial = SETTINGS_DEFAULTS();
    try { atomicWriteSync(SETTINGS_FILE, JSON.stringify(initial, null, 2)); } catch (e) { /* workspace pas encore créé */ }
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    const merged = { ...SETTINGS_DEFAULTS(), ...parsed };
    if (!merged.localModelUrl) merged.localModelUrl = DEFAULT_MODEL_URL;
    if (!merged.localModelId) merged.localModelId = 'fast';
    if (!merged.iaEngine) merged.iaEngine = 'auto';
    if (!Array.isArray(merged.edtReminders)) merged.edtReminders = [];
    return merged;
  } catch (e) {
    return SETTINGS_DEFAULTS();
  }
}

function readSettings() {
  if (!settingsCache) settingsCache = loadSettings();
  return { ...settingsCache }; // copie : les appelants modifient puis rappellent writeSettings
}

function flushSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = null;
  if (!settingsCache) return;
  try { atomicWriteSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2)); }
  catch (e) { console.error('Écriture des réglages impossible :', e.message); }
}

function writeSettings(s) {
  settingsCache = { ...s };
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(flushSettings, 200);
}

function register() {

  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:set', (evt, s) => { writeSettings(s); return readSettings(); });
}

module.exports = { register, flushSettings, readSettings, writeSettings };
