# StudyIDE

Application de bureau (Windows + Debian/Linux) pour organiser tes 14 matières du
Semestre 5 et coder en **Python** et **Java**, avec exécution en un clic.
Fonctionne **100% hors connexion** (aucune IA pour l'instant, comme demandé).

## Fonctionnalités actuelles

**Mode Code**
- 14 matières du semestre déjà configurées (R5.01 → R5.14)
- Un dossier réel par matière, créé automatiquement dans `~/StudyIDE/` (Linux)
  ou `C:\Users\TonNom\StudyIDE\` (Windows)
- Créer un exercice Python ou Java à partir d'un template prêt à l'emploi
- Éditeur de code avec coloration syntaxique (Python / Java), auto-fermeture
  des parenthèses/accolades
- Bouton **Exécuter** : compile et lance le Java (`javac` + `java`), lance le
  Python (`python3`) et affiche la sortie console dans l'appli
- Suivi de progression par exercice : À faire / En cours / Terminé
- Détection automatique si Python / Java sont installés sur ta machine
- Sauvegarde manuelle (`Ctrl+S` ou bouton) ou automatique avant exécution

**Mode Cours (nouveau)**
- Visionneuse de PDF intégrée (rendu page par page, zoom), 100 % hors ligne
- **Détection automatique des exercices** dans le PDF (repère les "Exercice n°X"
  et découpe l'énoncé jusqu'à l'exercice suivant)
- Pour chaque exercice détecté : énoncé extrait, explication/solution rédigée,
  et une zone pour tes propres notes
- Suivi de progression par exercice PDF (À faire / En cours / Terminé)
- Bouton "+ Importer un PDF" pour ajouter les cours des autres matières —
  le système de détection est générique, il marche pour n'importe quel PDF
  qui utilise la formulation "Exercice n°X"
- **R5.04 (Qualité algorithmique)** est déjà pré-rempli avec tes 3 PDF
  (Chapitre 1, 2, 3) et les 18 exercices qu'ils contiennent, avec solution
  rédigée pour chacun

**Mode IA (nouveau : bulle flottante)**
- Une **bulle 🤖 en haut à droite**, visible partout (mode Code et Cours),
  qui ouvre un tiroir de discussion par-dessus ton travail — pas besoin de
  quitter ton code ou ton PDF pour lui parler
- **Consciente de ce que tu as ouvert** : si tu es en train de coder un
  exercice, elle voit le contenu du fichier ; si tu consultes un exercice
  PDF, elle voit son énoncé — affiché comme petite étiquette de contexte
  dans le tiroir, désactivable via la case à cocher dans les options (⚙)
- **Insertion directe de code** : si sa réponse contient un bloc de code,
  un bouton "📥 Insérer dans l'éditeur" l'ajoute directement dans ton fichier
  ouvert (mode Code)
- Recherche dans **tous tes documents importés** (PDF de cours + solutions
  d'exercices déjà rédigées), avec sources précises (matière, fichier, page)
- **🧠 Mini IA locale (100 % hors ligne), maintenant avec 3 profils au choix** :
  - **Rapide (1,5 Go)** — quasi instantané, correct pour des questions simples
  - **Équilibré (~4,7 Go, recommandé)** — bien meilleur pour comprendre et
    expliquer tes cours (management, éco, algo...) et pour du code correct
  - **Expert Code (~4,7 Go)** — spécialisé Java/Python : debug, complétion,
    qualité de code nettement supérieure
  
  Change de profil à tout moment dans "⚙ Réglages avancés", un seul actif
  à la fois. Plus le modèle est gros, plus la réponse prend de temps sur CPU
  (quelques secondes pour le rapide, jusqu'à 30-60s pour les plus gros selon
  ton PC), mais la qualité progresse nettement.

- **En ligne** (clé API Gemini gratuite dans Réglages avancés) : réponse
  rédigée par Gemini, construite en priorité à partir de tes cours et de ce
  que tu as ouvert, complétée si besoin par une recherche internet
- **Sélecteur de moteur** dans les options du tiroir : Auto (recommandé),
  Gemini, Mini IA locale, ou Recherche seule
- Détection automatique de la connexion et bascule intelligente entre modes

## Prérequis pour que le code s'exécute

L'appli n'embarque pas Python/Java : elle utilise ceux installés sur ton PC.
- **Python** : installe Python 3 (`python3` doit être dans le PATH)
- **Java** : installe un JDK (pas juste le JRE) pour avoir `javac` et `java`

Si un langage n'est pas détecté, tu peux quand même écrire le code, juste
"Exécuter" ne fonctionnera pas tant que l'outil n'est pas installé.

## Lancer l'application en mode développement

**Le plus simple : double-clique sur le lanceur fourni.**
- **Windows** : `Lancer-StudyIDE.bat` — vérifie si Node.js est installé (l'installe
  automatiquement via winget si besoin), installe les dépendances si nécessaire,
  puis lance l'appli. Si tout est déjà installé, il lance directement.
- **Debian / Linux** : `lancer-studyide.run` — même logique (installe Node.js
  via `apt` si besoin, avec ton mot de passe administrateur). Pour le lancer :
  double-clique dessus (certains gestionnaires de fichiers demandent de choisir
  "Exécuter dans un terminal"), ou depuis un terminal : `./lancer-studyide.run`

Ces deux fichiers ne font rien d'invasif : ils vérifient juste si `npm` existe,
installent Node.js uniquement si absent, puis lancent `npm install` (uniquement
si le dossier `node_modules` n'existe pas encore) et enfin `npm start`.

Sinon, à la main :
```bash
npm install
npm start
```
⚠️ Le premier `npm install` télécharge aussi le moteur d'IA locale
(`node-llama-cpp`), ce qui ajoute environ 1-2 minutes et quelques centaines
de Mo. Le modèle IA lui-même (~1 Go à 4,7 Go selon le profil) n'est
téléchargé que si tu cliques sur "Télécharger" dans les réglages — pas avant.

## Construire l'installeur

### Sur Debian / Linux (pour toi-même, ici)
```bash
npm run dist:linux
```
Ça génère dans `release/` :
- `StudyIDE-x.x.x.deb` → `sudo dpkg -i release/StudyIDE-*.deb`
- `StudyIDE-x.x.x.AppImage` → à rendre exécutable puis double-clic

### Sur Windows (doit être fait depuis un Windows, ou avec Wine)
```bash
npm run dist:win
```
Génère un installeur `.exe` (NSIS) dans `release/`. **electron-builder ne
peut pas fabriquer un `.exe` signé Windows fiable depuis Linux** : le plus
simple est de copier ce dossier de projet sur ta machine Windows, faire
`npm install` puis `npm run dist:win` directement là-bas. Je peux aussi
t'expliquer comment faire via Wine si tu préfères tout faire depuis Debian.

## Structure du projet

```
studyide/
  main.js            → processus principal Electron (fichiers, exécution du code)
  preload.js          → pont sécurisé entre l'appli et l'interface
  data/courses.json   → liste des 14 matières
  renderer/            → interface (HTML/CSS/JS + éditeur CodeMirror embarqué)
```

Pour les autres matières, envoie-moi les PDF et je referai la même chose :
import automatique + solutions rédigées prêtes à l'emploi, immédiatement
cherchables par l'assistant IA.

## Prochaines étapes

- Envoie-moi les PDF des autres matières, je fais pareil (import + solutions)
- Éventuellement historique des conversations IA sauvegardé
