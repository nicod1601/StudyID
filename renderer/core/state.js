/**
 * État partagé de l'application (renderer).
 *
 * Un seul objet mutable, importé par les modules qui ont besoin de se
 * coordonner (quelle matière, quel exercice, quel document sont actifs, et les
 * deux instances CodeMirror). On évite ainsi les variables globales éparpillées
 * tout en gardant un accès simple et lisible.
 */

export const state =
{
  db: null,                 // contenu complet de la base de données
  currentCourse: null,      // code de la matière sélectionnée (ex. "R5.04")
  currentExercise: null,    // exercice de code ouvert (mode Code)
  currentMode: 'code',      // 'code' | 'cours' | 'projet' | 'edt' | 'discord'

  // Mode Cours (PDF)
  currentDoc: null,         // document PDF ouvert
  pdfDoc: null,             // instance pdf.js du document ouvert
  currentPdfExercises: [],  // exercices détectés dans le document ouvert
  activePdfExId: null,      // exercice PDF ouvert dans la modale

  // Éditeurs CodeMirror
  cm: null,                 // éditeur du mode Code
  pcm: null                 // éditeur du mode Projet
};
