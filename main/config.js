/**
 * Configuration centrale du process principal.
 * Toutes les constantes, chemins et valeurs par défaut vivent ici : un seul
 * endroit à modifier pour ajouter un réglage ou changer un dossier.
 */

const path = require('path');
const os = require('os');

// Racine de l'application (le dossier parent de /main).
const APP_ROOT = path.join(__dirname, '..');

// Dossier de travail de l'utilisateur : ~/StudyIDE
const WORKSPACE_DIR = path.join(os.homedir(), 'StudyIDE');

// Fichiers de données, tous regroupés dans le workspace.
const PATHS =
{
  db: path.join(WORKSPACE_DIR, 'studyide-data.json'),
  settings: path.join(WORKSPACE_DIR, 'studyide-settings.json'),
  edtCache: path.join(WORKSPACE_DIR, 'edt-cache.json'),
  notes: path.join(WORKSPACE_DIR, 'data-note.txt'),
  butGrades: path.join(WORKSPACE_DIR, 'but-grades.json'),
  seedPdfs: path.join(APP_ROOT, 'data', 'seed-pdfs')
};

// Données livrées avec l'appli (matières et solutions pré-remplies).
const COURSES_SEED = require('../data/courses.json');
const SEED_SOLUTIONS = require('../data/seed-solutions.json');

// Profils d'IA locale proposés, via Ollama (registre officiel, sources vérifiées).
// `model` = le nom exact du modèle à tirer avec Ollama (ex. `ollama pull qwen2.5:7b`).
const LOCAL_MODEL_OPTIONS =
[
  {
    id: 'fast',
    label: 'Rapide (Qwen2.5 1.5B, ~1 Go)',
    description: 'Réponses rapides, correct pour des questions simples. Qualité limitée sur du code complexe.',
    model: 'qwen2.5:1.5b'
  },
  {
    id: 'balanced',
    label: 'Équilibré (Qwen2.5 7B, ~4,7 Go) — recommandé',
    description: 'Bien meilleur pour comprendre et expliquer tes cours (management, éco, algo, etc.) et pour du code correct. Plus lent sur CPU.',
    model: 'qwen2.5:7b'
  },
  {
    id: 'code',
    label: 'Expert Code (Qwen2.5-Coder 7B, ~4,7 Go)',
    description: 'Spécialisé Java/Python : meilleure qualité de code, debug, complétion. Moins bon sur les matières non techniques.',
    model: 'qwen2.5-coder:7b'
  },
  {
    id: 'advanced',
    label: 'Avancé (Qwen2.5 14B, ~9 Go)',
    description: 'Le plus puissant proposé : meilleurs résumés et meilleur code. Mais ~2× plus lourd et nettement plus lent.',
    model: 'qwen2.5:14b',
    heavy: true,
    warning: '⚠️ Exigeant : 16 Go de RAM minimum (ou un GPU dédié). Lent sur un PC ancien / un vieux serveur — dans ce cas, préfère « Équilibré » ou « Rapide ».'
  }
];

// Adresse du serveur Ollama local (modifiable via la variable OLLAMA_HOST).
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1:11434';

// Réglages par défaut : source unique de vérité, fusionnée avec le fichier
// utilisateur à la lecture (voir settings.js).
const DEFAULT_SETTINGS =
{
  localModelId: 'fast',
  minimizeToTray: true,
  iaNotifications: true,
  showIaBubble: true,
  showNotesBubble: true,
  showChatBubble: true,
  hplanningUrl: '',
  edtReminders: [],
  edtRemindersEnabled: true,
  edtReminderMinutesBefore: 15,
  editorTabSize: 4,
  editorIndentWithTabs: false,
  editorShowWhitespace: false,
  lastProjectPath: ''
};

// Structure pré-remplie d'après le relevé BUT Informatique — Semestre 5 A
// (coefficients repris tels quels ; l'étudiant peut tout modifier).
const DEFAULT_BUT_GRADES =
{
  portalUrl: 'https://notes-iut.univ-lehavre.fr/',
  ues:
  [
    {
      id: 'ue-bin51', name: 'BIN51 — Réaliser un développement d\'application',
      resources:
      [
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
      resources:
      [
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
      resources:
      [
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

module.exports =
{
  APP_ROOT,
  WORKSPACE_DIR,
  PATHS,
  COURSES_SEED,
  SEED_SOLUTIONS,
  LOCAL_MODEL_OPTIONS,
  OLLAMA_HOST,
  DEFAULT_SETTINGS,
  DEFAULT_BUT_GRADES
};
