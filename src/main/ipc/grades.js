'use strict';
// IPC : calcul de notes BUT (saisie manuelle et simulation).

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { WORKSPACE_DIR } = require('../core/paths');

// ---------- IPC : Calcul de notes BUT (saisie manuelle + simulation, pas de scraping) ----------

const BUT_GRADES_FILE = path.join(WORKSPACE_DIR, 'but-grades.json');

// Structure pré-remplie d'après le relevé BUT Informatique — Semestre 5 A
// (coefficients repris tels quels ; l'étudiant peut tout modifier/ajouter/supprimer).
const DEFAULT_BUT_GRADES = {
  portalUrl: 'https://notes-iut.univ-lehavre.fr/',
  ues: [
    {
      id: 'ue-bin51', name: 'BIN51 — Réaliser un développement d\'application',
      resources: [
        { id: 'r1', name: 'BINR504 — Qualité algorithmique', coef: 4, grade: null },
        { id: 'r2', name: 'BINR505 — Programmation avancée', coef: 10, grade: null },
        { id: 'r3', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 6, grade: null },
        { id: 'r4', name: 'BINR507 — Automatisation de la chaîne de production', coef: 7, grade: null },
        { id: 'r5', name: 'BINR508 — Qualité de développement', coef: 4, grade: null },
        { id: 'r6', name: 'BINR509 — Virtualisation avancée', coef: 8, grade: null },
        { id: 'r7', name: 'BINR510 — Nouveaux paradigmes de base de données', coef: 13, grade: null },
        { id: 'r8', name: 'BINR513 — Économie durable et numérique', coef: 4, grade: null },
        { id: 'r9', name: 'BINR514 — Anglais', coef: 4, grade: null },
        { id: 'r10', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    },
    {
      id: 'ue-bin52', name: 'BIN52 — Optimiser des applications',
      resources: [
        { id: 'r11', name: 'BINR504 — Qualité algorithmique', coef: 6, grade: null },
        { id: 'r12', name: 'BINR505 — Programmation avancée', coef: 7, grade: null },
        { id: 'r13', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 7, grade: null },
        { id: 'r14', name: 'BINR508 — Qualité de développement', coef: 3, grade: null },
        { id: 'r15', name: 'BINR509 — Virtualisation avancée', coef: 4, grade: null },
        { id: 'r16', name: 'BINR510 — Nouveaux paradigmes de base de données', coef: 4, grade: null },
        { id: 'r17', name: 'BINR511 — Méthodes d\'optimisation pour l\'aide à la décision', coef: 9, grade: null },
        { id: 'r18', name: 'BINR512 — Modélisations mathématiques', coef: 16, grade: null },
        { id: 'r19', name: 'BINR514 — Anglais', coef: 4, grade: null },
        { id: 'r20', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    },
    {
      id: 'ue-bin56', name: 'BIN56 — Collaborer au sein d\'une équipe informatique',
      resources: [
        { id: 'r21', name: 'BINR501 — Initiation management équipe informatique', coef: 11, grade: null },
        { id: 'r22', name: 'BINR502 — PPP', coef: 6, grade: null },
        { id: 'r23', name: 'BINR503 — Politique de communication', coef: 15, grade: null },
        { id: 'r24', name: 'BINR506 — Sensibilisation à la programmation multimédia', coef: 4, grade: null },
        { id: 'r25', name: 'BINR507 — Automatisation de la chaîne de production', coef: 3, grade: null },
        { id: 'r26', name: 'BINR513 — Économie durable et numérique', coef: 8, grade: null },
        { id: 'r27', name: 'BINR514 — Anglais', coef: 13, grade: null },
        { id: 'r28', name: 'BINS501 — Développement avancé', coef: 40, grade: null }
      ]
    }
  ]
};

function register() {

  ipcMain.handle('but:getGrades', () => {
    if (!fs.existsSync(BUT_GRADES_FILE)) {
      if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
      fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(DEFAULT_BUT_GRADES, null, 2), 'utf-8');
      return DEFAULT_BUT_GRADES;
    }
    try {
      return JSON.parse(fs.readFileSync(BUT_GRADES_FILE, 'utf-8'));
    } catch (e) {
      return DEFAULT_BUT_GRADES;
    }
  });

  ipcMain.handle('but:setGrades', (evt, data) => {
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true };
  });

  ipcMain.handle('but:resetGrades', () => {
    fs.writeFileSync(BUT_GRADES_FILE, JSON.stringify(DEFAULT_BUT_GRADES, null, 2), 'utf-8');
    return DEFAULT_BUT_GRADES;
  });
}

module.exports = { register };
