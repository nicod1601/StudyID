// =====================================================================
// StudyIDE — Catalogue du « Code rapide » (web)
// Pour ajouter un snippet : copie un objet de la liste et complète-le.
//   kind : 'code' = bout de code à insérer / copier
//          'file' = fichier complet (créé dans le projet, à l'endroit `path`)
//          'cmd'  = commande à lancer dans le terminal
//   lang : html | css | js | sh | json   (sert au tri selon le fichier actif)
//   cat  : catégorie affichée en filtre
// =====================================================================
window.CODEPAD_SNIPPETS = [
  // ---------------------------------------------------------------- HTML
  { id: 'html-base', kind: 'file', lang: 'html', cat: 'HTML', path: 'index.html', title: 'Page HTML5 de base', desc: 'Squelette avec viewport, style.css et script.js',
    code: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mon site</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header>
    <h1>Mon site</h1>
  </header>
  <main>
    <p>Hello world !</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
` },
  { id: 'html-nav', kind: 'code', lang: 'html', cat: 'HTML', title: 'Barre de navigation', desc: 'nav + liste de liens',
    code: `<nav class="navbar">
  <a class="brand" href="/">Logo</a>
  <ul>
    <li><a href="#accueil">Accueil</a></li>
    <li><a href="#projets">Projets</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>` },
  { id: 'html-form', kind: 'code', lang: 'html', cat: 'HTML', title: 'Formulaire de contact', desc: 'labels associés, champs requis',
    code: `<form id="contact-form">
  <label for="name">Nom</label>
  <input type="text" id="name" name="name" required />

  <label for="email">Email</label>
  <input type="email" id="email" name="email" required />

  <label for="message">Message</label>
  <textarea id="message" name="message" rows="4" required></textarea>

  <button type="submit">Envoyer</button>
</form>` },
  { id: 'html-card', kind: 'code', lang: 'html', cat: 'HTML', title: 'Carte (card)', desc: 'image, titre, texte, bouton',
    code: `<article class="card">
  <img src="image.jpg" alt="Description de l'image" />
  <div class="card-body">
    <h3>Titre de la carte</h3>
    <p>Un court texte de présentation.</p>
    <a class="btn" href="#">En savoir plus</a>
  </div>
</article>` },

  // ---------------------------------------------------------------- CSS
  { id: 'css-reset', kind: 'file', lang: 'css', cat: 'CSS', path: 'style.css', title: 'Reset + variables', desc: 'box-sizing, couleurs, police',
    code: `:root {
  --bg: #ffffff;
  --text: #1a1a1a;
  --accent: #4f46e5;
  --radius: 10px;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
}

img { max-width: 100%; display: block; }
a { color: var(--accent); }
` },
  { id: 'css-center', kind: 'code', lang: 'css', cat: 'CSS', title: 'Centrer avec flexbox', desc: 'horizontal + vertical',
    code: `.center {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}` },
  { id: 'css-grid', kind: 'code', lang: 'css', cat: 'CSS', title: 'Grille responsive', desc: 'colonnes automatiques, sans media query',
    code: `.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}` },
  { id: 'css-navbar', kind: 'code', lang: 'css', cat: 'CSS', title: 'Style de navbar', desc: 'pour le snippet « Barre de navigation »',
    code: `.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: var(--bg);
  border-bottom: 1px solid #e5e7eb;
}
.navbar ul { display: flex; gap: 1rem; list-style: none; margin: 0; padding: 0; }
.navbar a { text-decoration: none; }` },
  { id: 'css-card', kind: 'code', lang: 'css', cat: 'CSS', title: 'Style de carte', desc: 'ombre + survol',
    code: `.card {
  border-radius: var(--radius);
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); }
.card-body { padding: 1rem; }` },
  { id: 'css-media', kind: 'code', lang: 'css', cat: 'CSS', title: 'Media query mobile', desc: 'écrans de moins de 768 px',
    code: `@media (max-width: 768px) {
  .navbar { flex-direction: column; gap: 0.5rem; }
}` },
  { id: 'css-dark', kind: 'code', lang: 'css', cat: 'CSS', title: 'Thème sombre automatique', desc: 'prefers-color-scheme',
    code: `@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --text: #e6e8ee;
  }
}` },

  // ---------------------------------------------------------------- JavaScript
  { id: 'js-dom', kind: 'code', lang: 'js', cat: 'JavaScript', title: 'Sélection + événement', desc: 'querySelector et addEventListener',
    code: `const button = document.querySelector('#mon-bouton');

button.addEventListener('click', () => {
  console.log('Clic !');
});` },
  { id: 'js-fetch', kind: 'code', lang: 'js', cat: 'JavaScript', title: 'fetch JSON (async/await)', desc: 'avec gestion d\'erreur',
    code: `async function getData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(\`Erreur HTTP \${response.status}\`);
    return await response.json();
  } catch (error) {
    console.error('Requête impossible :', error);
    return null;
  }
}` },
  { id: 'js-form', kind: 'code', lang: 'js', cat: 'JavaScript', title: 'Lire un formulaire', desc: 'FormData + preventDefault',
    code: `const form = document.querySelector('#contact-form');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  console.log(data);
});` },
  { id: 'js-storage', kind: 'code', lang: 'js', cat: 'JavaScript', title: 'localStorage (JSON)', desc: 'sauvegarder / lire un objet',
    code: `const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const load = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};` },
  { id: 'js-debounce', kind: 'code', lang: 'js', cat: 'JavaScript', title: 'debounce', desc: 'limiter les appels (recherche, resize…)',
    code: `function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}` },

  // ---------------------------------------------------------------- Node / Express
  { id: 'express-server', kind: 'file', lang: 'js', cat: 'Node / Express', path: 'server.js', title: 'Serveur Express minimal', desc: 'fichiers statiques + route API',
    code: `const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello depuis Express !' });
});

app.listen(PORT, () => {
  console.log(\`Serveur lancé sur http://localhost:\${PORT}\`);
});
` },
  { id: 'express-route', kind: 'code', lang: 'js', cat: 'Node / Express', title: 'Route POST JSON', desc: 'à ajouter dans server.js',
    code: `app.post('/api/items', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Le champ "name" est requis.' });
  res.status(201).json({ id: Date.now(), name });
});` },
  { id: 'file-gitignore', kind: 'file', lang: 'sh', cat: 'Node / Express', path: '.gitignore', title: '.gitignore Node', desc: 'node_modules, .env, builds',
    code: `node_modules/
.env
dist/
build/
.DS_Store
` },

  // ---------------------------------------------------------------- Terminal
  { id: 'cmd-npm-init', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Initialiser un projet npm', desc: 'crée package.json',
    code: 'npm init -y' },
  { id: 'cmd-express', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Installer Express', desc: 'dépendance serveur',
    code: 'npm install express' },
  { id: 'cmd-nodemon', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Relance auto du serveur', desc: 'Node ≥ 18.11, sans dépendance',
    code: 'node --watch server.js' },
  { id: 'cmd-serve', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Servir le dossier (site statique)', desc: 'http://localhost:3000',
    code: 'npx --yes serve .' },
  { id: 'cmd-vite', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Créer un projet Vite', desc: 'interactif : choisis le framework',
    code: 'npm create vite@latest mon-app' },
  { id: 'cmd-git-init', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Git : premier commit', desc: 'init + add + commit',
    code: 'git init && git add . && git commit -m "Premier commit"' },
  { id: 'cmd-git-status', kind: 'cmd', lang: 'sh', cat: 'Terminal', title: 'Git : état et historique', desc: 'status court + 10 derniers commits',
    code: 'git status -sb && git log --oneline -10' }
];
