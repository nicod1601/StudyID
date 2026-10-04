/**
 * Petits utilitaires DOM partagés par tous les modules.
 */

// Raccourci vers document.getElementById.
export const el = (id) => document.getElementById(id);

// Échappe le texte destiné à être inséré dans du HTML.
// Les guillemets sont aussi échappés : indispensable quand la valeur part dans
// un attribut (title="...", value="..."), sinon un caractère " casserait le HTML.
export function escapeHtml(value)
{
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
