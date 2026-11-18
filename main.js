// Point d'entrée Electron. Le code du processus principal vit dans src/main/ :
//   core/      fenêtre, base de données, réglages, chemins
//   services/  IA locale
//   ipc/       un module par domaine (données, fichiers, projet, PDF, notes…)
//   web-dev.js terminaux et outils de développement web
require('./src/main');
