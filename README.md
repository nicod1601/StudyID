# Serveur de chat StudyIDE (réseau local)

Un petit serveur qu'une seule personne doit lancer (toi, par exemple) pendant
que les autres se connectent dessus depuis StudyIDE, tant que vous êtes sur
le même réseau Wi-Fi / LAN (ex : à l'IUT).

## Lancer le serveur

```bash
cd server
npm install
npm start
```

Tu devrais voir :

```
💬 Serveur de chat StudyIDE en écoute sur le port 4321
   Comptes stockés dans : .../server/comptes.data
```

## Trouver ton IP locale (à donner aux autres)

- **Windows** : `ipconfig` → ligne "Adresse IPv4"
- **macOS / Linux** : `ifconfig` ou `ip addr` → cherche l'IP qui commence par
  `192.168.x.x` ou `10.x.x.x`

## Se connecter depuis StudyIDE

Dans l'appli, ouvre la bulle 💬 en bas à droite, puis entre l'adresse au
format :

```
192.168.1.42:4321
```

(remplace par la vraie IP du PC qui héberge le serveur)

## Notes

- Les comptes sont stockés **en clair** dans `comptes.data` (JSON) — pense à
  ne pas le publier publiquement (déjà ignoré par `.gitignore` si tu en as
  un, sinon ajoute-le).
- Chat en salon commun **et** messages privés (DM) entre deux personnes.
- **Historique persistant** dans `messages.data` (jusqu'à 500 messages
  conservés, texte uniquement) : en te reconnectant, tu retrouves le salon
  et tes conversations privées, même si tu étais hors ligne au moment de
  l'envoi.
- Les fichiers (y compris `.zip`) sont relayés en direct dans le salon
  commun uniquement (pas encore en DM), sans être stockés sur le serveur :
  seules les personnes connectées **au moment de l'envoi** les reçoivent.
- Taille max par fichier : 50 Mo (modifiable dans `chat-server.js`, constante
  `MAX_FILE_SIZE`).
- Le port par défaut est `4321`, changeable avec `PORT=1234 npm start`.

## 🌐 Développement web (section « Web »)

- **Terminal** : vrai pseudo-terminal (xterm.js + node-pty) avec onglets, couleurs, `Ctrl+C`, liens cliquables. Repli automatique sur l'ancien mode simplifié si `node-pty` n'est pas compilé.
- **Section Web** : détection du framework (React, Next.js, Vue, Nuxt, Angular, Svelte/SvelteKit, Astro, Express, Vite, Django, Flask, PHP, HTML statique), scripts `package.json` cliquables, gestion des dépendances (npm / yarn / pnpm / bun) et création de projets à partir de modèles.
- **Serveurs** : lancement / arrêt / redémarrage, URL détectée automatiquement, logs en couleur, serveur statique avec **live reload**.
- **Aperçu** : `<webview>` intégré avec modes bureau / tablette / mobile, outils de développement et console de la page.
- **Éditeur** : JSX, TSX, TypeScript, Vue, SCSS/Sass/Less, Pug, Handlebars, TOML, Dockerfile…, **Emmet** (`Tab`), autocomplétion (`Ctrl+Espace`), fermeture automatique de `` ` `` `'` `"` `( [ {`, et une barre de symboles (`{ } [ ] < > => \` | ~ @ #`…).

Après avoir récupéré cette version : `npm install` (le script `postinstall` recompile `node-pty` pour Electron ; il faut les outils de compilation : Python + Visual Studio Build Tools sous Windows, `build-essential` sous Linux).

## ⚡ Performances

- **Base de données et réglages en cache mémoire** : lecture unique au démarrage, écriture groupée et atomique (fichier temporaire + renommage), vidée à la fermeture. Avant, chaque clic relisait et re-parsait tout le JSON.
- **Démarrage** : la fenêtre s'affiche sur `ready-to-show` (pas de flash blanc), le workspace se prépare pendant que l'interface charge, la détection Python/Java ne bloque plus l'interface (3 vérifications en parallèle, mises en cache).
- **Chargement paresseux** (`renderer/lazy.js`) : pdf.js, Emmet, xterm et les modes d'éditeur rares ne sont chargés qu'à la première utilisation.
- **Visionneuse PDF** : seules les pages proches de l'écran sont dessinées (les autres sont libérées), le zoom ne recharge plus le fichier, la détection d'exercices n'est faite qu'une fois par document.
- **Terminal** : sortie regroupée (un message IPC toutes les ~10 ms) et rendu WebGL avec repli automatique sur le rendu DOM.
- **Arrière-plan** : fenêtre masquée dans la zone de notification = quasi 0 % CPU (le throttling n'est plus désactivé).

## 🧭 Navigation dans l'éditeur de projet

- **Barres de défilement** verticale et horizontale toujours visibles (16 px) : on glisse le pouce, on clique sur la piste pour avancer d'une page, repères pour les occurrences du mot sélectionné et les résultats de recherche.
- **Fil d'Ariane** : chemin du fichier + `classe › fonction` courante, cliquable.
- **Aller au symbole** (`Ctrl+Shift+O`) : filtre flou, aperçu en direct, `Échap` revient à la position d'origine. Fonctionne pour JS/TS/JSX, Vue, Python, Java/C#/Kotlin, PHP, Go, Rust, Ruby, CSS/SCSS, HTML, Markdown, JSON, SQL.
- **Barre d'état** : ligne/colonne, sélection, indentation, langage, retour à la ligne, zoom.
- **Raccourcis** : `Ctrl+G` aller à la ligne · `Alt+↑/↓` déplacer les lignes · `Maj+Alt+↓/↑` dupliquer · `Ctrl+K Ctrl+0` / `Ctrl+K Ctrl+J` tout replier / déplier · `Alt+Z` retour à la ligne · `Ctrl+molette` ou `Ctrl +/-/0` zoom.
- **Un document par onglet** : l'historique d'annulation (`Ctrl+Z`), le curseur, la position et les blocs repliés sont conservés quand on change d'onglet.
- **Séparateur** éditeur / terminal redimensionnable (double-clic : taille par défaut).


## 🔎 Recherche globale

- Barre en haut de la sidebar, raccourci **Ctrl+K** (depuis n'importe où).
- Cherche en même temps dans les **matières**, les **exercices de code**, les **PDF** et le **contenu des PDF** (passages + exercices détectés), sans tenir compte des accents ni de la casse ; tous les mots saisis doivent être présents.
- `↑ ↓` pour naviguer, `Entrée` pour ouvrir, `Échap` pour fermer. Un résultat dans un PDF l'ouvre directement à la bonne page.
- Raccourcis : **Ctrl+1…6** pour changer de section.

## ⚡ Code rapide (snippets web)

- Bouton **⚡ Code rapide** (terminal du mode Projet, barre du bas du mode Web) ou **Ctrl+Maj+K**.
- Cible **📄 Fichier actif** : copier le code ou l'insérer au curseur. Cible **🗂 Projet** : créer le fichier dans le dossier du projet ou lancer la commande dans le terminal.
- Le catalogue est dans `renderer/codepad-snippets.js` : ajouter un snippet = ajouter un objet à la liste.

## 🗂 Ouverture rapide des projets (VS Code, Laravel, Node…)

- **Arborescence paresseuse** : seul le dossier racine est lu à l'ouverture ; les dossiers se chargent au dépliage, par paquets de 250 lignes (« afficher plus »). Un dossier de 5 000 fichiers (`storage/logs`, `vendor`, `node_modules`…) ne fige plus l'interface.
- **Mémoire par projet** : dossiers dépliés, onglets ouverts et onglet actif sont retrouvés à la réouverture.
- **Rafraîchissement automatique** au retour sur la fenêtre (après `git pull`, `php artisan make:…`), sans clignotement ni perte du défilement.
- **Fichiers** : les binaires (images, archives, bases SQLite) et les fichiers > 8 Mo ne sont plus chargés dans l'éditeur ; au-delà de 1 Mo ou avec une ligne géante (bundle minifié), la coloration est désactivée pour rester fluide.
- **Laravel** : fichiers `.blade.php` (HTML + PHP), icônes `artisan` / `composer.json`, `vendor` grisé comme `node_modules`.

## 🖥 Virtualisation (Ctrl+7)

Détecte automatiquement les hyperviseurs installés et liste leurs machines : **VirtualBox, VMware (Workstation/Player/Fusion), Hyper-V, QEMU/KVM (libvirt), WSL, Docker et Multipass**.

- Actions selon l'état : démarrer, arrêter, redémarrer, pause/reprise, suspendre, instantané, forcer l'arrêt.
- Pour chaque machine, des **commandes prêtes à copier** (le nom de la machine est déjà inséré) ou à lancer dans le terminal intégré ; les valeurs `<à compléter>` sont demandées.
- Aucune commande n'est passée par un shell : les noms sont validés (pas d'injection).
- Hyper-V demande de lancer StudyIDE en administrateur. Actualisation auto optionnelle (10 s).
- Code : `src/main/virt/` (un fichier par hyperviseur) et `renderer/js/features/virt/`.

## 🏗 Architecture du code

```
main.js                     point d'entrée Electron (7 lignes)
preload.js                  pont sécurisé renderer ⇄ main (window.studyide)
src/main/                   processus principal
  index.js                  enregistre les canaux IPC, cycle de vie de l'appli
  core/                     paths, db (JSON atomique), settings, window (fenêtre + tray)
  services/                 IA locale (local-models = données, local-ai = moteur)
  ipc/                      un module par domaine : data, files, edt, project, run, notes, grades, system, docs
  web-dev.js                terminaux (node-pty), serveurs de dev, templates web
renderer/                   interface
  index.html                squelette ; les scripts sont chargés dans l'ordre (voir la fin du fichier)
  css/                      une feuille par fonctionnalité (l'ordre des <link> = l'ordre de la cascade)
  js/lib/                   chargement paresseux (lazy), navigation dans l'éditeur
  js/core/                  state (état partagé), utils, navigation, boot (démarrage)
  js/features/              une fonctionnalité = un dossier ou un fichier : code, cours, project, ia,
                            notes, but, chat-lan, edt, search, codepad, web…
```

Règles : un fichier = une responsabilité ; chaque module IPC expose `register()` ; les scripts du renderer
partagent le même espace global (pas de bundler), donc l'ordre de chargement dans `index.html` compte
(`core/state` en premier, `core/boot` en dernier).
