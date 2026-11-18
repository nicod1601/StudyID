// Mode Projet : icônes et modes de coloration selon le type de fichier.
      // terminaux xterm.js du mode Projet (WebDev.TerminalTabs)

const EXT_ICONS = {
  py: '🐍', java: '☕', js: '🟨', mjs: '🟨', cjs: '🟨', jsx: '🟨',
  ts: '🔷', tsx: '🔷', html: '🌐', htm: '🌐', css: '🎨', json: '📋',
  md: '📝', sh: '🐚', bash: '🐚', sql: '🗄', php: '🐘', rs: '🦀',
  go: '🐹', rb: '💎', yml: '⚙', yaml: '⚙', txt: '📄', gitignore: '🚫',
  xml: '📰', c: '🔧', h: '🔧', cpp: '🔧'
};
function iconFor(name, isDirectory, isOpenDir) {
  if (isDirectory) return isOpenDir ? '📂' : '📁';
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return '🐳';
  if (lower === 'package.json') return '📦';
  if (lower.endsWith('.blade.php')) return '🔥';
  if (lower === 'artisan') return '🛠';
  if (lower === 'composer.json') return '🎼';
  const ext = extOf(name);
  return (window.WebDev && window.WebDev.extraIcons[ext]) || EXT_ICONS[ext] || '📄';
}
function cmModeFor(name) {
  if (/\.blade\.php$/i.test(name)) return 'application/x-httpd-php'; // Laravel Blade : HTML + PHP
  const webMode = window.WebDev && window.WebDev.cmModeFor(name);
  if (webMode) return webMode;
  const ext = extOf(name);
  switch (ext) {
    case 'py': return 'python';
    case 'java': return 'text/x-java';
    case 'js': case 'mjs': case 'cjs': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'text/typescript';
    case 'json': return 'application/json';
    case 'css': return 'css';
    case 'html': case 'htm': return 'htmlmixed';
    case 'xml': return 'xml';
    case 'md': case 'markdown': return 'markdown';
    case 'sh': case 'bash': return 'shell';
    case 'sql': return 'sql';
    case 'php': return 'php';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'rb': return 'ruby';
    case 'yml': case 'yaml': return 'yaml';
    default: return 'text/plain';
  }
}
