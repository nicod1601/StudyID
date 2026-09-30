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
