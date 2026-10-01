// =====================================================================
// StudyIDE — chargement paresseux des bibliothèques lourdes
// pdf.js (~1,4 Mo), Emmet (~550 Ko), xterm (~750 Ko) et les modes d'éditeur
// rares ne sont chargés qu'à la première utilisation : le démarrage de
// l'appli n'a plus à les lire ni à les compiler.
// =====================================================================
(function () {
  'use strict';

  const loaded = new Map(); // src -> Promise

  function loadOne(src) {
    if (loaded.has(src)) return loaded.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // conserve l'ordre d'exécution
      s.onload = () => resolve();
      s.onerror = () => { loaded.delete(src); reject(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
    loaded.set(src, p);
    return p;
  }

  // Les scripts sont ajoutés dans l'ordre (async=false) : téléchargés en parallèle,
  // exécutés dans l'ordre -> les dépendances entre modes CodeMirror sont respectées.
  const loadAll = (list) => Promise.all(list.map(loadOne));

  const CM = 'vendor/codemirror/';
  const bundles = {
    pdf: () => loadAll(['vendor/pdfjs/pdf.min.js']).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    }),
    // Modes et outils réservés à l'éditeur de projet / à la section Web
    editor: () => loadAll([
      CM + 'mode/markdown/markdown.js', CM + 'mode/shell/shell.js', CM + 'mode/sql/sql.js', CM + 'mode/php/php.js',
      CM + 'mode/rust/rust.js', CM + 'mode/go/go.js', CM + 'mode/ruby/ruby.js', CM + 'mode/yaml/yaml.js',
      CM + 'mode/jsx/jsx.js', CM + 'mode/coffeescript/coffeescript.js', CM + 'mode/sass/sass.js',
      CM + 'mode/stylus/stylus.js', CM + 'mode/pug/pug.js', CM + 'mode/handlebars/handlebars.js',
      CM + 'addon/mode/multiplex.js', CM + 'mode/vue/vue.js', CM + 'mode/dockerfile/dockerfile.js',
      CM + 'mode/toml/toml.js', CM + 'mode/properties/properties.js', CM + 'mode/diff/diff.js',
      CM + 'addon/hint/show-hint.js', CM + 'addon/hint/xml-hint.js', CM + 'addon/hint/html-hint.js',
      CM + 'addon/hint/css-hint.js', CM + 'addon/hint/javascript-hint.js', CM + 'addon/hint/anyword-hint.js',
      'vendor/emmet/emmet-codemirror.js'
    ]),
    xterm: () => loadAll([
      'vendor/xterm/xterm.js', 'vendor/xterm/addon-fit.js',
      'vendor/xterm/addon-web-links.js', 'vendor/xterm/addon-webgl.js'
    ])
  };

  const once = {};
  window.Lazy = {
    pdf: () => (once.pdf = once.pdf || bundles.pdf()),
    editor: () => (once.editor = once.editor || bundles.editor()),
    xterm: () => (once.xterm = once.xterm || bundles.xterm())
  };
})();
